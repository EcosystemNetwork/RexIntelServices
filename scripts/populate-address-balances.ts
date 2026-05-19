/**
 * Populate `addresses.balance_estimate_usd` + `native_amount` + `native_symbol`
 * for unpriced rows so the /graph header counter ("Total value tracked")
 * reflects the full corpus instead of only the 11 hand-priced wallets.
 *
 * Sources:
 *   - EVM chains: public JSON-RPC `eth_getBalance` (no API key)
 *   - Bitcoin:    mempool.space `/api/address/{addr}` (no API key, free)
 *   - Tron:       trongrid.io public account-info endpoint (no API key)
 *   - Other chains: skipped for now — add a handler when address volume justifies
 *
 * Native-token USD prices: CoinGecko free `/simple/price` endpoint, fetched
 * once at script start and held for the whole run.
 *
 * Run:
 *   npx tsx scripts/populate-address-balances.ts --dry-run                 # preview
 *   npx tsx scripts/populate-address-balances.ts --limit 50                # cap fetches
 *   npx tsx scripts/populate-address-balances.ts --chain ethereum
 *   npx tsx scripts/populate-address-balances.ts --priority-only           # category != NULL only
 *   npx tsx scripts/populate-address-balances.ts --delay 250
 *
 * Idempotent — skips rows that already have `balance_estimate_usd` set
 * unless `--repopulate` is passed. Polite to upstream — defaults to 250ms
 * between fetches.
 */
import "dotenv/config";
import { and, asc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db, addresses, intelAddresses } from "../src/lib/db";

type Args = {
  dryRun: boolean;
  limit: number | null;
  chain: string | null;
  priorityOnly: boolean;
  repopulate: boolean;
  delayMs: number;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const idxLimit = argv.findIndex((a) => a === "--limit");
  const limit =
    idxLimit >= 0 && argv[idxLimit + 1] ? Math.max(1, Number(argv[idxLimit + 1])) : null;
  const idxChain = argv.findIndex((a) => a === "--chain");
  const chain = idxChain >= 0 && argv[idxChain + 1] ? argv[idxChain + 1] : null;
  const idxDelay = argv.findIndex((a) => a === "--delay");
  const delayMs =
    idxDelay >= 0 && argv[idxDelay + 1]
      ? Math.max(0, Number(argv[idxDelay + 1]))
      : 250;
  return {
    dryRun: argv.includes("--dry-run"),
    limit,
    chain,
    priorityOnly: argv.includes("--priority-only"),
    repopulate: argv.includes("--repopulate"),
    delayMs,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// EVM chain → public JSON-RPC endpoint + native symbol + coingecko id.
// Fallback list per chain — first that returns a non-5xx response wins.
// Public RPC endpoints rotate availability constantly, so retrying across
// multiple hosts is the difference between "works" and "all errored."
const EVM_CHAINS: Record<
  string,
  { rpcUrls: string[]; symbol: string; coingeckoId: string }
> = {
  ethereum: {
    rpcUrls: [
      "https://cloudflare-eth.com",
      "https://ethereum.publicnode.com",
      "https://rpc.ankr.com/eth",
      "https://1rpc.io/eth",
      "https://eth.llamarpc.com",
    ],
    symbol: "ETH",
    coingeckoId: "ethereum",
  },
  bsc: {
    rpcUrls: [
      "https://bsc-dataseed.bnbchain.org",
      "https://bsc.publicnode.com",
      "https://rpc.ankr.com/bsc",
    ],
    symbol: "BNB",
    coingeckoId: "binancecoin",
  },
  polygon: {
    rpcUrls: ["https://polygon-rpc.com", "https://polygon.publicnode.com"],
    symbol: "MATIC",
    coingeckoId: "matic-network",
  },
  arbitrum: {
    rpcUrls: [
      "https://arb1.arbitrum.io/rpc",
      "https://arbitrum-one.publicnode.com",
    ],
    symbol: "ETH",
    coingeckoId: "ethereum",
  },
  optimism: {
    rpcUrls: [
      "https://mainnet.optimism.io",
      "https://optimism.publicnode.com",
    ],
    symbol: "ETH",
    coingeckoId: "ethereum",
  },
  base: {
    rpcUrls: ["https://mainnet.base.org", "https://base.publicnode.com"],
    symbol: "ETH",
    coingeckoId: "ethereum",
  },
  avalanche: {
    rpcUrls: [
      "https://api.avax.network/ext/bc/C/rpc",
      "https://avalanche-c-chain.publicnode.com",
    ],
    symbol: "AVAX",
    coingeckoId: "avalanche-2",
  },
  "ethereum-classic": {
    rpcUrls: ["https://etc.rivet.link", "https://etc.etcdesktop.com"],
    symbol: "ETC",
    coingeckoId: "ethereum-classic",
  },
};

const NON_EVM = {
  bitcoin: { symbol: "BTC", coingeckoId: "bitcoin", decimals: 8 },
  litecoin: { symbol: "LTC", coingeckoId: "litecoin", decimals: 8 },
  "bitcoin-cash": { symbol: "BCH", coingeckoId: "bitcoin-cash", decimals: 8 },
  dogecoin: { symbol: "DOGE", coingeckoId: "dogecoin", decimals: 8 },
  tron: { symbol: "TRX", coingeckoId: "tron", decimals: 6 },
};

async function fetchCoinGeckoPrices(ids: string[]): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd`;
  const res = await fetch(url, {
    headers: { "user-agent": "RexIntel-balance-fetcher/1.0" },
  });
  if (!res.ok) throw new Error(`CoinGecko failed: ${res.status}`);
  const json = (await res.json()) as Record<string, { usd: number }>;
  const out: Record<string, number> = {};
  for (const id of ids) {
    if (json[id]?.usd) out[id] = json[id].usd;
  }
  return out;
}

async function fetchEvmBalance(
  chainSlug: string,
  address: string,
): Promise<number> {
  const cfg = EVM_CHAINS[chainSlug];
  if (!cfg) throw new Error(`no EVM RPC for ${chainSlug}`);
  const errors: string[] = [];
  for (const rpcUrl of cfg.rpcUrls) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getBalance",
          params: [address, "latest"],
        }),
      });
      if (!res.ok) {
        errors.push(`${new URL(rpcUrl).hostname} ${res.status}`);
        continue;
      }
      const json = (await res.json()) as {
        result?: string;
        error?: { message: string };
      };
      if (json.error) {
        errors.push(`${new URL(rpcUrl).hostname} ${json.error.message}`);
        continue;
      }
      if (!json.result) {
        errors.push(`${new URL(rpcUrl).hostname} no-result`);
        continue;
      }
      const wei = BigInt(json.result);
      return Number(wei) / 1e18;
    } catch (err) {
      errors.push(
        `${new URL(rpcUrl).hostname} ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  throw new Error(`all RPC failed for ${chainSlug}: ${errors.join(" | ")}`);
}

async function fetchBtcFamilyBalance(
  chainSlug: string,
  address: string,
): Promise<number> {
  if (chainSlug !== "bitcoin") {
    throw new Error(`btc-family fetcher only handles bitcoin currently`);
  }
  // Fallback list — mempool.space first (most informative), blockstream.info
  // second (laxer rate limits). Both return the same shape.
  const hosts = [
    "https://mempool.space/api/address",
    "https://blockstream.info/api/address",
  ];
  const errors: string[] = [];
  for (const host of hosts) {
    try {
      const res = await fetch(`${host}/${address}`, {
        headers: { "user-agent": "RexIntel-balance-fetcher/1.0" },
      });
      if (!res.ok) {
        errors.push(`${new URL(host).hostname} ${res.status}`);
        continue;
      }
      const json = (await res.json()) as {
        chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
      };
      const funded = json.chain_stats?.funded_txo_sum ?? 0;
      const spent = json.chain_stats?.spent_txo_sum ?? 0;
      return (funded - spent) / 1e8; // sats → BTC
    } catch (err) {
      errors.push(
        `${new URL(host).hostname} ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  throw new Error(`all BTC fetchers failed: ${errors.join(" | ")}`);
}

async function fetchTronBalance(address: string): Promise<number> {
  const url = `https://api.trongrid.io/v1/accounts/${address}`;
  const res = await fetch(url, {
    headers: { "user-agent": "RexIntel-balance-fetcher/1.0" },
  });
  if (!res.ok) throw new Error(`trongrid ${res.status}`);
  const json = (await res.json()) as { data?: Array<{ balance?: number }> };
  const sun = json.data?.[0]?.balance ?? 0;
  return sun / 1e6; // sun → TRX
}

async function fetchBalanceForChain(
  chainSlug: string,
  address: string,
): Promise<number | null> {
  try {
    if (EVM_CHAINS[chainSlug]) return await fetchEvmBalance(chainSlug, address);
    if (chainSlug === "bitcoin") return await fetchBtcFamilyBalance(chainSlug, address);
    if (chainSlug === "tron") return await fetchTronBalance(address);
    return null;
  } catch (err) {
    throw err;
  }
}

function chainToNative(
  chainSlug: string,
): { symbol: string; coingeckoId: string } | null {
  if (EVM_CHAINS[chainSlug]) {
    return {
      symbol: EVM_CHAINS[chainSlug].symbol,
      coingeckoId: EVM_CHAINS[chainSlug].coingeckoId,
    };
  }
  if (chainSlug in NON_EVM) {
    const n = (NON_EVM as Record<string, { symbol: string; coingeckoId: string }>)[chainSlug];
    return n;
  }
  return null;
}

async function main() {
  const args = parseArgs();

  // Collect every coingecko-id we might need so we can fetch prices once.
  const supportedChains = new Set<string>([
    ...Object.keys(EVM_CHAINS),
    "bitcoin",
    "tron",
  ]);
  const allCoingeckoIds = new Set<string>();
  for (const slug of supportedChains) {
    const n = chainToNative(slug);
    if (n) allCoingeckoIds.add(n.coingeckoId);
  }

  console.log("Fetching CoinGecko prices…");
  const prices = await fetchCoinGeckoPrices([...allCoingeckoIds]);
  console.log("Prices:");
  for (const [id, p] of Object.entries(prices)) {
    console.log(`  ${id.padEnd(20)} $${p.toLocaleString()}`);
  }

  // Build the candidate set. By default: every address on a supported chain
  // whose balance_estimate_usd is NULL (or any, with --repopulate).
  const conditions = [
    args.chain ? eq(addresses.chain, args.chain) : undefined,
    args.repopulate ? undefined : isNull(addresses.balanceEstimateUsd),
    args.priorityOnly ? isNotNull(addresses.category) : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({
      id: addresses.id,
      chain: addresses.chain,
      address: addresses.address,
      category: addresses.category,
    })
    .from(addresses)
    .where(conditions.length > 0 ? and(...(conditions as never[])) : undefined)
    .orderBy(asc(addresses.createdAt));

  const candidates = rows.filter((r) => supportedChains.has(r.chain));
  console.log(
    `\n${candidates.length} unpriced address(es) on supported chains` +
      (args.chain ? ` (chain=${args.chain})` : "") +
      (args.priorityOnly ? " (priority-only)" : "") +
      (args.limit ? `, capping at ${args.limit}` : ""),
  );

  const slice = args.limit ? candidates.slice(0, args.limit) : candidates;
  let priced = 0;
  let zeroBalance = 0;
  let errored = 0;

  for (const row of slice) {
    const native = chainToNative(row.chain);
    if (!native) {
      console.log(`  · skip ${row.chain}:${row.address.slice(0, 12)}… — no native config`);
      continue;
    }
    const usdPrice = prices[native.coingeckoId];
    if (!usdPrice) {
      console.log(`  · skip ${row.chain}:${row.address.slice(0, 12)}… — no USD price`);
      continue;
    }

    try {
      const balance = await fetchBalanceForChain(row.chain, row.address);
      if (balance == null) {
        console.log(`  · skip ${row.chain}:${row.address.slice(0, 12)}… — no fetcher`);
        continue;
      }
      const usd = balance * usdPrice;
      const label = balance === 0 ? "[zero]" : `${balance.toFixed(4)} ${native.symbol} ≈ $${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      process.stdout.write(
        `  · ${row.chain.padEnd(10)} ${row.address.slice(0, 18)}… ${label}`,
      );
      if (!args.dryRun) {
        await db
          .update(addresses)
          .set({
            balanceEstimateUsd: String(usd),
            nativeAmount: String(balance),
            nativeSymbol: native.symbol,
            lastVerifiedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(addresses.id, row.id));
      }
      console.log(args.dryRun ? " [dry-run]" : "");
      if (balance === 0) zeroBalance++;
      else priced++;
    } catch (err) {
      errored++;
      console.log(
        `  · ${row.chain.padEnd(10)} ${row.address.slice(0, 18)}… [error ${err instanceof Error ? err.message : String(err)}]`,
      );
    }
    if (args.delayMs > 0) await sleep(args.delayMs);
  }

  console.log(
    `\nDone: priced=${priced} zero-balance=${zeroBalance} errored=${errored} dryRun=${args.dryRun}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
