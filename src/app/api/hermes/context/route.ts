import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import { fetchLostCryptoStats, fetchValueStats } from "@/lib/graph-data";
import { requireHermes } from "@/lib/hermes-auth";

/**
 * GET /api/hermes/context
 *
 * Big-picture site snapshot that Hermes calls at the start of an operating
 * loop to know what state RexIntel is in. Returns:
 *   - graphStats: value counter + lost-crypto counter (same numbers shown
 *     on the public /graph page)
 *   - chains: per-chain address counts
 *   - recentIncidents: last 10 approved incident submissions
 *   - pending: last 10 pending submissions awaiting curator review
 *   - categoryMix: distribution of address categories across the graph
 *
 * Operator-only — gated by Hermes bearer token.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denial = requireHermes(req);
  if (denial) return denial;

  const [value, lost, chains, recent, pending, cats] = await Promise.all([
    fetchValueStats(),
    fetchLostCryptoStats(5),
    db.execute(
      sql`SELECT chain, COUNT(*)::int AS n FROM addresses GROUP BY chain ORDER BY n DESC`,
    ),
    db
      .select({
        publicId: submissions.publicId,
        payload: submissions.payload,
        publishedAt: submissions.publishedAt,
      })
      .from(submissions)
      .where(
        and(
          eq(submissions.type, "intel"),
          eq(submissions.status, "approved"),
          sql`${submissions.payload}->>'kind' = 'incident'`,
        ),
      )
      .orderBy(desc(submissions.publishedAt))
      .limit(10),
    db
      .select({
        id: submissions.id,
        publicId: submissions.publicId,
        type: submissions.type,
        payload: submissions.payload,
        createdAt: submissions.createdAt,
      })
      .from(submissions)
      .where(eq(submissions.status, "pending"))
      .orderBy(desc(submissions.createdAt))
      .limit(10),
    db.execute(
      sql`SELECT COALESCE(category::text, '(none)') AS category, COUNT(*)::int AS n FROM addresses GROUP BY category ORDER BY n DESC`,
    ),
  ]);

  type IntelPayloadShape = { headline?: string; kind?: string; severity?: string; category?: string };

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    valueStats: value,
    lostCryptoStats: lost,
    chains: chains.rows,
    recentIncidents: recent.map((r) => {
      const p = r.payload as IntelPayloadShape;
      return {
        publicId: r.publicId,
        headline: p?.headline,
        kind: p?.kind,
        severity: p?.severity,
        category: p?.category,
        publishedAt: r.publishedAt,
      };
    }),
    pending: pending.map((r) => {
      const p = r.payload as IntelPayloadShape;
      return {
        id: r.id,
        publicId: r.publicId,
        type: r.type,
        headline: p?.headline ?? null,
        createdAt: r.createdAt,
      };
    }),
    categoryMix: cats.rows,
  });
}
