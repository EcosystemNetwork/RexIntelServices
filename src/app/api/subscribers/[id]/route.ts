import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import {
  db,
  subscribers,
  sends,
  campaigns,
  subscriberTags,
  tags,
} from "@/lib/db";

const VALID_STATUSES = [
  "pending",
  "active",
  "unsubscribed",
  "bounced",
  "complained",
] as const;
type Status = (typeof VALID_STATUSES)[number];

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const [sub] = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.id, params.id))
    .limit(1);
  if (!sub) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [tagRows, sendRows] = await Promise.all([
    db
      .select({ id: tags.id, name: tags.name })
      .from(subscriberTags)
      .innerJoin(tags, eq(subscriberTags.tagId, tags.id))
      .where(eq(subscriberTags.subscriberId, params.id)),
    db
      .select({
        id: sends.id,
        campaignId: sends.campaignId,
        campaignName: campaigns.name,
        campaignSubject: campaigns.subject,
        status: sends.status,
        sentAt: sends.sentAt,
        openedAt: sends.openedAt,
        openCount: sends.openCount,
        clickedAt: sends.clickedAt,
        clickCount: sends.clickCount,
        bouncedAt: sends.bouncedAt,
      })
      .from(sends)
      .leftJoin(campaigns, eq(sends.campaignId, campaigns.id))
      .where(eq(sends.subscriberId, params.id))
      .orderBy(desc(sends.createdAt))
      .limit(50),
  ]);

  return NextResponse.json({ subscriber: sub, tags: tagRows, sends: sendRows });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = { updatedAt: new Date() };

  if (body.firstName !== undefined) update.firstName = body.firstName || null;
  if (body.lastName !== undefined) update.lastName = body.lastName || null;
  if (body.source !== undefined) update.source = body.source || null;
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status as Status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    update.status = body.status;
    if (body.status === "unsubscribed") update.unsubscribedAt = new Date();
  }

  const [row] = await db
    .update(subscribers)
    .set(update)
    .where(eq(subscribers.id, params.id))
    .returning();

  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ subscriber: row });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const [row] = await db
    .delete(subscribers)
    .where(eq(subscribers.id, params.id))
    .returning({ id: subscribers.id });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
