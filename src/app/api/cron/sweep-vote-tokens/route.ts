import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { sql } from "drizzle-orm";
import { db, voteTokens } from "@/lib/db";

/**
 * GET /api/cron/sweep-vote-tokens
 *
 * Daily sweep of expired vote_tokens rows. Each row carries the voter's
 * email + IP and was created during the magic-link handshake; once the
 * token has expired (24h after creation) the row is dead weight — it
 * cannot authorize a vote, but it still retains PII indefinitely.
 *
 * Auth: Bearer ${CRON_SECRET}, matching the other crons.
 *
 * What it deletes: rows whose expires_at is more than RETENTION_DAYS in
 * the past. We keep a short tail of expired rows so the magic-link flow
 * can still tell a user "this link expired" rather than "this link is
 * invalid" — after the tail elapses, both states collapse to "invalid"
 * which is fine for the UX.
 */

// Retention tightened from 30d → 7d to minimize the PII window. The "this
// link expired" UX message survives for 7 days post-expiry, after which
// the link collapses to "invalid" — acceptable since the original token
// only had a 24h TTL anyway.
const RETENTION_DAYS = 7;
// Batch ceiling so a runaway-attack scenario where the table has millions
// of expired rows doesn't lock on a single DELETE. Re-runs sweep the rest.
const SWEEP_BATCH_LIMIT = 10_000;

export const maxDuration = 60;

export async function GET(req: Request) {
  const fail = verifyCronSecret(req);
  if (fail) return NextResponse.json(fail.body, { status: fail.status });

  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  // Drizzle doesn't expose LIMIT on DELETE directly; use a CTE that
  // selects the ids first, then deletes by id.
  const deleted = await db.execute<{ id: string }>(sql`
    WITH victims AS (
      SELECT id FROM ${voteTokens}
      WHERE ${voteTokens.expiresAt} < ${cutoff}
      ORDER BY ${voteTokens.expiresAt} ASC
      LIMIT ${SWEEP_BATCH_LIMIT}
    )
    DELETE FROM ${voteTokens}
    WHERE id IN (SELECT id FROM victims)
    RETURNING id
  `);

  return NextResponse.json({
    ok: true,
    deleted: deleted.rowCount ?? 0,
    cutoff: cutoff.toISOString(),
    capped: (deleted.rowCount ?? 0) >= SWEEP_BATCH_LIMIT,
  });
}
