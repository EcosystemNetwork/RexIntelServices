import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import {
  db,
  campaigns,
  subscribers,
  sends,
  suppressions,
  subscriberTags,
} from "@/lib/db";

/**
 * GET /api/campaigns/[id]/recipient-count
 * Cheap preview of how many subscribers a "Send to all" would actually email.
 * Mirrors the filtering logic in lib/email/sender.ts:getRecipients exactly,
 * so the number you see here is the number that will be queued.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, params.id))
    .limit(1);
  if (!campaign) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const alreadySent = await db
    .select({ id: sends.subscriberId })
    .from(sends)
    .where(eq(sends.campaignId, campaign.id));
  const alreadySentIds = alreadySent.map((r) => r.id);

  const suppressedRows = await db
    .select({ email: suppressions.email })
    .from(suppressions);
  const suppressedEmails = new Set(
    suppressedRows.map((r) => r.email.toLowerCase()),
  );

  const targetTags = (campaign.targetTagIds ?? []) as string[];
  let candidateIds: string[] | null = null;
  if (targetTags.length > 0) {
    const rows = await db
      .selectDistinct({ id: subscriberTags.subscriberId })
      .from(subscriberTags)
      .where(inArray(subscriberTags.tagId, targetTags));
    candidateIds = rows.map((r) => r.id);
    if (candidateIds.length === 0) {
      return NextResponse.json({
        count: 0,
        activeTotal: 0,
        excludedAlreadySent: alreadySentIds.length,
        excludedSuppressed: 0,
      });
    }
  }

  // Total active in scope (before suppression / already-sent filtering)
  const [{ activeTotal }] = await db
    .select({ activeTotal: sql<number>`count(*)::int` })
    .from(subscribers)
    .where(
      and(
        eq(subscribers.status, "active"),
        candidateIds !== null ? inArray(subscribers.id, candidateIds) : sql`true`,
      ),
    );

  // The eligible list (active, in-segment, not already-sent) — small enough
  // to materialize so we can dedupe against the global suppression list.
  const eligible = await db
    .select({ id: subscribers.id, email: subscribers.email })
    .from(subscribers)
    .where(
      and(
        eq(subscribers.status, "active"),
        candidateIds !== null ? inArray(subscribers.id, candidateIds) : sql`true`,
        alreadySentIds.length > 0
          ? notInArray(subscribers.id, alreadySentIds)
          : sql`true`,
      ),
    );

  let suppressedHits = 0;
  let count = 0;
  for (const r of eligible) {
    if (suppressedEmails.has(r.email.toLowerCase())) suppressedHits++;
    else count++;
  }

  return NextResponse.json({
    count,
    activeTotal,
    excludedAlreadySent: alreadySentIds.length,
    excludedSuppressed: suppressedHits,
  });
}
