import { NextResponse } from "next/server";
import { and, eq, lte } from "drizzle-orm";
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

  const now = new Date();
  const due = await db
    .select({ id: campaigns.id, name: campaigns.name })
    .from(campaigns)
    .where(
      and(eq(campaigns.status, "scheduled"), lte(campaigns.scheduledFor, now)),
    );

  const results: Array<{
    id: string;
    name: string;
    ok: boolean;
    totalSent?: number;
    totalFailed?: number;
    error?: string;
  }> = [];

  for (const c of due) {
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
    results,
  });
}
