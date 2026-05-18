import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { isHermesAuthorized } from "@/lib/hermes-auth";

/**
 * GET /api/hermes/healthz
 *
 * Lightweight up-check for the Hermes operator. Returns:
 *   - operator.authorized: whether the caller presented a valid Hermes token
 *   - db.ok: whether a trivial SELECT 1 succeeds
 *   - counts: incidents / originals / addresses (only when authorized)
 *
 * Intentionally returns 200 even on unauthorized calls so that Hermes can
 * tell "site is up but I'm not gated in" apart from "site is hard-down".
 * The 401 paths are reserved for the write/sensitive read endpoints.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authed = isHermesAuthorized(req);
  let dbOk = false;
  try {
    await db.execute(sql`SELECT 1`);
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const base = {
    ok: true,
    service: "rexintel",
    timestamp: new Date().toISOString(),
    operator: { authorized: authed },
    db: { ok: dbOk },
  };

  if (!authed) return NextResponse.json(base);

  // Authorized — include the snapshot counts Hermes uses to decide what to do next.
  const incidents = await db.execute(
    sql`SELECT COUNT(*) AS n FROM submissions WHERE type = 'intel' AND status = 'approved' AND payload->>'kind' = 'incident'`,
  );
  const originals = await db.execute(
    sql`SELECT COUNT(*) AS n FROM submissions WHERE type = 'intel' AND status = 'approved' AND payload->>'kind' = 'original'`,
  );
  const addresses = await db.execute(sql`SELECT COUNT(*) AS n FROM addresses`);
  const pending = await db.execute(
    sql`SELECT COUNT(*) AS n FROM submissions WHERE status = 'pending'`,
  );

  return NextResponse.json({
    ...base,
    counts: {
      incidents: Number((incidents.rows[0] as { n: number }).n),
      originals: Number((originals.rows[0] as { n: number }).n),
      addresses: Number((addresses.rows[0] as { n: number }).n),
      pending: Number((pending.rows[0] as { n: number }).n),
    },
  });
}
