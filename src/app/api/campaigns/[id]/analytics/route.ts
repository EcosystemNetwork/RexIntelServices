import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql, ilike, isNotNull, isNull } from "drizzle-orm";
import {
  db,
  campaigns,
  sends,
  subscribers,
  clickUrls,
} from "@/lib/db";
import { requireOperator } from "@/lib/auth";

/**
 * GET /api/campaigns/[id]/analytics
 *
 * Per-campaign drilldown. The campaign row already carries denormalized
 * aggregate counters; this endpoint joins them with sends/click_urls so
 * the operator can see funnel + A/B split + top URLs + engagement timeline
 * + a filtered recipient list.
 *
 * Query params (all optional):
 *   recipientFilter = all | opened | clicked | bounced | unopened | unsubscribed
 *   recipientSearch = case-insensitive email substring
 *   page            = 1-indexed page number for the recipient table
 *   pageSize        = default 50, max 200
 */

const RECIPIENT_FILTERS = [
  "all",
  "opened",
  "clicked",
  "bounced",
  "unopened",
  "unsubscribed",
] as const;
type RecipientFilter = (typeof RECIPIENT_FILTERS)[number];

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, params.id))
    .limit(1);
  if (!campaign) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const filterParam = url.searchParams.get("recipientFilter") ?? "all";
  const recipientFilter: RecipientFilter = (
    RECIPIENT_FILTERS as readonly string[]
  ).includes(filterParam)
    ? (filterParam as RecipientFilter)
    : "all";
  const recipientSearch = (url.searchParams.get("recipientSearch") ?? "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get("pageSize") ?? 50) || 50),
  );

  // Funnel — re-derived from sends so it stays honest even if a counter
  // ever drifts. One scan, multiple FILTER aggregates.
  const [funnelRow] = await db
    .select({
      recipients: sql<number>`count(*)::int`,
      sent: sql<number>`count(*) filter (where ${sends.sentAt} is not null)::int`,
      delivered: sql<number>`count(*) filter (where ${sends.deliveredAt} is not null)::int`,
      opened: sql<number>`count(*) filter (where ${sends.openedAt} is not null)::int`,
      clicked: sql<number>`count(*) filter (where ${sends.clickedAt} is not null)::int`,
      bounced: sql<number>`count(*) filter (where ${sends.bouncedAt} is not null)::int`,
      complained: sql<number>`count(*) filter (where ${sends.complainedAt} is not null)::int`,
      failed: sql<number>`count(*) filter (where status = 'failed')::int`,
    })
    .from(sends)
    .where(eq(sends.campaignId, params.id));

  const f = funnelRow ?? {
    recipients: 0,
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
    failed: 0,
  };
  const unsubscribed = campaign.unsubscribedCount ?? 0;

  // Rates. Open/click denominators use `delivered` (industry convention);
  // bounce/complaint use `sent` (what we actually attempted).
  const safeDiv = (num: number, den: number) =>
    den > 0 ? num / den : 0;
  const rates = {
    deliveryRate: safeDiv(f.delivered, f.sent),
    openRate: safeDiv(f.opened, f.delivered),
    clickRate: safeDiv(f.clicked, f.delivered),
    clickToOpenRate: safeDiv(f.clicked, f.opened),
    bounceRate: safeDiv(f.bounced, f.sent),
    complaintRate: safeDiv(f.complained, f.sent),
    unsubRate: safeDiv(unsubscribed, f.delivered),
  };

  // A/B variant split — only meaningful if the campaign actually had a
  // subjectB configured.
  let ab: {
    a: { subject: string; sent: number; opened: number; clicked: number; openRate: number; clickRate: number };
    b: { subject: string; sent: number; opened: number; clicked: number; openRate: number; clickRate: number };
    winner: { subject: string | null; metric: string | null; pickedAt: string | null };
  } | null = null;
  if (campaign.subjectB) {
    const variantRows = await db
      .select({
        variant: sends.abVariant,
        sent: sql<number>`count(*) filter (where ${sends.sentAt} is not null)::int`,
        opened: sql<number>`count(*) filter (where ${sends.openedAt} is not null)::int`,
        clicked: sql<number>`count(*) filter (where ${sends.clickedAt} is not null)::int`,
      })
      .from(sends)
      .where(
        and(eq(sends.campaignId, params.id), isNotNull(sends.abVariant)),
      )
      .groupBy(sends.abVariant);
    const byVariant = new Map<string, { sent: number; opened: number; clicked: number }>();
    for (const r of variantRows) {
      if (r.variant) byVariant.set(r.variant, r);
    }
    const a = byVariant.get("a") ?? { sent: 0, opened: 0, clicked: 0 };
    const b = byVariant.get("b") ?? { sent: 0, opened: 0, clicked: 0 };
    ab = {
      a: {
        subject: campaign.subject,
        sent: a.sent,
        opened: a.opened,
        clicked: a.clicked,
        openRate: safeDiv(a.opened, a.sent),
        clickRate: safeDiv(a.clicked, a.sent),
      },
      b: {
        subject: campaign.subjectB,
        sent: b.sent,
        opened: b.opened,
        clicked: b.clicked,
        openRate: safeDiv(b.opened, b.sent),
        clickRate: safeDiv(b.clicked, b.sent),
      },
      winner: {
        subject: campaign.abWinnerSubject ?? null,
        metric: campaign.abWinnerMetric ?? null,
        pickedAt: campaign.abWinnerPickedAt
          ? new Date(campaign.abWinnerPickedAt).toISOString()
          : null,
      },
    };
  }

  // Top clicked links — pulled from the rewrite table. Capped at 15.
  const topLinks = await db
    .select({
      url: clickUrls.url,
      clicks: clickUrls.clickCount,
    })
    .from(clickUrls)
    .where(eq(clickUrls.campaignId, params.id))
    .orderBy(desc(clickUrls.clickCount))
    .limit(15);

  // Engagement timeline. Bucket by hour for the first 48h after the
  // first send, then by day after. Returns rows in chronological order.
  const opensTimeline = await db.execute<{
    bucket: string;
    count: number;
  }>(sql`
    SELECT
      to_char(date_trunc('hour', ${sends.openedAt}), 'YYYY-MM-DD"T"HH24:00:00"Z"') AS bucket,
      count(*)::int AS count
    FROM ${sends}
    WHERE ${sends.campaignId} = ${params.id}
      AND ${sends.openedAt} IS NOT NULL
    GROUP BY 1
    ORDER BY 1 ASC
  `);
  const clicksTimeline = await db.execute<{
    bucket: string;
    count: number;
  }>(sql`
    SELECT
      to_char(date_trunc('hour', ${sends.clickedAt}), 'YYYY-MM-DD"T"HH24:00:00"Z"') AS bucket,
      count(*)::int AS count
    FROM ${sends}
    WHERE ${sends.campaignId} = ${params.id}
      AND ${sends.clickedAt} IS NOT NULL
    GROUP BY 1
    ORDER BY 1 ASC
  `);

  // Recipient table. Filter is translated into a where clause; pagination
  // is applied via offset/limit.
  const filterClauses = [eq(sends.campaignId, params.id)];
  if (recipientFilter === "opened") {
    filterClauses.push(isNotNull(sends.openedAt));
  } else if (recipientFilter === "clicked") {
    filterClauses.push(isNotNull(sends.clickedAt));
  } else if (recipientFilter === "bounced") {
    filterClauses.push(isNotNull(sends.bouncedAt));
  } else if (recipientFilter === "unopened") {
    filterClauses.push(isNull(sends.openedAt));
    filterClauses.push(isNotNull(sends.sentAt));
  } else if (recipientFilter === "unsubscribed") {
    filterClauses.push(eq(subscribers.status, "unsubscribed"));
  }
  if (recipientSearch.length > 0) {
    filterClauses.push(ilike(subscribers.email, `%${recipientSearch}%`));
  }
  const where = and(...filterClauses);

  const [{ total: recipientTotal }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(sends)
    .innerJoin(subscribers, eq(sends.subscriberId, subscribers.id))
    .where(where);

  const recipients = await db
    .select({
      email: subscribers.email,
      firstName: subscribers.firstName,
      lastName: subscribers.lastName,
      subscriberStatus: subscribers.status,
      sendStatus: sends.status,
      sentAt: sends.sentAt,
      deliveredAt: sends.deliveredAt,
      openedAt: sends.openedAt,
      openCount: sends.openCount,
      clickedAt: sends.clickedAt,
      clickCount: sends.clickCount,
      bouncedAt: sends.bouncedAt,
      abVariant: sends.abVariant,
    })
    .from(sends)
    .innerJoin(subscribers, eq(sends.subscriberId, subscribers.id))
    .where(where)
    .orderBy(
      desc(sql`coalesce(${sends.clickedAt}, ${sends.openedAt}, ${sends.sentAt})`),
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return NextResponse.json({
    campaign: {
      id: campaign.id,
      name: campaign.name,
      subject: campaign.subject,
      subjectB: campaign.subjectB,
      fromName: campaign.fromName,
      fromEmail: campaign.fromEmail,
      previewText: campaign.previewText,
      status: campaign.status,
      scheduledFor: campaign.scheduledFor,
      sentAt: campaign.sentAt,
      createdAt: campaign.createdAt,
      recipientCount: campaign.recipientCount ?? 0,
      counters: {
        sent: campaign.sentCount ?? 0,
        delivered: campaign.deliveredCount ?? 0,
        opened: campaign.openedCount ?? 0,
        clicked: campaign.clickedCount ?? 0,
        bounced: campaign.bouncedCount ?? 0,
        complained: campaign.complainedCount ?? 0,
        unsubscribed: campaign.unsubscribedCount ?? 0,
      },
    },
    funnel: {
      recipients: f.recipients,
      sent: f.sent,
      delivered: f.delivered,
      opened: f.opened,
      clicked: f.clicked,
      bounced: f.bounced,
      complained: f.complained,
      failed: f.failed,
      unsubscribed,
    },
    rates,
    ab,
    topLinks,
    timeline: {
      opens: (opensTimeline.rows ?? opensTimeline) as Array<{
        bucket: string;
        count: number;
      }>,
      clicks: (clicksTimeline.rows ?? clicksTimeline) as Array<{
        bucket: string;
        count: number;
      }>,
    },
    recipients: {
      rows: recipients,
      total: recipientTotal,
      page,
      pageSize,
      filter: recipientFilter,
      search: recipientSearch,
    },
  });
}
