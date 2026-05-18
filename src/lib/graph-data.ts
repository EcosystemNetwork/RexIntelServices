import { and, desc, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";
import {
  db,
  submissions,
  addresses,
  intelAddresses,
  type AddressCategory,
  type AddressOwnerKind,
  type AddressAttributionSource,
} from "./db";
import type { IntelPayload } from "./db/schema";
import { CHAIN_SLUG_SET } from "./chains";
import { SOURCE_PRECEDENCE } from "./address-attribution";

/**
 * Public address-graph data layer. Shared by /api/graph (JSON) and /graph
 * (server-rendered page). One file owns filter semantics + node-cap budget
 * so both surfaces stay consistent.
 *
 * Two view modes:
 *   - incidents      : incident-anchored only (backwards compatible default)
 *   - institutional  : categorized addresses (OFAC, exchanges, foundations)
 *   - combined       : both, with incidents prioritized for the node cap
 *
 * Node cap defends against react-force-graph-2d collapsing past ~1k nodes
 * and keeps the page legible. When over cap, we keep highest-priority items
 * (incidents first, then sanctions sources, then curated, then community).
 */

const NODE_CAP = 600;
const ADDRESS_CAP = 500;

export type IncidentNode = {
  id: string;
  kind: "incident";
  publicId: string;
  headline: string;
  severity: IntelPayload["severity"];
  intelKind: IntelPayload["kind"];
  publishedAt: string | null;
  category?: string;
};

export type AddressNode = {
  id: string;
  kind: "address";
  chain: string;
  address: string;
  label: string | null;
  category: AddressCategory | null;
  ownerName: string | null;
  ownerKind: AddressOwnerKind | null;
  primarySource: AddressAttributionSource | null;
  confidence: number | null;
};

export type GraphNode = IncidentNode | AddressNode;

export type GraphEdge =
  | {
      kind: "incident-address";
      source: string;
      target: string;
      role: "subject" | "counterparty" | "observed";
    }
  | {
      kind: "address-address";
      source: string;
      target: string;
      weight: number;
    }
  | {
      kind: "owner-cluster";
      source: string;
      target: string;
      ownerName: string;
    };

export type GraphMeta = {
  window: number | null;
  kind: string;
  view: GraphView;
  chain: string | null;
  category: AddressCategory | null;
  nodeCount: number;
  edgeCount: number;
  incidentCount: number;
  addressCount: number;
  categorizedCount: number;
  // Echoed back so the rendered UI can show "+N user-reported" when the
  // toggle was on, and a hint to enable the toggle when it was off but
  // user-reported addresses exist out of view.
  includeUserReported: boolean;
  generatedAt: string;
};

export type GraphData = {
  meta: GraphMeta;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type LostWalletRow = {
  chain: string;
  address: string;
  label: string | null;
  ownerName: string | null;
  balanceEstimateUsd: number;
};

export type LostCryptoStats = {
  walletCount: number;
  totalUsd: number;
  byChain: Array<{ chain: string; walletCount: number; totalUsd: number }>;
  top: LostWalletRow[];
};

export type ValueStatsBucket = {
  // Category key as stored on addresses.category — "lost", "government-seized",
  // "sanctioned", "hack-source", etc. Or "other" for addresses with no
  // category but a populated USD balance.
  category: string;
  walletCount: number;
  totalUsd: number;
};

export type ValueTokenBucket = {
  // Uppercase token ticker — BTC, ETH, USDT, etc.
  symbol: string;
  // Sum of native_amount across all rows tagged with this symbol.
  totalAmount: number;
  walletCount: number;
  // Sum of balance_estimate_usd for those same rows (when populated).
  totalUsd: number;
};

export type ValueStats = {
  // Sum of balance_estimate_usd across every address row that has one set.
  totalUsd: number;
  // Number of address rows with a populated USD value.
  walletCount: number;
  // Total addresses in the graph (with or without USD) — for context.
  addressCount: number;
  // Per-category breakdown for rows with USD set. Sorted high → low.
  byCategory: ValueStatsBucket[];
  // Per-token breakdown for rows with native_amount + native_symbol set.
  // Powers the "174k BTC tracked · 514k ETH frozen" line on /graph.
  byToken: ValueTokenBucket[];
};

/**
 * Aggregate "Total value tracked" stat for the /graph header. Sums
 * balance_estimate_usd across every address that has one populated. Currently
 * the populated set is dominated by category='lost' (Mt. Gox, Parity, etc.)
 * and category='government-seized' (Bitfinex DOJ custody, ~$9B), but as the
 * seed expands to cover more institutional/seized addresses, this counter
 * will reflect the growing "money on chain RexIntel has eyes on" surface.
 *
 * The `includeUserReported` toggle drives the moat-visibility pitch on /graph:
 * with it off, the totals reflect only what every other free service has
 * (sanctions lists, curated entries, incident-derived); with it on, the
 * community-loss-report layer is included so users can compare the delta.
 * Default FALSE (exclude) — this is the trust-bearing headline, and silently
 * mixing in self-reported claims would corrupt the "$X tracked" pitch every
 * caller (including Hermes/admin) is showing somewhere.
 */
export async function fetchValueStats(
  opts: { includeUserReported?: boolean } = {},
): Promise<ValueStats> {
  const includeUserReported = opts.includeUserReported === true;
  // `IS NULL OR NOT IN`: addresses without any attribution yet have
  // primary_source NULL and aren't "community-reported" — they should still
  // count in industry-only mode. Plain `NOT IN` against NULL returns UNKNOWN
  // and silently drops them. Both `community-loss-report` (self-reported
  // story) and `victim-trace` (on-chain-evidenced auto-trace) are community
  // class — the toggle hides both.
  const notCommunity = sql`(${addresses.primarySource} IS NULL OR ${addresses.primarySource} NOT IN ('community-loss-report', 'victim-trace'))`;

  const totalCountRow = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(addresses)
    .where(includeUserReported ? undefined : notCommunity);
  const addressCount = totalCountRow[0]?.n ?? 0;

  const valued = await db
    .select({
      category: addresses.category,
      balanceEstimateUsd: addresses.balanceEstimateUsd,
    })
    .from(addresses)
    .where(
      includeUserReported
        ? isNotNull(addresses.balanceEstimateUsd)
        : and(isNotNull(addresses.balanceEstimateUsd), notCommunity),
    );

  let totalUsd = 0;
  const buckets = new Map<string, { walletCount: number; totalUsd: number }>();
  for (const r of valued) {
    const usd = Number(r.balanceEstimateUsd ?? 0);
    if (!Number.isFinite(usd) || usd <= 0) continue;
    totalUsd += usd;
    const key = r.category ?? "other";
    const cur = buckets.get(key) ?? { walletCount: 0, totalUsd: 0 };
    cur.walletCount += 1;
    cur.totalUsd += usd;
    buckets.set(key, cur);
  }

  const byCategory: ValueStatsBucket[] = [...buckets.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.totalUsd - a.totalUsd);

  // Per-token breakdown: sum native_amount + balance_estimate_usd by
  // native_symbol. Independent query — some addresses have a native amount
  // without a USD figure (and vice versa), so we don't pre-join the result
  // sets on the JS side.
  const tokenRows = await db
    .select({
      symbol: addresses.nativeSymbol,
      amount: addresses.nativeAmount,
      usd: addresses.balanceEstimateUsd,
    })
    .from(addresses)
    .where(
      includeUserReported
        ? isNotNull(addresses.nativeAmount)
        : and(isNotNull(addresses.nativeAmount), notCommunity),
    );

  const tokenBuckets = new Map<
    string,
    { totalAmount: number; walletCount: number; totalUsd: number }
  >();
  for (const r of tokenRows) {
    const sym = (r.symbol ?? "").trim().toUpperCase();
    if (!sym) continue;
    const amt = Number(r.amount ?? 0);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    const usd = Number(r.usd ?? 0);
    const cur = tokenBuckets.get(sym) ?? {
      totalAmount: 0,
      walletCount: 0,
      totalUsd: 0,
    };
    cur.totalAmount += amt;
    cur.walletCount += 1;
    cur.totalUsd += Number.isFinite(usd) ? usd : 0;
    tokenBuckets.set(sym, cur);
  }
  const byToken: ValueTokenBucket[] = [...tokenBuckets.entries()]
    .map(([symbol, v]) => ({ symbol, ...v }))
    .sort((a, b) => b.totalUsd - a.totalUsd);

  return {
    totalUsd,
    walletCount: valued.length,
    addressCount,
    byCategory,
    byToken,
  };
}

/**
 * Aggregate for the "Reported lost crypto" stat block on /graph. Sums
 * balance_estimate_usd across every address tagged category='lost'. Famous
 * cases without published addresses (Howells HDD, Stefan Thomas IronKey)
 * contribute intel pieces but no row here — note the gap on the UI.
 *
 * Honors the same `includeUserReported` toggle as fetchValueStats so the
 * stat block changes alongside the graph viz when the user flips it. Default
 * FALSE — same trust-bearing reasoning as fetchValueStats; callers that want
 * the merged view must opt in explicitly.
 */
export async function fetchLostCryptoStats(
  topN = 5,
  opts: { includeUserReported?: boolean } = {},
): Promise<LostCryptoStats> {
  const includeUserReported = opts.includeUserReported === true;
  const notCommunity = sql`(${addresses.primarySource} IS NULL OR ${addresses.primarySource} NOT IN ('community-loss-report', 'victim-trace'))`;

  const rows = await db
    .select({
      chain: addresses.chain,
      address: addresses.address,
      label: addresses.label,
      ownerName: addresses.ownerName,
      balanceEstimateUsd: addresses.balanceEstimateUsd,
    })
    .from(addresses)
    .where(
      includeUserReported
        ? eq(addresses.category, "lost")
        : and(eq(addresses.category, "lost"), notCommunity),
    );

  const parsed: LostWalletRow[] = rows.map((r) => ({
    chain: r.chain,
    address: r.address,
    label: r.label,
    ownerName: r.ownerName,
    balanceEstimateUsd: Number(r.balanceEstimateUsd ?? 0),
  }));

  const totalUsd = parsed.reduce((acc, r) => acc + r.balanceEstimateUsd, 0);

  const byChainMap = new Map<string, { walletCount: number; totalUsd: number }>();
  for (const r of parsed) {
    const cur = byChainMap.get(r.chain) ?? { walletCount: 0, totalUsd: 0 };
    cur.walletCount += 1;
    cur.totalUsd += r.balanceEstimateUsd;
    byChainMap.set(r.chain, cur);
  }
  const byChain = [...byChainMap.entries()]
    .map(([chain, v]) => ({ chain, ...v }))
    .sort((a, b) => b.totalUsd - a.totalUsd);

  const top = [...parsed]
    .sort((a, b) => b.balanceEstimateUsd - a.balanceEstimateUsd)
    .slice(0, topN);

  return {
    walletCount: parsed.length,
    totalUsd,
    byChain,
    top,
  };
}

export type GraphView = "incidents" | "institutional" | "combined";

export type GraphFilters = {
  window?: string | null;
  kind?: string | null;
  chain?: string | null;
  view?: string | null;
  category?: string | null;
  // When true, addresses whose primary attribution is community-loss-report
  // (and only that) are included. Default false — these are self-reported
  // and lower-confidence than the sanctions/curated/incident-derived stack.
  includeUserReported?: boolean | null;
};

const VIEW_VALUES = new Set<GraphView>([
  "incidents",
  "institutional",
  "combined",
]);

const CATEGORY_VALUES = new Set<AddressCategory>([
  "exchange",
  "defi-protocol",
  "treasury",
  "foundation",
  "bridge",
  "mixer",
  "sanctioned",
  "government-seized",
  "lost",
  "dormant",
  "hack-source",
  "hack-destination",
  "validator",
  "personality",
  "market-maker",
  "mev-bot",
  "scam",
]);

const SOURCE_RANK = new Map(SOURCE_PRECEDENCE.map((s, i) => [s, i]));

export function normalizeFilters(input: GraphFilters): {
  windowDays: number | null;
  kindFilter: Array<IntelPayload["kind"]>;
  kindParam: string;
  chain: string | undefined;
  view: GraphView;
  category: AddressCategory | null;
  includeUserReported: boolean;
} {
  const windowParam = input.window ?? "90";
  const kindParam = input.kind ?? "incident";
  const chainParam = input.chain ?? undefined;
  const viewParam = (input.view ?? "incidents") as GraphView;
  const categoryParam = (input.category ?? null) as AddressCategory | null;

  const windowDays =
    windowParam === "all"
      ? null
      : Number.isFinite(Number(windowParam))
        ? Math.max(1, Math.min(3650, Number(windowParam)))
        : 90;

  const kindFilter: Array<IntelPayload["kind"]> =
    kindParam === "all"
      ? ["incident", "original"]
      : kindParam === "original"
        ? ["original"]
        : ["incident"];

  const chain =
    chainParam && CHAIN_SLUG_SET.has(chainParam) ? chainParam : undefined;

  const view = VIEW_VALUES.has(viewParam) ? viewParam : "incidents";
  const category =
    categoryParam && CATEGORY_VALUES.has(categoryParam) ? categoryParam : null;

  const includeUserReported = input.includeUserReported === true;

  return {
    windowDays,
    kindFilter,
    kindParam,
    chain,
    view,
    category,
    includeUserReported,
  };
}

export async function fetchGraphData(input: GraphFilters): Promise<GraphData> {
  const norm = normalizeFilters(input);
  const {
    windowDays,
    kindFilter,
    kindParam,
    chain,
    view,
    category,
    includeUserReported,
  } = norm;

  const sinceDate =
    windowDays == null
      ? null
      : new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  // ----- Incident-anchored half (only for incidents/combined views) -----
  const wantIncidents = view === "incidents" || view === "combined";

  const intelRows = wantIncidents
    ? await db
        .select({
          id: submissions.id,
          publicId: submissions.publicId,
          payload: submissions.payload,
          publishedAt: submissions.publishedAt,
        })
        .from(submissions)
        .where(
          sinceDate
            ? and(
                eq(submissions.type, "intel"),
                eq(submissions.status, "approved"),
                gte(submissions.publishedAt, sinceDate),
              )
            : and(
                eq(submissions.type, "intel"),
                eq(submissions.status, "approved"),
              ),
        )
        .orderBy(desc(submissions.publishedAt))
        .limit(NODE_CAP)
    : [];

  type Picked = (typeof intelRows)[number] & { payload: IntelPayload };
  const candidates = intelRows
    .map((r) => ({ ...r, payload: r.payload as IntelPayload }) as Picked)
    .filter(
      (r) =>
        r.payload.kind != null &&
        (kindFilter as Array<string | undefined>).includes(r.payload.kind),
    );

  const linkRows =
    candidates.length > 0
      ? await db
          .select({
            submissionId: intelAddresses.submissionId,
            addressId: intelAddresses.addressId,
            role: intelAddresses.role,
            chain: addresses.chain,
            address: addresses.address,
            label: addresses.label,
            categoryCol: addresses.category,
            ownerName: addresses.ownerName,
            ownerKind: addresses.ownerKind,
            primarySource: addresses.primarySource,
            confidence: addresses.confidence,
          })
          .from(intelAddresses)
          .innerJoin(addresses, eq(intelAddresses.addressId, addresses.id))
          .where(
            chain
              ? and(
                  inArray(
                    intelAddresses.submissionId,
                    candidates.map((c) => c.id),
                  ),
                  eq(addresses.chain, chain),
                )
              : inArray(
                  intelAddresses.submissionId,
                  candidates.map((c) => c.id),
                ),
          )
      : [];

  const incidentsWithLinks = new Set(linkRows.map((l) => l.submissionId));

  const incidentNodes: IncidentNode[] = candidates
    .filter((c) => incidentsWithLinks.has(c.id))
    .map((c) => ({
      id: `inc:${c.id}`,
      kind: "incident",
      publicId: c.publicId,
      headline: c.payload.headline,
      severity: c.payload.severity,
      intelKind: c.payload.kind,
      publishedAt: c.publishedAt ? c.publishedAt.toISOString() : null,
      category: c.payload.category,
    }));

  const addressNodeById = new Map<string, AddressNode>();
  for (const l of linkRows) {
    if (!addressNodeById.has(l.addressId)) {
      addressNodeById.set(l.addressId, {
        id: `addr:${l.addressId}`,
        kind: "address",
        chain: l.chain,
        address: l.address,
        label: l.label,
        category: l.categoryCol ?? null,
        ownerName: l.ownerName ?? null,
        ownerKind: l.ownerKind ?? null,
        primarySource: l.primarySource ?? null,
        confidence: l.confidence ?? null,
      });
    }
  }

  // ----- Institutional half (only for institutional/combined views) -----
  const wantInstitutional = view === "institutional" || view === "combined";
  if (wantInstitutional) {
    const remaining = Math.max(0, ADDRESS_CAP - addressNodeById.size);
    if (remaining > 0) {
      const institutional = await db
        .select({
          id: addresses.id,
          chain: addresses.chain,
          address: addresses.address,
          label: addresses.label,
          categoryCol: addresses.category,
          ownerName: addresses.ownerName,
          ownerKind: addresses.ownerKind,
          primarySource: addresses.primarySource,
          confidence: addresses.confidence,
        })
        .from(addresses)
        .where(
          and(
            isNotNull(addresses.category),
            ...(chain ? [eq(addresses.chain, chain)] : []),
            ...(category ? [eq(addresses.category, category)] : []),
            // When the toggle is off, exclude addresses whose ONLY attribution
            // is community-class (community-loss-report = self-reported story,
            // victim-trace = on-chain-evidenced auto-trace). Sanctions/curated/
            // incident-anchored addresses always pass through because
            // recomputeDenormalization picks the highest-precedence source.
            // Safe to use `inArray` directly: any row with category != null
            // also has primary_source != null (the denorm step writes them
            // together).
            ...(includeUserReported
              ? []
              : [
                  sql`${addresses.primarySource} NOT IN ('community-loss-report', 'victim-trace')`,
                ]),
          ),
        )
        // Highest-confidence first; ties broken by most-recently-verified.
        .orderBy(
          sql`coalesce(${addresses.confidence}, 0) desc`,
          sql`coalesce(${addresses.lastVerifiedAt}, ${addresses.updatedAt}) desc`,
        )
        .limit(remaining);

      for (const row of institutional) {
        if (!addressNodeById.has(row.id)) {
          addressNodeById.set(row.id, {
            id: `addr:${row.id}`,
            kind: "address",
            chain: row.chain,
            address: row.address,
            label: row.label,
            category: row.categoryCol ?? null,
            ownerName: row.ownerName ?? null,
            ownerKind: row.ownerKind ?? null,
            primarySource: row.primarySource ?? null,
            confidence: row.confidence ?? null,
          });
        }
      }
    }
  }

  const addressNodes = [...addressNodeById.values()];

  // ----- Edges -----
  const incidentAddressEdges: GraphEdge[] = linkRows.map((l) => ({
    kind: "incident-address",
    source: `inc:${l.submissionId}`,
    target: `addr:${l.addressId}`,
    role: l.role,
  }));

  // Address-address co-occurrence: two addresses sharing an incident.
  const coWeight = new Map<string, number>();
  const submissionToAddrs = new Map<string, string[]>();
  for (const l of linkRows) {
    const arr = submissionToAddrs.get(l.submissionId) ?? [];
    arr.push(l.addressId);
    submissionToAddrs.set(l.submissionId, arr);
  }
  for (const addrs of submissionToAddrs.values()) {
    const uniq = [...new Set(addrs)];
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        const a = uniq[i] < uniq[j] ? uniq[i] : uniq[j];
        const b = uniq[i] < uniq[j] ? uniq[j] : uniq[i];
        const key = `${a}|${b}`;
        coWeight.set(key, (coWeight.get(key) ?? 0) + 1);
      }
    }
  }
  const addressAddressEdges: GraphEdge[] = [...coWeight.entries()].map(
    ([key, weight]) => {
      const [a, b] = key.split("|");
      return {
        kind: "address-address",
        source: `addr:${a}`,
        target: `addr:${b}`,
        weight,
      };
    },
  );

  // Owner-cluster edges (institutional/combined views): chain addresses
  // sharing an ownerName into a soft cluster. We use a star topology
  // anchored on the first node for that owner to keep edge count linear.
  const ownerClusterEdges: GraphEdge[] = [];
  if (wantInstitutional) {
    const byOwner = new Map<string, AddressNode[]>();
    for (const node of addressNodes) {
      if (!node.ownerName) continue;
      const arr = byOwner.get(node.ownerName) ?? [];
      arr.push(node);
      byOwner.set(node.ownerName, arr);
    }
    for (const [ownerName, group] of byOwner) {
      if (group.length < 2) continue;
      const anchor = group[0];
      for (let i = 1; i < group.length; i++) {
        ownerClusterEdges.push({
          kind: "owner-cluster",
          source: anchor.id,
          target: group[i].id,
          ownerName,
        });
      }
    }
  }

  const nodes: GraphNode[] = [...incidentNodes, ...addressNodes];
  const edges: GraphEdge[] = [
    ...incidentAddressEdges,
    ...addressAddressEdges,
    ...ownerClusterEdges,
  ];

  // If we overflowed, trim institutional addresses by ascending source-rank
  // priority (i.e. drop community/incident-only addresses first, keep OFAC).
  if (nodes.length > NODE_CAP) {
    trimToCap(nodes, edges, NODE_CAP);
  }

  const categorizedCount = addressNodes.filter((n) => n.category != null).length;

  return {
    meta: {
      window: windowDays,
      kind: kindParam,
      view,
      chain: chain ?? null,
      category,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      incidentCount: incidentNodes.length,
      addressCount: addressNodes.length,
      categorizedCount,
      includeUserReported,
      generatedAt: new Date().toISOString(),
    },
    nodes,
    edges,
  };
}

/**
 * Drop lowest-priority nodes until we're under cap. Priority order:
 *   1. Incidents (always kept)
 *   2. Addresses with a high-priority source (OFAC, OFSI, EU, curated)
 *   3. Addresses with any category
 *   4. Plain incident-linked addresses
 * Edges referencing dropped nodes are removed in a second pass.
 */
function trimToCap(nodes: GraphNode[], edges: GraphEdge[], cap: number) {
  const ranked = [...nodes].sort((a, b) => priority(b) - priority(a));
  const kept = new Set(ranked.slice(0, cap).map((n) => n.id));
  // mutate in place
  const survivors = nodes.filter((n) => kept.has(n.id));
  nodes.length = 0;
  nodes.push(...survivors);
  const survivingEdges = edges.filter((e) => {
    const s = typeof e.source === "string" ? e.source : e.source;
    const t = typeof e.target === "string" ? e.target : e.target;
    return kept.has(s) && kept.has(t);
  });
  edges.length = 0;
  edges.push(...survivingEdges);
}

function priority(n: GraphNode): number {
  if (n.kind === "incident") return 1000;
  const an = n;
  const sourceRank = an.primarySource
    ? (SOURCE_RANK.get(an.primarySource) ?? 999)
    : 999;
  // Lower source rank (e.g. ofac=0) → higher priority. Invert.
  const base = 500 - sourceRank;
  return base + (an.category ? 10 : 0) + (an.confidence ?? 0) / 100;
}
