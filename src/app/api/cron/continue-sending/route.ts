import { NextResponse } from "next/server";
import { and, asc, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db, campaigns, sends } from "@/lib/db";
import { sendCampaign } from "@/lib/email/sender";
import { verifyCronSecret } from "@/lib/cron-auth";

/**
 * GET /api/cron/continue-sending
 *
 * Resumes campaigns whose status='sending' but whose recipient list isn't
 * fully drained yet (sentCount < recipientCount). Each tick runs at most
 * MAX_BATCHES_PER_TICK batches against a single campaign, which keeps the
 * function comfortably inside Vercel's 300s ceiling while making forward
 * progress every minute.
 *
 * Sequence per tick:
 *   1. Fetch the oldest unfinished sending campaign (FOR UPDATE SKIP LOCKED
 *      via a lease on progress_started_at).
 *   2. Call sendCampaign(id, { maxBatches }).
 *   3. Return progress JSON so the cron log is itself an audit trail.
 */

export const maxDuration = 300;

// How many batches of 100 to push through per minute-tick. With Resend's
// 1.1s spacing this works out to ~30 × 1.1s ≈ 33s of actual send time per
// tick — leaves plenty of headroom for cold start + per-batch DB writes.
const MAX_BATCHES_PER_TICK = 30;

// Stuck-lease cutoff. If a campaign hasn't progressed in this long, the
// worker that held it probably died; another tick is free to pick it up.
const LEASE_MS = 90 * 1000;

// How long to wait between finishing the A/B sample and auto-picking a
// winner. 4h is the industry default — long enough for opens to materialize
// across timezones, short enough that the campaign ships the same day.
const AB_WAIT_WINDOW_MS = 4 * 60 * 60 * 1000;

/**
 * Pick A/B winners for any campaign whose sample is fully sent and whose
 * wait window has elapsed. Stamps abWinnerSubject + abWinnerPickedAt, which
 * unblocks the next continue-sending tick to ship the rest of the audience
 * using the winning subject line.
 */
async function pickDueWinners(): Promise<
  Array<{ campaignId: string; winner: "a" | "b"; subject: string }>
> {
  const cutoff = new Date(Date.now() - AB_WAIT_WINDOW_MS);
  const due = await db
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.status, "sending"),
        isNotNull(campaigns.subjectB),
        isNull(campaigns.abWinnerPickedAt),
        isNotNull(campaigns.progressStartedAt),
        lt(campaigns.progressStartedAt, cutoff),
        sql`COALESCE(${campaigns.sentCount}, 0) >= COALESCE(${campaigns.abSampleSize}, 0)`,
      ),
    );

  const decisions: Array<{ campaignId: string; winner: "a" | "b"; subject: string }> = [];
  for (const c of due) {
    const metric = c.abWinnerMetric ?? "open_rate";
    // Tally per-variant performance from the sends audit log.
    const stats = await db
      .select({
        variant: sends.abVariant,
        sent: sql<number>`count(*) filter (where ${sends.sentAt} is not null)::int`,
        opens: sql<number>`count(*) filter (where ${sends.openedAt} is not null)::int`,
        clicks: sql<number>`count(*) filter (where ${sends.clickedAt} is not null)::int`,
      })
      .from(sends)
      .where(and(eq(sends.campaignId, c.id), isNotNull(sends.abVariant)))
      .groupBy(sends.abVariant);

    const rateOf = (v: "a" | "b"): number => {
      const row = stats.find((s) => s.variant === v);
      if (!row || row.sent === 0) return 0;
      const numerator = metric === "click_rate" ? row.clicks : row.opens;
      return numerator / row.sent;
    };
    const rateA = rateOf("a");
    const rateB = rateOf("b");
    // Tiebreak toward A — keeps the chosen winner deterministic and matches
    // the marketing intuition of "ship the version you wrote first".
    const winner: "a" | "b" = rateB > rateA ? "b" : "a";
    const winningSubject = winner === "b" ? c.subjectB! : c.subject;

    await db
      .update(campaigns)
      .set({
        abWinnerPickedAt: new Date(),
        abWinnerSubject: winningSubject,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, c.id));
    decisions.push({ campaignId: c.id, winner, subject: winningSubject });
    console.log(
      `[ab winner] ${c.id}: ${winner} wins on ${metric} (a=${rateA.toFixed(4)} vs b=${rateB.toFixed(4)})`,
    );
  }
  return decisions;
}

export async function GET(req: Request) {
  const fail = verifyCronSecret(req);
  if (fail) return NextResponse.json(fail.body, { status: fail.status });

  // First, pick any A/B winners whose wait window has elapsed. Stamping
  // them here means the very next send-batch call (below, same tick) will
  // immediately start shipping the post-sample remainder with the winning
  // subject — no extra cron round-trip lost to coordination.
  const abDecisions = await pickDueWinners();

  const now = new Date();
  const leaseCutoff = new Date(now.getTime() - LEASE_MS);

  // Find one campaign that is sending and has remaining recipients. Either
  // it has never been leased (progress_started_at IS NULL — unusual; sender
  // stamps it on first claim) or the lease has expired.
  const candidates = await db
    .select({
      id: campaigns.id,
      sentCount: campaigns.sentCount,
      recipientCount: campaigns.recipientCount,
      progressStartedAt: campaigns.progressStartedAt,
      updatedAt: campaigns.updatedAt,
    })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.status, "sending"),
        sql`COALESCE(${campaigns.sentCount}, 0) < COALESCE(${campaigns.recipientCount}, 0)`,
      ),
    )
    .orderBy(asc(campaigns.progressStartedAt), asc(campaigns.updatedAt))
    .limit(5);

  const ready = candidates.find(
    (c) =>
      !c.updatedAt || c.updatedAt < leaseCutoff || !c.progressStartedAt,
  );

  if (!ready) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      reason:
        candidates.length === 0
          ? "no sending campaigns"
          : "all in-flight campaigns are actively leased",
    });
  }

  // Atomic lease: bump updatedAt so other ticks see this as actively held
  // until LEASE_MS elapses without further progress.
  const leased = await db
    .update(campaigns)
    .set({ updatedAt: now })
    .where(
      and(
        eq(campaigns.id, ready.id),
        eq(campaigns.status, "sending"),
      ),
    )
    .returning({ id: campaigns.id });

  if (leased.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      reason: "lease lost between select and claim",
    });
  }

  try {
    const result = await sendCampaign(ready.id, {
      maxBatches: MAX_BATCHES_PER_TICK,
    });
    return NextResponse.json({
      ok: true,
      campaignId: ready.id,
      abDecisions,
      ...result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[continue-sending] ${ready.id} threw:`, msg);
    return NextResponse.json(
      { ok: false, campaignId: ready.id, error: msg },
      { status: 500 },
    );
  }
}
