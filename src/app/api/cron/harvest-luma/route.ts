import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { verifyCronSecret } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { runLumaHarvest } from "@/lib/luma-harvest";

/**
 * GET /api/cron/harvest-luma
 *
 * Triggered daily by Vercel Cron (see vercel.json). Pulls upcoming events
 * from the curator calendar allowlist in src/lib/luma-harvest.ts, filters
 * to founder-grade only, and inserts survivors as `event` submissions.
 *
 * Auth: Bearer ${CRON_SECRET} — same pattern as dispatch-scheduled.
 *
 * Idempotency: dedupes by payload.url against existing submissions, so
 * a re-trigger only writes events that weren't already in the table.
 *
 * Scope: this is the first source in a planned "daily intel" pipeline.
 * Hackathons (ETHGlobal/Devpost), grants (Gitcoin/Optimism), and job feeds
 * follow the same shape — fetch → score → enqueue/auto-publish.
 */
export const maxDuration = 300; // ~40 calendars × ~2s = ~80s, leave headroom

// Postgres advisory-lock key for the luma harvester. Two overlapping ticks
// (manual re-trigger during a slow run) both pass the "url not in
// submissions" dedupe check before either inserts — duplicate rows result
// because the submissions table has no unique constraint on payload->>'url'.
// The advisory lock serializes the two ticks at the application layer.
const HARVEST_LUMA_LOCK_KEY = 9_310_001;

export async function GET(req: Request) {
  const fail = verifyCronSecret(req);
  if (fail) return NextResponse.json(fail.body, { status: fail.status });

  const lockResult = await db.execute<{ pg_try_advisory_lock: boolean }>(
    sql`SELECT pg_try_advisory_lock(${HARVEST_LUMA_LOCK_KEY}) AS pg_try_advisory_lock`,
  );
  const got = lockResult.rows?.[0]?.pg_try_advisory_lock;
  if (!got) {
    return NextResponse.json({
      ok: true,
      skipped: "another_tick_running",
    });
  }

  const startedAt = Date.now();
  let summary: Awaited<ReturnType<typeof runLumaHarvest>>;
  try {
    summary = await runLumaHarvest({
      log: (line) => console.log(`[harvest-luma] ${line}`),
    });
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${HARVEST_LUMA_LOCK_KEY})`);
  }
  const durationMs = Date.now() - startedAt;

  console.log(
    `[harvest-luma] done in ${durationMs}ms — ${summary.inserted.approved} approved, ${summary.inserted.pending} pending, ${summary.rejected} rejected, ${summary.alreadyKnown} already-known, ${summary.calendarsFailed} calendar errors`,
  );

  return NextResponse.json({
    ok: true,
    durationMs,
    calendars: {
      processed: summary.calendarsProcessed,
      failed: summary.calendarsFailed,
    },
    candidates: summary.totalCandidates,
    alreadyKnown: summary.alreadyKnown,
    rejected: summary.rejected,
    inserted: summary.inserted,
    errors: summary.errors,
    insertedSample: summary.inserts.slice(0, 20),
  });
}
