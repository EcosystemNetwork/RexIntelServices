import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import {
  db,
  sends,
  subscribers,
  suppressions,
} from "@/lib/db";
import { requireOperator } from "@/lib/auth";

/**
 * GET /api/deliverability
 *
 * Aggregated 30-day deliverability metrics for the dashboard. Designed to
 * surface the two metrics Gmail/Yahoo enforce against bulk senders:
 *   - hard bounce rate  → must stay under 0.4%
 *   - complaint rate    → must stay under 0.1% (0.3% = blocklist)
 *
 * All counts come from the sends audit log, so the dashboard never lags
 * the truth — every Resend webhook event lands here.
 */

const RECENT_WINDOW_DAYS = 30;
// Industry standard sender-reputation thresholds. Above the upper bound you
// are at material risk of being spam-foldered or blocklisted.
const BOUNCE_RATE_WARN = 0.002; // 0.2%
const BOUNCE_RATE_BLOCK = 0.004; // 0.4%
const COMPLAINT_RATE_WARN = 0.0005; // 0.05%
const COMPLAINT_RATE_BLOCK = 0.001; // 0.1%

export async function GET(req: NextRequest) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;

  const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      delivered: sql<number>`count(*) filter (where status = 'delivered' or status = 'opened' or status = 'clicked')::int`,
      bounced: sql<number>`count(*) filter (where status = 'bounced')::int`,
      complained: sql<number>`count(*) filter (where status = 'complained')::int`,
      opened: sql<number>`count(*) filter (where ${sends.openedAt} is not null)::int`,
      clicked: sql<number>`count(*) filter (where ${sends.clickedAt} is not null)::int`,
      failed: sql<number>`count(*) filter (where status = 'failed')::int`,
    })
    .from(sends)
    .where(gt(sends.createdAt, since));

  const total = totals?.total ?? 0;
  const bounceRate = total > 0 ? (totals?.bounced ?? 0) / total : 0;
  const complaintRate = total > 0 ? (totals?.complained ?? 0) / total : 0;
  const openRate = total > 0 ? (totals?.opened ?? 0) / total : 0;
  const clickRate = total > 0 ? (totals?.clicked ?? 0) / total : 0;

  function rateStatus(
    rate: number,
    warn: number,
    block: number,
  ): "good" | "warn" | "danger" {
    if (rate >= block) return "danger";
    if (rate >= warn) return "warn";
    return "good";
  }

  // Daily volume + bounces for the last 30 days. Single grouped query.
  const daily = await db.execute<{
    day: string;
    sent: number;
    bounced: number;
    complained: number;
    delivered: number;
  }>(sql`
    SELECT
      to_char(date_trunc('day', ${sends.createdAt}), 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS sent,
      COUNT(*) FILTER (WHERE status = 'bounced')::int AS bounced,
      COUNT(*) FILTER (WHERE status = 'complained')::int AS complained,
      COUNT(*) FILTER (WHERE status IN ('delivered','opened','clicked'))::int AS delivered
    FROM ${sends}
    WHERE ${sends.createdAt} > ${since}
    GROUP BY 1
    ORDER BY 1 ASC
  `);

  // Suppression breakdown by reason.
  const supByReason = await db
    .select({
      reason: suppressions.reason,
      count: sql<number>`count(*)::int`,
    })
    .from(suppressions)
    .groupBy(suppressions.reason);

  const [supTotal] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(suppressions);

  // Top bounced emails — operator targets for list cleanup. Look up by
  // joining sends → subscribers (bounced emails always have a subscriber row).
  const topBounced = await db
    .select({
      email: subscribers.email,
      lastBouncedAt: sql<Date>`max(${sends.bouncedAt})`,
      count: sql<number>`count(*)::int`,
    })
    .from(sends)
    .innerJoin(subscribers, eq(sends.subscriberId, subscribers.id))
    .where(eq(sends.status, "bounced"))
    .groupBy(subscribers.email)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  // Subscriber status breakdown — health of the whole list.
  const statusBreakdown = await db
    .select({
      status: subscribers.status,
      count: sql<number>`count(*)::int`,
    })
    .from(subscribers)
    .groupBy(subscribers.status);

  return NextResponse.json({
    window: { days: RECENT_WINDOW_DAYS, since: since.toISOString() },
    summary: {
      total,
      delivered: totals?.delivered ?? 0,
      bounced: totals?.bounced ?? 0,
      complained: totals?.complained ?? 0,
      opened: totals?.opened ?? 0,
      clicked: totals?.clicked ?? 0,
      failed: totals?.failed ?? 0,
    },
    rates: {
      bounce: { value: bounceRate, status: rateStatus(bounceRate, BOUNCE_RATE_WARN, BOUNCE_RATE_BLOCK) },
      complaint: { value: complaintRate, status: rateStatus(complaintRate, COMPLAINT_RATE_WARN, COMPLAINT_RATE_BLOCK) },
      open: openRate,
      click: clickRate,
    },
    thresholds: {
      bounceWarn: BOUNCE_RATE_WARN,
      bounceBlock: BOUNCE_RATE_BLOCK,
      complaintWarn: COMPLAINT_RATE_WARN,
      complaintBlock: COMPLAINT_RATE_BLOCK,
    },
    daily: (daily.rows ?? daily) as Array<{
      day: string;
      sent: number;
      bounced: number;
      complained: number;
      delivered: number;
    }>,
    suppressions: {
      total: supTotal?.count ?? 0,
      byReason: supByReason,
    },
    topBounced,
    statusBreakdown,
  });
}
