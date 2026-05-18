import { NextRequest, NextResponse } from "next/server";
import { inArray, and, eq } from "drizzle-orm";
import { db, subscribers, suppressions, subscriberTags } from "@/lib/db";
import { requireOperator } from "@/lib/auth";

const VALID_STATUSES = [
  "pending",
  "active",
  "unsubscribed",
  "bounced",
  "complained",
] as const;

/**
 * POST /api/subscribers/bulk
 * Body:
 *   { action: "delete", ids: string[] }
 *   { action: "set_status", ids: string[], status: SubscriberStatus }
 *   { action: "suppress", ids: string[], reason?: "manual" | "hard_bounce" | "complaint" }
 *   { action: "tag", ids: string[], tagId: string }
 *   { action: "untag", ids: string[], tagId: string }
 */
export async function POST(req: NextRequest) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  if (!ids.length) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }
  // Hard cap to keep a bad client from running away with us
  if (ids.length > 5000) {
    return NextResponse.json(
      { error: "max 5000 ids per call" },
      { status: 400 },
    );
  }

  switch (body.action) {
    case "delete": {
      const rows = await db
        .delete(subscribers)
        .where(inArray(subscribers.id, ids))
        .returning({ id: subscribers.id });
      return NextResponse.json({ ok: true, affected: rows.length });
    }

    case "set_status": {
      const status = body.status;
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json({ error: "invalid status" }, { status: 400 });
      }
      const set: Record<string, unknown> = {
        status,
        updatedAt: new Date(),
      };
      if (status === "unsubscribed") set.unsubscribedAt = new Date();
      const rows = await db
        .update(subscribers)
        .set(set)
        .where(inArray(subscribers.id, ids))
        .returning({ id: subscribers.id });
      return NextResponse.json({ ok: true, affected: rows.length });
    }

    case "suppress": {
      // Add the emails to the global suppression list AND mark the subscriber
      // rows. Suppressed emails are excluded from future sends and from imports.
      const reason: "manual" | "hard_bounce" | "complaint" =
        body.reason && ["manual", "hard_bounce", "complaint"].includes(body.reason)
          ? body.reason
          : "manual";
      const rows = await db
        .select({ id: subscribers.id, email: subscribers.email })
        .from(subscribers)
        .where(inArray(subscribers.id, ids));
      if (rows.length === 0) return NextResponse.json({ ok: true, affected: 0 });

      await db
        .insert(suppressions)
        .values(rows.map((r) => ({ email: r.email.toLowerCase(), reason })))
        .onConflictDoNothing();

      const subStatus =
        reason === "complaint" ? "complained" : reason === "hard_bounce" ? "bounced" : "unsubscribed";
      await db
        .update(subscribers)
        .set({
          status: subStatus,
          unsubscribedAt: subStatus === "unsubscribed" ? new Date() : undefined,
          updatedAt: new Date(),
        })
        .where(inArray(subscribers.id, ids));

      return NextResponse.json({ ok: true, affected: rows.length });
    }

    case "tag": {
      if (!body.tagId) {
        return NextResponse.json({ error: "tagId required" }, { status: 400 });
      }
      // Insert (subscriberId, tagId) for each, ignoring conflicts on existing pairs.
      await db
        .insert(subscriberTags)
        .values(ids.map((subscriberId) => ({ subscriberId, tagId: body.tagId })))
        .onConflictDoNothing();
      return NextResponse.json({ ok: true, affected: ids.length });
    }

    case "untag": {
      if (!body.tagId) {
        return NextResponse.json({ error: "tagId required" }, { status: 400 });
      }
      const rows = await db
        .delete(subscriberTags)
        .where(
          and(
            eq(subscriberTags.tagId, body.tagId),
            inArray(subscriberTags.subscriberId, ids),
          ),
        )
        .returning({ subscriberId: subscriberTags.subscriberId });
      return NextResponse.json({ ok: true, affected: rows.length });
    }

    default:
      return NextResponse.json(
        { error: "unknown action" },
        { status: 400 },
      );
  }
}
