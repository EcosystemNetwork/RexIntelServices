import { NextResponse } from "next/server";
import { and, asc, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { db, submissions, campaigns } from "@/lib/db";
import type { IntelPayload, EventPayload } from "@/lib/db/schema";
import { renderDigest } from "@/lib/email/digest-template";

/**
 * GET /api/cron/draft-digest
 *
 * Triggered by Vercel Cron (see vercel.json). Pulls recently-approved intel
 * + upcoming events and creates a DRAFT campaigns row. The admin reviews
 * and clicks "send" Monday morning — the cron never sends on its own.
 *
 * Auth: same Bearer ${CRON_SECRET} pattern as dispatch-scheduled.
 *
 * Idempotency: if a draft created by this cron already exists for the same
 * ISO date (matched by internal name), we skip and return a no-op. Lets the
 * cron be safely re-triggered manually for debugging.
 */
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
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";

  // Skip if today's draft already exists (re-runs / manual triggers)
  const isoDate = now.toISOString().slice(0, 10);
  const internalName = `Weekly Briefing — ${isoDate}`;
  const [existing] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.name, internalName))
    .limit(1);

  if (existing) {
    return NextResponse.json({
      ok: true,
      skipped: "draft for today already exists",
      campaignId: existing.id,
    });
  }

  // Exclude submissions already featured in a previous digest. This keeps
  // each item from showing up week after week if it's still in the lookback
  // window, and means an empty week is genuinely empty (not a re-run).
  const [intelRows, eventRows] = await Promise.all([
    db
      .select({
        id: submissions.id,
        publicId: submissions.publicId,
        payload: submissions.payload,
        publishedAt: submissions.publishedAt,
      })
      .from(submissions)
      .where(
        and(
          eq(submissions.type, "intel"),
          eq(submissions.status, "approved"),
          gte(submissions.publishedAt, sevenDaysAgo),
          isNull(submissions.featuredInCampaignId),
        ),
      )
      .orderBy(desc(submissions.publishedAt))
      .limit(20),
    db
      .select({
        id: submissions.id,
        publicId: submissions.publicId,
        payload: submissions.payload,
        eventStartsAt: submissions.eventStartsAt,
      })
      .from(submissions)
      .where(
        and(
          eq(submissions.type, "event"),
          eq(submissions.status, "approved"),
          gte(submissions.eventStartsAt, now),
          lt(submissions.eventStartsAt, fourteenDaysOut),
          isNull(submissions.featuredInCampaignId),
        ),
      )
      .orderBy(asc(submissions.eventStartsAt))
      .limit(15),
  ]);

  const intel = intelRows.map((r) => ({
    publicId: r.publicId,
    payload: r.payload as IntelPayload,
    publishedAt: r.publishedAt,
  }));
  const events = eventRows.map((r) => ({
    publicId: r.publicId,
    payload: r.payload as EventPayload,
    eventStartsAt: r.eventStartsAt,
  }));

  // If there's literally nothing to send, don't create an empty draft.
  // Reduces noise in the campaigns list during slow weeks.
  if (intel.length === 0 && events.length === 0) {
    return NextResponse.json({
      ok: true,
      skipped: "no intel or upcoming events in window",
      intelCount: 0,
      eventCount: 0,
    });
  }

  const fromName = process.env.DIGEST_FROM_NAME ?? "Rex Intel Services";
  const fromEmail = process.env.DIGEST_FROM_EMAIL;
  if (!fromEmail) {
    return NextResponse.json(
      {
        error:
          "DIGEST_FROM_EMAIL not configured — set it to a verified Resend sender",
      },
      { status: 500 },
    );
  }

  const rendered = renderDigest({ intel, events, baseUrl, issueDate: now });

  const [draft] = await db
    .insert(campaigns)
    .values({
      name: rendered.internalName,
      subject: rendered.subject,
      previewText: rendered.previewText,
      fromName,
      fromEmail: fromEmail.toLowerCase(),
      htmlBody: rendered.htmlBody,
      textBody: rendered.textBody,
      status: "draft",
    })
    .returning({ id: campaigns.id });

  // Stamp every featured submission with the campaign id. This both (a)
  // prevents next week's cron from re-picking the same items and (b) lets
  // the post-send hook find the right submitters to credit.
  const featuredIds = [
    ...intelRows.map((r) => r.id),
    ...eventRows.map((r) => r.id),
  ];
  if (featuredIds.length > 0) {
    await db
      .update(submissions)
      .set({ featuredInCampaignId: draft.id, updatedAt: new Date() })
      .where(inArray(submissions.id, featuredIds));
  }

  return NextResponse.json({
    ok: true,
    campaignId: draft.id,
    intelCount: intel.length,
    eventCount: events.length,
    subject: rendered.subject,
  });
}
