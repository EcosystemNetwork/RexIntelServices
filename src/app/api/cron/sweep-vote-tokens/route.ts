import { NextResponse } from "next/server";
import { lt } from "drizzle-orm";
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

const RETENTION_DAYS = 30;

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on server" },
      { status: 500 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const deleted = await db
    .delete(voteTokens)
    .where(lt(voteTokens.expiresAt, cutoff))
    .returning({ id: voteTokens.id });

  return NextResponse.json({
    ok: true,
    deleted: deleted.length,
    cutoff: cutoff.toISOString(),
  });
}
