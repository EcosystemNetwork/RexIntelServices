import { NextResponse } from "next/server";
import { and, asc, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { db, submissions, campaigns } from "@/lib/db";
import type {
  IntelPayload,
  EventPayload,
  PopupCityPayload,
  GrantPayload,
  AcceleratorPayload,
} from "@/lib/db/schema";
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

  // Pop-up cities use a longer lookahead (60 days) since residencies usually
  // have an application deadline weeks before they start. Grants + accelerators
  // are sorted by recency-of-publication — fresh listings bubble up.
  const sixtyDaysOut = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Exclude submissions already featured in a previous digest. This keeps
  // each item from showing up week after week if it's still in the lookback
  // window, and means an empty week is genuinely empty (not a re-run).
  const [intelRows, eventRows, popupRows, grantRows, acceleratorRows] =
    await Promise.all([
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
            eq(submissions.type, "popup_city"),
            eq(submissions.status, "approved"),
            gte(submissions.eventStartsAt, now),
            lt(submissions.eventStartsAt, sixtyDaysOut),
            isNull(submissions.featuredInCampaignId),
          ),
        )
        .orderBy(asc(submissions.eventStartsAt))
        .limit(5),
      db
        .select({
          id: submissions.id,
          publicId: submissions.publicId,
          payload: submissions.payload,
        })
        .from(submissions)
        .where(
          and(
            eq(submissions.type, "grant"),
            eq(submissions.status, "approved"),
            gte(submissions.publishedAt, thirtyDaysAgo),
            isNull(submissions.featuredInCampaignId),
          ),
        )
        .orderBy(desc(submissions.publishedAt))
        .limit(5),
      db
        .select({
          id: submissions.id,
          publicId: submissions.publicId,
          payload: submissions.payload,
        })
        .from(submissions)
        .where(
          and(
            eq(submissions.type, "accelerator"),
            eq(submissions.status, "approved"),
            gte(submissions.publishedAt, thirtyDaysAgo),
            isNull(submissions.featuredInCampaignId),
          ),
        )
        .orderBy(desc(submissions.publishedAt))
        .limit(5),
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
  const popupCities = popupRows.map((r) => ({
    publicId: r.publicId,
    payload: r.payload as PopupCityPayload,
    eventStartsAt: r.eventStartsAt,
  }));
  const grants = grantRows.map((r) => ({
    publicId: r.publicId,
    payload: r.payload as GrantPayload,
  }));
  const accelerators = acceleratorRows.map((r) => ({
    publicId: r.publicId,
    payload: r.payload as AcceleratorPayload,
  }));

  // If there's literally nothing to send across any board, don't create an
  // empty draft. Reduces noise in the campaigns list during slow weeks.
  const totalItems =
    intel.length +
    events.length +
    popupCities.length +
    grants.length +
    accelerators.length;
  if (totalItems === 0) {
    return NextResponse.json({
      ok: true,
      skipped: "no new content across any board in window",
      counts: {
        intel: 0,
        events: 0,
        popupCities: 0,
        grants: 0,
        accelerators: 0,
      },
    });
  }

  // Editorial bar: every issue ships with ≥1 piece of original signal.
  // (Committed 2026-05-09; see project_beat_cryptonomads_plan.md.) Requires
  // both (a) kind ∈ {original, incident} and (b) sourceGrade != hearsay so
  // unverified rumor never anchors the issue. Rows with no sourceGrade set
  // are treated as eligible (legacy + ungraded grace). The bypass env var
  // lets us run the cron in dev / staging without seed content.
  const originalIntelCount = intel.filter(
    (i) =>
      (i.payload.kind === "original" || i.payload.kind === "incident") &&
      i.payload.sourceGrade !== "hearsay",
  ).length;
  const bypassEditorialBar =
    process.env.DIGEST_BYPASS_EDITORIAL_BAR === "true";
  if (originalIntelCount === 0 && !bypassEditorialBar) {
    return NextResponse.json({
      ok: true,
      skipped:
        "editorial bar not met — no original-signal intel in window. Set DIGEST_BYPASS_EDITORIAL_BAR=true to override.",
      counts: {
        intel: intel.length,
        original: 0,
        events: events.length,
        popupCities: popupCities.length,
        grants: grants.length,
        accelerators: accelerators.length,
      },
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

  const rendered = renderDigest({
    intel,
    events,
    popupCities,
    grants,
    accelerators,
    baseUrl,
    issueDate: now,
  });

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
    ...popupRows.map((r) => r.id),
    ...grantRows.map((r) => r.id),
    ...acceleratorRows.map((r) => r.id),
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
    counts: {
      intel: intel.length,
      events: events.length,
      popupCities: popupCities.length,
      grants: grants.length,
      accelerators: accelerators.length,
    },
    subject: rendered.subject,
  });
}
