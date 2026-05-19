import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, submissions, addresses, addressAttributions, intelAddresses } from "@/lib/db";
import { lookupAddressContext } from "@/lib/expo-context";
import { fetchGraphData } from "@/lib/graph-data";
import { runTrace } from "@/lib/tracer";
import { hackTraces } from "@/lib/db";

/**
 * Tool surface exposed to the RexIntel ForensicAgent. Every tool wraps an
 * already-public RexIntel function so the agent's worldview is exactly the
 * one the human-facing /trace, /graph, and /intel surfaces show. Keeping the
 * agent on the same data layer means a citation produced by the agent
 * (e.g. attribution source "OFAC SDN list") points to a record a human
 * judge can verify on the public site — the audit-trail invariant the
 * SANS FIND EVIL! rubric weights heavily.
 *
 * Each tool returns a JSON-serializable result. Results are stored in the
 * forensicCases.transcript JSONB so the case page can show the agent's
 * full chain of reasoning.
 */

export type ToolName =
  | "lookup_address"
  | "search_intel"
  | "fetch_neighborhood"
  | "trace_outbound"
  | "cite_external";

const ADDRESS_RX = /^0x[a-f0-9]{40}$/i;

function shortError(e: unknown): string {
  return e instanceof Error ? e.message : "unknown error";
}

// =====================================================================
// 1) lookup_address — pull the full RexIntel context for a single address
// =====================================================================
export async function lookupAddress(args: { chain?: string; address: string }) {
  const chain = (args.chain ?? "ethereum").toLowerCase();
  const address = (args.address ?? "").trim().toLowerCase();
  if (!ADDRESS_RX.test(address)) {
    return { ok: false, error: "address must be a 0x-prefixed 40-char hex string" };
  }
  const ctx = await lookupAddressContext(chain, address);
  return { ok: true, ...ctx };
}

// =====================================================================
// 2) search_intel — keyword-search approved intel headlines + deks
// =====================================================================
export async function searchIntel(args: { query: string; limit?: number }) {
  const query = (args.query ?? "").trim();
  if (query.length < 2) return { ok: false, error: "query must be ≥2 chars" };
  const limit = Math.max(1, Math.min(20, Math.trunc(args.limit ?? 8)));
  const like = `%${query}%`;
  const rows = await db
    .select({
      publicId: submissions.publicId,
      type: submissions.type,
      payload: submissions.payload,
      publishedAt: submissions.publishedAt,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.status, "approved"),
        or(
          sql`${submissions.payload}->>'headline' ILIKE ${like}`,
          sql`${submissions.payload}->>'dek' ILIKE ${like}`,
          sql`${submissions.payload}->>'name' ILIKE ${like}`,
        ),
      ),
    )
    .orderBy(desc(submissions.publishedAt))
    .limit(limit);

  return {
    ok: true,
    count: rows.length,
    results: rows.map((r) => {
      const p = r.payload as Record<string, unknown>;
      return {
        publicId: r.publicId,
        type: r.type,
        headline: (p?.headline as string) ?? (p?.name as string) ?? null,
        dek: (p?.dek as string) ?? null,
        kind: (p?.kind as string) ?? null,
        severity: (p?.severity as string) ?? null,
        publishedAt: r.publishedAt?.toISOString() ?? null,
        url: `/intel/${r.publicId}`,
      };
    }),
  };
}

// =====================================================================
// 3) fetch_neighborhood — graph slice around an address or category
// =====================================================================
export async function fetchNeighborhood(args: {
  windowDays?: 30 | 90 | 365;
  view?: "incidents" | "institutional" | "combined";
  category?: string;
  minConfidence?: number;
}) {
  const windowDays = args.windowDays ?? 365;
  const data = await fetchGraphData({
    window: String(windowDays),
    view: args.view ?? "combined",
    category: args.category ?? null,
    minConfidence: args.minConfidence ?? null,
  });
  // Cap the payload — the agent doesn't need all 2500 nodes, and Gemini's
  // context fills fast. Return a summary + the top-attributed nodes.
  const addressNodes = data.nodes.filter((n) => n.kind === "address").slice(0, 40);
  const incidentNodes = data.nodes.filter((n) => n.kind === "incident").slice(0, 40);
  return {
    ok: true,
    summary: {
      totalNodes: data.nodes.length,
      totalEdges: data.edges.length,
      windowDays: args.windowDays ?? 365,
      view: args.view ?? "combined",
    },
    addressNodes,
    incidentNodes,
  };
}

// =====================================================================
// 4) trace_outbound — kick off RexIntel's victim-trace runner on a wallet
// =====================================================================
export async function traceOutbound(args: {
  chain?: string;
  address: string;
  maxHops?: number;
}) {
  const chain = (args.chain ?? "ethereum").toLowerCase();
  if (chain !== "ethereum") {
    return { ok: false, error: "v1 supports ethereum mainnet only" };
  }
  const rootAddress = (args.address ?? "").trim().toLowerCase();
  if (!ADDRESS_RX.test(rootAddress)) {
    return { ok: false, error: "address must be a 0x-prefixed 40-char hex string" };
  }
  const maxHops = Math.max(1, Math.min(3, Math.trunc(args.maxHops ?? 2)));

  try {
    const [inserted] = await db
      .insert(hackTraces)
      .values({
        chain,
        rootAddress,
        victimLabel: "ForensicAgent investigation",
        submitterEmail: "forensic-agent@rexintel.internal",
        submitterIp: "agent",
        maxHops,
      })
      .returning({ id: hackTraces.id, publicId: hackTraces.publicId });
    if (!inserted) return { ok: false, error: "failed to insert trace row" };
    await runTrace(inserted.id);
    const [final] = await db
      .select()
      .from(hackTraces)
      .where(eq(hackTraces.id, inserted.id))
      .limit(1);
    return {
      ok: true,
      publicId: inserted.publicId,
      status: final?.status ?? "unknown",
      hopsExplored: final?.hopsExplored ?? 0,
      terminalCount: final?.terminalCount ?? 0,
      url: `/trace/${inserted.publicId}`,
    };
  } catch (e) {
    return { ok: false, error: shortError(e) };
  }
}

// =====================================================================
// 5) cite_external — agent declares an external citation it intends to
// use in the final report. We don't fetch the URL (no public scraper in
// the request path) — the model is asserting "I read this and used it";
// the public case page renders the citation as-is. Stored citations go
// into the final report alongside RexIntel-internal refs.
// =====================================================================
export async function citeExternal(args: { url: string; claim: string }) {
  const url = (args.url ?? "").trim();
  const claim = (args.claim ?? "").trim();
  if (!/^https?:\/\//.test(url)) return { ok: false, error: "url must be http(s)" };
  if (claim.length < 4) return { ok: false, error: "claim must be ≥4 chars" };
  return { ok: true, url, claim };
}

// =====================================================================
// Tool registry — maps a Gemini function-call name to its executor.
// Adding a tool: define the executor above, register it here, and add a
// matching FunctionDeclaration in src/lib/forensic/agent.ts.
// =====================================================================
export const TOOL_EXECUTORS: Record<ToolName, (args: any) => Promise<unknown>> = {
  lookup_address: lookupAddress,
  search_intel: searchIntel,
  fetch_neighborhood: fetchNeighborhood,
  trace_outbound: traceOutbound,
  cite_external: citeExternal,
};
