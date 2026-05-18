import { and, eq, desc, gte, lt, sql } from "drizzle-orm";
import { db, submissions, intelVotes, subscribers } from "@/lib/db";

/**
 * Community prize pool config + balance fetcher.
 *
 * Pool lives on-chain at a single wallet RexIntel controls. We don't
 * custody anything off-chain — donations flow direct to the wallet, the
 * balance is read live from RPC. v1 default is USDC on Base for low gas
 * + price-stable + crypto-native.
 *
 * Env vars:
 *   PRIZE_POOL_ADDRESS           — wallet receiving donations (0x…)
 *   PRIZE_POOL_CHAIN             — "base" (default) | "base-sepolia" | "ethereum" | "solana"
 *                                  v0 ships with base-sepolia + ETH so the pool
 *                                  has no real-money / sweepstakes exposure.
 *   PRIZE_POOL_ASSET             — "USDC" (default) | "ETH" | "BTC"
 *   PRIZE_POOL_TOKEN_CONTRACT    — ERC-20 contract, overrides the USDC default
 *   PRIZE_POOL_RPC_URL           — JSON-RPC endpoint (e.g. https://mainnet.base.org,
 *                                  https://sepolia.base.org for base-sepolia)
 *   PRIZE_POOL_MOCK_BALANCE      — dev/staging override, returns this verbatim
 *
 * The fetcher caches results in-process for 60 seconds so the leaderboard
 * doesn't hammer the RPC on every page load.
 */

// USDC on Base (mainnet). Bridged-USDC contract from Circle.
const USDC_BASE_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;

export type PrizePoolConfig = {
  walletAddress: string | null;
  chain: string;
  asset: string;
  tokenContract: string | null;
  decimals: number;
  rpcUrl: string | null;
  /** URL on a block explorer where anyone can verify the pool history. */
  explorerUrl: string | null;
};

export function getPrizePoolConfig(): PrizePoolConfig {
  const walletAddress = process.env.PRIZE_POOL_ADDRESS || null;
  const chain = (process.env.PRIZE_POOL_CHAIN || "base").toLowerCase();
  const asset = (process.env.PRIZE_POOL_ASSET || "USDC").toUpperCase();
  const tokenContract =
    process.env.PRIZE_POOL_TOKEN_CONTRACT ||
    (chain === "base" && asset === "USDC" ? USDC_BASE_CONTRACT : null);
  const decimals = asset === "USDC" ? USDC_DECIMALS : 18;
  const rpcUrl =
    process.env.PRIZE_POOL_RPC_URL ||
    (chain === "base"
      ? "https://mainnet.base.org"
      : chain === "base-sepolia"
        ? "https://sepolia.base.org"
        : null);

  let explorerUrl: string | null = null;
  if (walletAddress) {
    if (chain === "base") {
      explorerUrl = `https://basescan.org/address/${walletAddress}`;
    } else if (chain === "base-sepolia") {
      explorerUrl = `https://sepolia.basescan.org/address/${walletAddress}`;
    } else if (chain === "ethereum") {
      explorerUrl = `https://etherscan.io/address/${walletAddress}`;
    }
  }

  return {
    walletAddress,
    chain,
    asset,
    tokenContract,
    decimals,
    rpcUrl,
    explorerUrl,
  };
}

export type PoolBalance = {
  /** Decimal string in the asset unit (e.g. "1234.56" for $1,234.56 USDC). */
  amount: string;
  asset: string;
  chain: string;
  /** Whether this value came from a live on-chain read or a mock fallback. */
  source: "live" | "mock" | "unconfigured";
  fetchedAt: Date;
};

type CacheEntry = { value: PoolBalance; until: number };
let _cache: CacheEntry | null = null;
const CACHE_MS = 60_000;

export async function fetchPoolBalance(opts?: {
  bypassCache?: boolean;
}): Promise<PoolBalance> {
  const now = Date.now();
  if (!opts?.bypassCache && _cache && _cache.until > now) {
    return _cache.value;
  }

  const config = getPrizePoolConfig();
  const mock = process.env.PRIZE_POOL_MOCK_BALANCE;
  if (mock) {
    const value: PoolBalance = {
      amount: mock,
      asset: config.asset,
      chain: config.chain,
      source: "mock",
      fetchedAt: new Date(now),
    };
    _cache = { value, until: now + CACHE_MS };
    return value;
  }

  if (!config.walletAddress || !config.rpcUrl) {
    const value: PoolBalance = {
      amount: "0",
      asset: config.asset,
      chain: config.chain,
      source: "unconfigured",
      fetchedAt: new Date(now),
    };
    _cache = { value, until: now + CACHE_MS };
    return value;
  }

  try {
    let raw: bigint;
    if (config.tokenContract) {
      raw = await fetchErc20Balance({
        rpcUrl: config.rpcUrl,
        tokenContract: config.tokenContract,
        walletAddress: config.walletAddress,
      });
    } else {
      raw = await fetchNativeBalance({
        rpcUrl: config.rpcUrl,
        walletAddress: config.walletAddress,
      });
    }
    const amount = formatUnits(raw, config.decimals);
    const value: PoolBalance = {
      amount,
      asset: config.asset,
      chain: config.chain,
      source: "live",
      fetchedAt: new Date(now),
    };
    _cache = { value, until: now + CACHE_MS };
    return value;
  } catch (e) {
    console.warn("[prize-pool] balance fetch failed, returning 0:", e);
    const value: PoolBalance = {
      amount: "0",
      asset: config.asset,
      chain: config.chain,
      source: "unconfigured",
      fetchedAt: new Date(now),
    };
    // Cache the failure for a short window so we don't hammer a broken RPC.
    _cache = { value, until: now + 15_000 };
    return value;
  }
}

async function rpcCall(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    // Short timeout so a slow RPC doesn't block the page render.
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`RPC ${method} HTTP ${res.status}`);
  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  if (typeof json.result !== "string") throw new Error(`RPC ${method}: no result`);
  return json.result;
}

async function fetchNativeBalance(args: {
  rpcUrl: string;
  walletAddress: string;
}): Promise<bigint> {
  const hex = await rpcCall(args.rpcUrl, "eth_getBalance", [
    args.walletAddress,
    "latest",
  ]);
  return BigInt(hex);
}

// balanceOf(address) selector = 0x70a08231; pad the address to 32 bytes.
const BALANCE_OF_SELECTOR = "0x70a08231";

async function fetchErc20Balance(args: {
  rpcUrl: string;
  tokenContract: string;
  walletAddress: string;
}): Promise<bigint> {
  const addr = args.walletAddress.toLowerCase().replace(/^0x/, "");
  if (addr.length !== 40) throw new Error("invalid wallet address");
  const data = `${BALANCE_OF_SELECTOR}${"0".repeat(24)}${addr}`;
  const hex = await rpcCall(args.rpcUrl, "eth_call", [
    { to: args.tokenContract, data },
    "latest",
  ]);
  return BigInt(hex);
}

function formatUnits(raw: bigint, decimals: number): string {
  if (decimals === 0) return raw.toString();
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 2);
  const result = fracStr === "00" ? whole.toString() : `${whole}.${fracStr}`;
  return negative ? `-${result}` : result;
}

/**
 * The committed payout split: top-3 of 80% pool (60/30/10), 20% rolls
 * to next month. Encoded as a function so we can derive amounts from any
 * pool snapshot without scattering the rule.
 *
 * NOTE for future settlement code: when the monthly settlement is wired
 * (writing a row to `monthly_prizes`), it must also call `awardPrizeWin`
 * from `circle-auth.ts` for each of the top-3 submitter ids so the
 * `prize_win_first/second/third` contribution events land in the ledger.
 * Without that call the payout still pays out USDC, but the recipient's
 * Trust score doesn't reflect the win.
 */
export function computePayouts(poolAmount: string): {
  place1: string;
  place2: string;
  place3: string;
  rollover: string;
} {
  const n = Number(poolAmount);
  if (!Number.isFinite(n) || n <= 0) {
    return { place1: "0", place2: "0", place3: "0", rollover: "0" };
  }
  const payable = n * 0.8;
  return {
    place1: (payable * 0.6).toFixed(2),
    place2: (payable * 0.3).toFixed(2),
    place3: (payable * 0.1).toFixed(2),
    rollover: (n * 0.2).toFixed(2),
  };
}

/** UTC "YYYY-MM" — the canonical leaderboard month bucket. */
export function currentYearMonth(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** Inclusive start, exclusive end, both UTC. Used for vote SQL ranges. */
export function monthBounds(yearMonth: string): { start: Date; end: Date } {
  const [yearStr, monthStr] = yearMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  return { start, end };
}

/** EVM addresses are stored lowercased so two payouts to the same wallet
 *  dedupe and joins to the addresses graph hit. Pass-through for non-EVM
 *  strings. */
export function normalizeWalletAddress(addr: string): string {
  const trimmed = addr.trim();
  return /^0x[0-9a-fA-F]{40}$/.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}

/**
 * Top-N intel by vote count for a given month. Used by both the public
 * intel-page banner and the admin dashboard so the two views never drift.
 * Returns [] for callers that handle empty gracefully.
 *
 * Sybil guard: only votes from subscribers who existed at least
 * VOTE_COOLING_HOURS hours before the vote was cast count toward the
 * leaderboard. Mass-create-N-emails-and-mass-vote attacks fall off cleanly
 * because every fresh subscriber's vote is unqualified. Legit users who
 * sign up specifically to vote see their vote recorded immediately in the
 * "you voted" UI, but the leaderboard rank waits out the cooling window.
 */
export const VOTE_COOLING_HOURS = 24;

export type LeaderboardRow = {
  publicId: string;
  payload: unknown;
  submitterEmail: string | null;
  submitterHandle: string | null;
  voteCount: number;
};

export async function getMonthlyTopIntel(opts: {
  yearMonth?: string;
  limit: number;
}): Promise<LeaderboardRow[]> {
  const ym = opts.yearMonth ?? currentYearMonth();
  const { start, end } = monthBounds(ym);
  // Inline the cooling-off check in the JOIN condition so unqualified votes
  // drop out before COUNT instead of inflating the aggregate. Using
  // INTERVAL keeps the comparison server-side.
  const coolingInterval = sql.raw(
    `INTERVAL '${VOTE_COOLING_HOURS} hours'`,
  );
  const rows = await db
    .select({
      publicId: submissions.publicId,
      payload: submissions.payload,
      submitterEmail: submissions.submitterEmail,
      submitterHandle: submissions.submitterHandle,
      // Count the joined subscribers.id rather than intelVotes.subscriberId
      // so the cooling-off LEFT JOIN actually drops unqualified votes from
      // the aggregate. An unqualified vote yields subscribers.id IS NULL
      // and count() ignores NULLs.
      voteCount: sql<number>`count(${subscribers.id})::int`,
    })
    .from(submissions)
    .leftJoin(
      intelVotes,
      and(
        eq(intelVotes.submissionId, submissions.id),
        gte(intelVotes.votedAt, start),
        lt(intelVotes.votedAt, end),
      ),
    )
    .leftJoin(
      subscribers,
      and(
        eq(subscribers.id, intelVotes.subscriberId),
        sql`${subscribers.createdAt} <= ${intelVotes.votedAt} - ${coolingInterval}`,
      ),
    )
    .where(
      and(
        eq(submissions.type, "intel"),
        eq(submissions.status, "approved"),
        gte(submissions.publishedAt, start),
        lt(submissions.publishedAt, end),
      ),
    )
    .groupBy(
      submissions.id,
      submissions.publicId,
      submissions.payload,
      submissions.submitterEmail,
      submissions.submitterHandle,
    )
    .orderBy(desc(sql`count(${subscribers.id})`))
    .limit(opts.limit);
  return rows;
}
