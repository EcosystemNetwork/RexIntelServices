import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
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

export async function GET(req: Request) {
  const fail = verifyCronSecret(req);
  if (fail) return NextResponse.json(fail.body, { status: fail.status });

  const startedAt = Date.now();
  const summary = await runLumaHarvest({
    log: (line) => console.log(`[harvest-luma] ${line}`),
  });
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
