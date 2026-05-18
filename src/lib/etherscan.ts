/**
 * Etherscan v1 client for the victim-trace runner. Wraps the three endpoints
 * the tracer needs (txlist, txlistinternal, tokentx) plus current balance and
 * ETH/USD price, with a global rate-limit semaphore.
 *
 * Free tier: 5 req/sec, 100k req/day. We cap at 4 req/sec to leave headroom
 * for parallel traces. Paid tier shifts the cap via ETHERSCAN_RPS env var.
 *
 * Errors are normalized so the tracer can distinguish "address has no txs"
 * (returns []) from "rate-limited / network" (throws TraceableError). The
 * runner catches TraceableError and marks the trace `failed` with a reason
 * the user sees on the result page — we don't silently drop hops.
 */

const BASE_URL = "https://api.etherscan.io/api";

const RPS = Math.max(1, Number(process.env.ETHERSCAN_RPS ?? "4"));
const MIN_INTERVAL_MS = Math.ceil(1000 / RPS);

let lastRequestAt = 0;
async function rateLimit(): Promise<void> {
  const now = Date.now();
  const wait = lastRequestAt + MIN_INTERVAL_MS - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

export class TraceableError extends Error {
  constructor(
    message: string,
    readonly kind: "rate_limit" | "network" | "api" | "missing_key",
  ) {
    super(message);
    this.name = "TraceableError";
  }
}

function apiKey(): string {
  const k = process.env.ETHERSCAN_API_KEY;
  if (!k) {
    throw new TraceableError(
      "ETHERSCAN_API_KEY is not set — register a free key at etherscan.io/myapikey and add it to .env.local",
      "missing_key",
    );
  }
  return k;
}

type EtherscanEnvelope<T> = {
  status: "0" | "1";
  message: string;
  result: T;
};

async function call<T>(params: Record<string, string>): Promise<T> {
  await rateLimit();
  const url = new URL(BASE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("apikey", apiKey());

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch (e) {
    throw new TraceableError(
      `Network error talking to Etherscan: ${e instanceof Error ? e.message : "unknown"}`,
      "network",
    );
  }

  if (!res.ok) {
    throw new TraceableError(
      `Etherscan HTTP ${res.status} ${res.statusText}`,
      res.status === 429 ? "rate_limit" : "network",
    );
  }

  const json = (await res.json()) as EtherscanEnvelope<T>;

  // Etherscan returns status="0" with message "No transactions found" for an
  // empty address — that's a normal trace result, not an error. The result
  // payload in that case is the string "No transactions found"; the tracer
  // treats anything not-an-array as empty.
  if (json.status === "0") {
    const msg = json.message ?? "";
    if (/no transactions found/i.test(msg)) {
      return [] as unknown as T;
    }
    if (/rate limit|max rate/i.test(msg)) {
      throw new TraceableError(`Etherscan rate-limited: ${msg}`, "rate_limit");
    }
    throw new TraceableError(`Etherscan error: ${msg}`, "api");
  }

  return json.result;
}

// ---------------------------------------------------------------------------
// Endpoint wrappers
// ---------------------------------------------------------------------------

export type EthTx = {
  hash: string;
  blockNumber: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string; // wei
  contractAddress: string;
  isError: "0" | "1";
};

export type InternalTx = {
  hash: string;
  blockNumber: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  isError: "0" | "1";
};

export type TokenTransfer = {
  hash: string;
  blockNumber: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string; // raw token units (base * 10^decimals)
  contractAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
};

/**
 * Normal external ETH transfers from address X. Includes contract calls; the
 * tracer filters those out by checking `value > 0` since a 0-value call isn't
 * a fund movement we care about for tracing.
 */
export async function fetchNormalTxs(
  address: string,
  startblock = 0,
  endblock = 99_999_999,
  page = 1,
  offset = 1_000,
): Promise<EthTx[]> {
  const r = await call<EthTx[] | string>({
    module: "account",
    action: "txlist",
    address,
    startblock: String(startblock),
    endblock: String(endblock),
    page: String(page),
    offset: String(offset),
    sort: "asc",
  });
  return Array.isArray(r) ? r : [];
}

/**
 * Internal ETH transfers (movements via contract calls). The drain
 * transaction from a victim wallet is often an external tx, but the *next*
 * hop is frequently a contract-mediated payout — internal txs catch those.
 */
export async function fetchInternalTxs(
  address: string,
  startblock = 0,
  endblock = 99_999_999,
  page = 1,
  offset = 1_000,
): Promise<InternalTx[]> {
  const r = await call<InternalTx[] | string>({
    module: "account",
    action: "txlistinternal",
    address,
    startblock: String(startblock),
    endblock: String(endblock),
    page: String(page),
    offset: String(offset),
    sort: "asc",
  });
  return Array.isArray(r) ? r : [];
}

/**
 * ERC-20 token transfers from/to address X. Most modern hacks move
 * USDC/USDT/WETH, not raw ETH — without this endpoint the tracer would miss
 * the bulk of the actual flow.
 */
export async function fetchTokenTransfers(
  address: string,
  startblock = 0,
  endblock = 99_999_999,
  page = 1,
  offset = 1_000,
): Promise<TokenTransfer[]> {
  const r = await call<TokenTransfer[] | string>({
    module: "account",
    action: "tokentx",
    address,
    startblock: String(startblock),
    endblock: String(endblock),
    page: String(page),
    offset: String(offset),
    sort: "asc",
  });
  return Array.isArray(r) ? r : [];
}

export async function fetchEthBalance(address: string): Promise<bigint> {
  const r = await call<string>({
    module: "account",
    action: "balance",
    address,
    tag: "latest",
  });
  return BigInt(r);
}

export async function fetchEthPriceUsd(): Promise<number | null> {
  type Px = { ethusd: string; ethusd_timestamp: string };
  try {
    const r = await call<Px>({ module: "stats", action: "ethprice" });
    const n = Number(r.ethusd);
    return Number.isFinite(n) ? n : null;
  } catch (e) {
    // Price is nice-to-have, not load-bearing — let the trace finish even if
    // the price endpoint is rate-limited.
    if (e instanceof TraceableError && e.kind === "rate_limit") return null;
    throw e;
  }
}
