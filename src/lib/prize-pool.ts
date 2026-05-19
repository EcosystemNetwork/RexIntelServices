import { and, eq, desc, gte, lt, ne, sql } from "drizzle-orm";
import { db, submissions, intelVotes, subscribers } from "@/lib/db";
import type { SubmissionType } from "@/lib/submission-display";

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
    } else {
      // Unknown chain: log + leave explorerUrl null so the donate panel
      // doesn't render an unverifiable address with no explorer link. A
      // misconfigured PRIZE_POOL_CHAIN should fail loudly, not silently
      // show donors a wallet they can't sanity-check on-chain.
      console.warn(
        `[prize-pool] unknown PRIZE_POOL_CHAIN=${chain}; explorerUrl unset (add a case to getPrizePoolConfig)`,
      );
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
  // Production safety: a stale staging env var carrying PRIZE_POOL_MOCK_BALANCE
  // would publish a fake pool size to the leaderboard — donors might donate
  // real funds against a number that doesn't exist on-chain. Hard-ignore the
  // mock in prod and log loudly so the operator notices.
  if (mock && process.env.NODE_ENV === "production") {
    console.error(
      "[prize-pool] PRIZE_POOL_MOCK_BALANCE is set in production — ignoring; remove the env var to silence this warning",
    );
  } else if (mock) {
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
  // Banker's-round at the 3rd decimal so 12.999 USDC reads as 13.00 not
  // 12.99 (truncation). The schema stores 6 decimals; the display takes 2
  // so the rounded view never exceeds the underlying balance by more than
  // half a cent. half-to-even avoids systematic upward bias on .5 boundaries.
  if (decimals >= 2) {
    const halfStep = 10n ** BigInt(decimals - 2) / 2n; // 0.005 in the asset's unit
    const rest = abs % 10n ** BigInt(decimals - 2);
    let rounded = abs - rest;
    // banker's round: round half-to-even on the kept-cent digit
    if (rest > halfStep) {
      rounded += 10n ** BigInt(decimals - 2);
    } else if (rest === halfStep) {
      const centDigit = (abs / 10n ** BigInt(decimals - 2)) % 10n;
      if (centDigit % 2n !== 0n) {
        rounded += 10n ** BigInt(decimals - 2);
      }
    }
    const whole = rounded / base;
    const frac = (rounded % base).toString().padStart(decimals, "0").slice(0, 2);
    const result = frac === "00" ? whole.toString() : `${whole}.${frac}`;
    return negative ? `-${result}` : result;
  }
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
 * from `magic-auth.ts` for each of the top-3 submitter ids so the
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
  // Exact decimal math via bigint cents. Float math + .toFixed(2) is enough
  // for a $100 pool but starts drifting near the (38,6) numeric precision
  // the schema stores, and at settlement the leaderboard's displayed amount
  // must equal exactly what's about to be paid out — IEEE-754 splits like
  // 60/30/10-of-80% don't cleanly land on cents. Bigint guarantees
  // place1+place2+place3+rollover === poolAmount to the cent, with any
  // residual rounding distributed into rollover.
  const cents = parseDecimalToCents(poolAmount);
  if (cents === null || cents <= 0n) {
    return { place1: "0.00", place2: "0.00", place3: "0.00", rollover: "0.00" };
  }
  // 80% of pool is payable; 20% rolls over. Integer-divide to avoid
  // rounding-up the payable share.
  const payable = (cents * 80n) / 100n;
  const place1 = (payable * 60n) / 100n;
  const place2 = (payable * 30n) / 100n;
  const place3 = (payable * 10n) / 100n;
  // Any residual from the three integer divides flows into rollover so
  // place1+place2+place3+rollover === cents exactly.
  const rollover = cents - place1 - place2 - place3;
  return {
    place1: formatCents(place1),
    place2: formatCents(place2),
    place3: formatCents(place3),
    rollover: formatCents(rollover),
  };
}

/**
 * Top-5 waterfall split — the on-chain contract version. Splits 80% of
 * pool across 5 places at 50/25/15/7/3, leaves 20% rolling over as the
 * contract's residual balance. Math is exact bigint cents; the per-place
 * sum + rollover === poolAmount to the cent.
 *
 * Used by /api/cron/settle-monthly-prizes to compute the amounts passed
 * to IntelPrizePool.distribute() on-chain. The off-chain math is the
 * source of truth — the contract just records what it's told.
 */
export function computePayouts5(poolAmount: string): {
  place1: string;
  place2: string;
  place3: string;
  place4: string;
  place5: string;
  rollover: string;
} {
  const cents = parseDecimalToCents(poolAmount);
  if (cents === null || cents <= 0n) {
    return {
      place1: "0.00",
      place2: "0.00",
      place3: "0.00",
      place4: "0.00",
      place5: "0.00",
      rollover: "0.00",
    };
  }
  const payable = (cents * 80n) / 100n;
  const place1 = (payable * 50n) / 100n;
  const place2 = (payable * 25n) / 100n;
  const place3 = (payable * 15n) / 100n;
  const place4 = (payable * 7n) / 100n;
  const place5 = (payable * 3n) / 100n;
  const rollover = cents - place1 - place2 - place3 - place4 - place5;
  return {
    place1: formatCents(place1),
    place2: formatCents(place2),
    place3: formatCents(place3),
    place4: formatCents(place4),
    place5: formatCents(place5),
    rollover: formatCents(rollover),
  };
}

function parseDecimalToCents(s: string): bigint | null {
  if (!/^[0-9]+(\.[0-9]+)?$/.test(s.trim())) return null;
  const [whole, frac = ""] = s.trim().split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  try {
    return BigInt(whole) * 100n + BigInt(fracPadded);
  } catch {
    return null;
  }
}

function formatCents(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const abs = cents < 0n ? -cents : cents;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${sign}${whole}.${frac}`;
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
 * Top-N community submissions by vote count for a given month. Spans every
 * approved submission type (intel, capital, fellowship, grant, accelerator,
 * etc.) — anything the community submits via /submit competes in the same
 * pool. `loss_report` is excluded because victim self-reports are not
 * editorial intel and the digest/leaderboard pipeline deliberately walls
 * them off (see schema.ts LossReportPayload comment).
 *
 * Used by the public leaderboard, the prize-pool banner, the admin
 * dashboard, and the monthly settlement cron, so the four surfaces never
 * drift. Returns [] for callers that handle empty gracefully.
 *
 * Function name is preserved for backwards compatibility with existing
 * callers; "intel" here is the historical lane name, not a type filter.
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
  type: SubmissionType;
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
  // Self-vote exclusion: a voter whose subscriber email matches the
  // submission's submitter email is dropped from the count. Defense in
  // depth — the /vote/cast and /vote/confirm routes also reject these,
  // but the leaderboard is the surface that pays money, so it owns the
  // last word. Comparison is lower-cased on both sides.
  const rows = await db
    .select({
      publicId: submissions.publicId,
      type: submissions.type,
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
        sql`lower(${subscribers.email}) <> lower(${submissions.submitterEmail})`,
      ),
    )
    .where(
      and(
        // All community submission types compete in one pool. Loss reports
        // are the only exclusion — victim self-reports are walled off from
        // the editorial pipeline by design (see schema.ts LossReportPayload).
        ne(submissions.type, "loss_report"),
        eq(submissions.status, "approved"),
        gte(submissions.publishedAt, start),
        lt(submissions.publishedAt, end),
      ),
    )
    .groupBy(
      submissions.id,
      submissions.publicId,
      submissions.type,
      submissions.payload,
      submissions.submitterEmail,
      submissions.submitterHandle,
    )
    .orderBy(desc(sql`count(${subscribers.id})`))
    .limit(opts.limit);
  return rows as LeaderboardRow[];
}
