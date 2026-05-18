/**
 * BFS outbound-flow tracer for victim-submitted hack reports.
 *
 * Walks outbound ETH + internal + ERC-20 transfers from a root address,
 * recording each hop in hack_trace_hops, terminating at:
 *   - attribution_match: the recipient is already in our attribution graph
 *     as an exchange/mixer/bridge/sanctioned/etc. (the moat lighting up)
 *   - dust: amount below the per-token threshold (ignore drainer "test" sends)
 *   - depth: we've walked max_hops levels
 *   - still_moving: we ran out of budget (per-frontier cap or total-hop cap)
 *
 * Side effects per hop: a row in `hack_trace_hops` and an upsert of the
 * counterparty address into `addresses` + a victim-trace attribution row in
 * `address_attributions`. The counterparties join the moat layer; the toggle
 * on /graph filters them out of the industry-only view.
 */

import { and, eq, sql } from "drizzle-orm";
import {
  db,
  addresses,
  hackTraces,
  hackTraceHops,
  type HackTrace,
  type HackTraceTerminalReason,
  type AddressCategory,
} from "./db";
import {
  fetchNormalTxs,
  fetchInternalTxs,
  fetchTokenTransfers,
  fetchEthBalance,
  fetchEthPriceUsd,
  TraceableError,
} from "./etherscan";
import { upsertAttribution } from "./address-attribution";

const ETH_DUST_WEI = BigInt("10000000000000000"); // 0.01 ETH
const TOKEN_DUST_HUMAN: Record<string, number> = {
  // Known stablecoins → reject below $10 to filter drainer "test" pings.
  USDC: 10,
  USDT: 10,
  DAI: 10,
  WETH: 0.005,
};

const MAX_OUTBOUND_PER_ADDRESS = 20; // Top-N by value, biggest first.
const MAX_TOTAL_HOPS = 120;
const MAX_FRONTIER_SIZE = 60;

// Category values that should trigger a terminal_attribution_match — i.e.
// "the funds reached a known endpoint." DeFi protocols are excluded because
// a hop into Uniswap is still in transit. Treasuries / foundations get
// included because hitting one is informative (and rare).
const TERMINAL_CATEGORIES: AddressCategory[] = [
  "exchange",
  "mixer",
  "bridge",
  "sanctioned",
  "government-seized",
  "scam",
];

type OutboundEdge = {
  txHash: string;
  blockNumber: string;
  timestamp: Date;
  to: string;
  amountRaw: bigint;
  tokenSymbol: string;
  tokenAddress: string | null;
  tokenDecimals: number;
  amountUsdEstimate: number | null;
};

export async function runTrace(traceId: string): Promise<{
  status: "complete" | "failed";
  hopsExplored: number;
  terminalCount: number;
  failureReason?: string;
}> {
  const [trace] = await db
    .select()
    .from(hackTraces)
    .where(eq(hackTraces.id, traceId))
    .limit(1);
  if (!trace) throw new Error(`Trace ${traceId} not found`);
  if (trace.chain !== "ethereum") {
    return await markFailed(
      trace,
      `v1 supports ethereum mainnet only; got chain "${trace.chain}"`,
    );
  }

  await db
    .update(hackTraces)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(eq(hackTraces.id, traceId));

  let ethPriceUsd: number | null = null;
  try {
    ethPriceUsd = await fetchEthPriceUsd();
  } catch {
    // Non-fatal; we just won't compute USD valuations for ETH hops.
  }

  // Resolve / create the root address row up front so all hops have a stable
  // from_address_id at depth=1.
  const rootAddrId = await ensureAddressRow(
    trace.chain,
    trace.rootAddress.toLowerCase(),
    trace.victimLabel ?? null,
  );

  const visited = new Set<string>([trace.rootAddress.toLowerCase()]);
  let frontier: Array<{ addr: string; addrId: string }> = [
    { addr: trace.rootAddress.toLowerCase(), addrId: rootAddrId },
  ];

  let depth = 0;
  let totalHops = 0;
  let terminalCount = 0;

  try {
    while (depth < trace.maxHops && frontier.length > 0) {
      depth += 1;
      const nextFrontier: typeof frontier = [];

      for (const node of frontier) {
        if (totalHops >= MAX_TOTAL_HOPS) break;

        // Terminal check: if the frontier node itself is already a known
        // endpoint in our graph, mark it and don't expand further.
        const cat = await readAddressCategory(node.addrId);
        if (cat && TERMINAL_CATEGORIES.includes(cat)) {
          continue; // The hop INTO this address was already recorded with
                    // terminal_reason='attribution_match' when it was added.
        }

        const edges = await collectOutbound(node.addr, ethPriceUsd);
        // Sort by best-effort USD value descending; cap to top-N.
        edges.sort(
          (a, b) =>
            (b.amountUsdEstimate ?? Number(b.amountRaw) / 1e18) -
            (a.amountUsdEstimate ?? Number(a.amountRaw) / 1e18),
        );
        const top = edges.slice(0, MAX_OUTBOUND_PER_ADDRESS);

        for (const e of top) {
          if (totalHops >= MAX_TOTAL_HOPS) break;
          if (e.to === node.addr) continue; // self-loop
          if (isDust(e)) continue;

          const toAddrId = await ensureAddressRow(trace.chain, e.to, null);
          const toCat = await readAddressCategory(toAddrId);
          const terminalReason: HackTraceTerminalReason | null =
            toCat && TERMINAL_CATEGORIES.includes(toCat)
              ? "attribution_match"
              : null;

          await db
            .insert(hackTraceHops)
            .values({
              traceId,
              depth,
              fromAddressId: node.addrId,
              toAddressId: toAddrId,
              txHash: e.txHash,
              blockNumber: e.blockNumber,
              amountRaw: e.amountRaw.toString(),
              tokenSymbol: e.tokenSymbol,
              tokenAddress: e.tokenAddress,
              tokenDecimals: e.tokenDecimals,
              amountUsd:
                e.amountUsdEstimate != null
                  ? e.amountUsdEstimate.toFixed(2)
                  : null,
              txTimestamp: e.timestamp,
              terminalReason,
            })
            .onConflictDoNothing();
          totalHops += 1;

          // Write a victim-trace attribution row so the counterparty enters
          // the moat layer. label is null so harvester-curated labels aren't
          // clobbered; notes records the originating trace for provenance.
          //
          // Category is null for non-terminal hops — a hop into Uniswap or
          // Lido is just provenance, not a "hack-destination" claim. Only
          // terminal hits (exchange/mixer/bridge/sanctioned/government-
          // seized/scam) inherit their existing authoritative category.
          try {
            await upsertAttribution({
              chain: trace.chain,
              address: e.to,
              source: "victim-trace",
              sourceRef: `trace:${trace.publicId}`,
              sourceUrl: null,
              category: terminalReason === "attribution_match" ? toCat : null,
              confidence: 25,
              notes: `Reached via victim-trace ${trace.publicId} at depth ${depth}`,
              reportedAt: e.timestamp,
            });
          } catch {
            // Don't fail the trace if a single attribution write errors —
            // log and continue.
          }

          if (terminalReason) {
            terminalCount += 1;
          } else if (
            depth < trace.maxHops &&
            !visited.has(e.to) &&
            nextFrontier.length < MAX_FRONTIER_SIZE
          ) {
            visited.add(e.to);
            nextFrontier.push({ addr: e.to, addrId: toAddrId });
          }
        }
      }

      frontier = nextFrontier;
    }

    // Any unexpanded frontier at maxHops counts as still_moving — record a
    // synthetic hop row so the result page can show "tracking continues at
    // these addresses." Skip if we hit the depth cap cleanly with empty
    // frontier.
    if (frontier.length > 0 && depth >= trace.maxHops) {
      // Note these as terminal "depth" hops by labeling the existing edge
      // rows at the deepest depth that have no terminalReason. Cheap
      // single UPDATE; no extra rows required.
      await db
        .update(hackTraceHops)
        .set({ terminalReason: "depth" })
        .where(
          and(
            eq(hackTraceHops.traceId, traceId),
            eq(hackTraceHops.depth, depth),
            sql`${hackTraceHops.terminalReason} IS NULL`,
          ),
        );
    }

    await db
      .update(hackTraces)
      .set({
        status: "complete",
        hopsExplored: totalHops,
        terminalCount,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(hackTraces.id, traceId));

    return { status: "complete", hopsExplored: totalHops, terminalCount };
  } catch (err) {
    const reason =
      err instanceof TraceableError
        ? `${err.kind}: ${err.message}`
        : err instanceof Error
          ? err.message
          : "unknown error";
    return await markFailed(trace, reason, totalHops, terminalCount);
  }
}

async function markFailed(
  trace: HackTrace,
  reason: string,
  hopsExplored = 0,
  terminalCount = 0,
): Promise<{
  status: "failed";
  hopsExplored: number;
  terminalCount: number;
  failureReason: string;
}> {
  await db
    .update(hackTraces)
    .set({
      status: "failed",
      failureReason: reason,
      hopsExplored,
      terminalCount,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(hackTraces.id, trace.id));
  return { status: "failed", hopsExplored, terminalCount, failureReason: reason };
}

async function ensureAddressRow(
  chain: string,
  address: string,
  label: string | null,
): Promise<string> {
  const lower = address.toLowerCase();
  const [existing] = await db
    .select({ id: addresses.id })
    .from(addresses)
    .where(
      and(
        eq(addresses.chain, chain),
        sql`lower(${addresses.address}) = ${lower}`,
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [inserted] = await db
    .insert(addresses)
    .values({
      chain,
      address: lower,
      label,
      firstSeenAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: addresses.id });
  if (inserted) return inserted.id;

  const [raceRow] = await db
    .select({ id: addresses.id })
    .from(addresses)
    .where(
      and(
        eq(addresses.chain, chain),
        sql`lower(${addresses.address}) = ${lower}`,
      ),
    )
    .limit(1);
  if (!raceRow) throw new Error(`Could not upsert address row for ${lower}`);
  return raceRow.id;
}

async function readAddressCategory(
  addressId: string,
): Promise<AddressCategory | null> {
  const [row] = await db
    .select({ category: addresses.category })
    .from(addresses)
    .where(eq(addresses.id, addressId))
    .limit(1);
  return row?.category ?? null;
}

async function collectOutbound(
  address: string,
  ethPriceUsd: number | null,
): Promise<OutboundEdge[]> {
  const [normal, internal, tokens] = await Promise.all([
    fetchNormalTxs(address),
    fetchInternalTxs(address),
    fetchTokenTransfers(address),
  ]);

  const edges: OutboundEdge[] = [];

  for (const t of normal) {
    if (t.isError === "1") continue;
    if (t.from.toLowerCase() !== address) continue;
    if (!t.to) continue;
    const raw = BigInt(t.value);
    if (raw === 0n) continue;
    edges.push({
      txHash: t.hash,
      blockNumber: t.blockNumber,
      timestamp: new Date(Number(t.timeStamp) * 1000),
      to: t.to.toLowerCase(),
      amountRaw: raw,
      tokenSymbol: "ETH",
      tokenAddress: null,
      tokenDecimals: 18,
      amountUsdEstimate:
        ethPriceUsd != null ? (Number(raw) / 1e18) * ethPriceUsd : null,
    });
  }

  for (const t of internal) {
    if (t.isError === "1") continue;
    if (t.from.toLowerCase() !== address) continue;
    if (!t.to) continue;
    const raw = BigInt(t.value);
    if (raw === 0n) continue;
    edges.push({
      txHash: t.hash,
      blockNumber: t.blockNumber,
      timestamp: new Date(Number(t.timeStamp) * 1000),
      to: t.to.toLowerCase(),
      amountRaw: raw,
      tokenSymbol: "ETH",
      tokenAddress: null,
      tokenDecimals: 18,
      amountUsdEstimate:
        ethPriceUsd != null ? (Number(raw) / 1e18) * ethPriceUsd : null,
    });
  }

  for (const t of tokens) {
    if (t.from.toLowerCase() !== address) continue;
    if (!t.to) continue;
    const raw = BigInt(t.value);
    if (raw === 0n) continue;
    const decimals = Number(t.tokenDecimal) || 18;
    edges.push({
      txHash: t.hash,
      blockNumber: t.blockNumber,
      timestamp: new Date(Number(t.timeStamp) * 1000),
      to: t.to.toLowerCase(),
      amountRaw: raw,
      tokenSymbol: t.tokenSymbol || "?",
      tokenAddress: t.contractAddress.toLowerCase(),
      tokenDecimals: decimals,
      amountUsdEstimate: null, // No historical USD oracle in v1 for tokens.
    });
  }

  return edges;
}

function isDust(e: OutboundEdge): boolean {
  if (e.tokenSymbol === "ETH" && e.tokenAddress == null) {
    return e.amountRaw < ETH_DUST_WEI;
  }
  const threshold = TOKEN_DUST_HUMAN[e.tokenSymbol];
  if (threshold == null) return false; // Unknown tokens: keep them.
  const human = Number(e.amountRaw) / 10 ** e.tokenDecimals;
  return human < threshold;
}

/**
 * Best-effort "where is it today" snapshot for terminal addresses. Called by
 * the results page so the trace's terminal nodes can show current balance.
 * Doesn't write to the DB — purely for display.
 */
export async function fetchTerminalSnapshots(
  addressList: string[],
): Promise<Map<string, { ethBalanceWei: bigint; ethUsd: number | null }>> {
  const ethPrice = await fetchEthPriceUsd().catch(() => null);
  const out = new Map<string, { ethBalanceWei: bigint; ethUsd: number | null }>();
  for (const a of addressList) {
    try {
      const bal = await fetchEthBalance(a);
      const usd =
        ethPrice != null ? (Number(bal) / 1e18) * ethPrice : null;
      out.set(a.toLowerCase(), { ethBalanceWei: bal, ethUsd: usd });
    } catch {
      // Snapshot is nice-to-have; skip on error.
    }
  }
  return out;
}
