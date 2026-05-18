import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { and, asc, eq, lt, lte, or, sql } from "drizzle-orm";
import { db, campaigns } from "@/lib/db";
import { sendCampaign } from "@/lib/email/sender";

/**
 * GET /api/cron/dispatch-scheduled
 *
 * Triggered by Vercel Cron (see vercel.json). Picks up any campaign whose
 * status="scheduled" and scheduledFor <= now, and dispatches it.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` automatically
 * when CRON_SECRET is set in the project's env vars. We hard-fail if that
 * header doesn't match — otherwise this endpoint is effectively a public
 * "send everything now" button.
 *
 * Idempotency note: sendCampaign() flips status from "scheduled" → "sending"
 * up front, so even if two cron ticks overlap the second one will skip the
 * already-claimed campaign.
 */
export const maxDuration = 300; // sendCampaign can run a few minutes for 5k+ lists

// Stuck-send recovery: if a campaign has been "sending" for longer than
// this and nothing has bumped its updatedAt, the cron that started it
// probably timed out. Reset to "scheduled" so the next tick re-claims it.
// Cap is generous (60min) — sendCampaign for 50k recipients can legitimately
// take 15–30min, and we want false-positives near zero.
const STUCK_SENDING_MAX_MS = 60 * 60 * 1000;
// One campaign per tick. Sparse schedules don't accumulate fast enough to
// need batching; a backlog of 10+ campaigns at once is itself a signal an
// admin should investigate.
const DISPATCH_PER_TICK = 1;

export async function GET(req: Request) {
  const fail = verifyCronSecret(req);
  if (fail) return NextResponse.json(fail.body, { status: fail.status });

  const now = new Date();
  const stuckCutoff = new Date(now.getTime() - STUCK_SENDING_MAX_MS);

  // Sweep stuck "sending" rows back to "scheduled" so they re-enter the
  // pickup pool. Guarded UPDATE — a row whose updatedAt has been bumped
  // recently (because send is actively running) won't match the WHERE.
  const swept = await db
    .update(campaigns)
    .set({ status: "scheduled", updatedAt: now })
    .where(
      and(
        eq(campaigns.status, "sending"),
        lt(campaigns.updatedAt, stuckCutoff),
      ),
    )
    .returning({ id: campaigns.id });

  // One due campaign per tick, oldest first. Without this LIMIT, one slow
  // cron paused for hours picks up every due campaign on resume and runs
  // them sequentially inside one 300s slot — guaranteed timeout, leaving
  // the entire backlog in "sending" forever.
  const due = await db
    .select({ id: campaigns.id, name: campaigns.name })
    .from(campaigns)
    .where(
      and(eq(campaigns.status, "scheduled"), lte(campaigns.scheduledFor, now)),
    )
    .orderBy(asc(campaigns.scheduledFor))
    .limit(DISPATCH_PER_TICK);

  const results: Array<{
    id: string;
    name: string;
    ok: boolean;
    totalSent?: number;
    totalFailed?: number;
    error?: string;
  }> = [];

  for (const c of due) {
    // Atomic claim — only the cron tick that wins the CAS proceeds to
    // sendCampaign. Without this, two overlapping cron invocations both
    // pass the SELECT above, both run sendCampaign, and both blast the
    // entire recipient list. sendCampaign itself does a non-atomic
    // SELECT-then-UPDATE so the race window is real.
    const claimed = await db
      .update(campaigns)
      .set({ status: "sending", updatedAt: new Date() })
      .where(and(eq(campaigns.id, c.id), eq(campaigns.status, "scheduled")))
      .returning({ id: campaigns.id });
    if (claimed.length === 0) {
      results.push({
        id: c.id,
        name: c.name,
        ok: false,
        error: "raced_by_concurrent_tick",
      });
      continue;
    }

    try {
      const r = await sendCampaign(c.id);
      results.push({
        id: c.id,
        name: c.name,
        ok: true,
        totalSent: r.totalSent,
        totalFailed: r.totalFailed,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron] failed dispatching campaign ${c.id}:`, msg);
      results.push({ id: c.id, name: c.name, ok: false, error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    checkedAt: now.toISOString(),
    dispatched: results.length,
    sweptStuck: swept.length,
    results,
  });
}
