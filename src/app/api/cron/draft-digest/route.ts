import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { and, asc, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { db, submissions, campaigns, tags } from "@/lib/db";
import type {
  IntelPayload,
  EventPayload,
  PopupCityPayload,
  GrantPayload,
  AcceleratorPayload,
} from "@/lib/db/schema";
import { renderDigest } from "@/lib/email/digest-template";
import type { PersonaSlug } from "@/lib/personas";

/**
 * Persona variants the cron drafts every Monday. Order is the order drafts
 * appear in the admin's campaigns list. Kept tight (3 — not all 9 slugs) so
 * the admin's Monday review fits on one screen; expand once routing is
 * proving out. Buyer-set for the paid feed pitch sits inside this trio.
 */
const PRIORITY_PERSONAS: readonly PersonaSlug[] = [
  "compliance",
  "investigator",
  "fund-risk",
] as const;

/**
 * GET /api/cron/draft-digest
 *
 * Triggered by Vercel Cron (see vercel.json). Pulls recently-approved intel
 * + upcoming events and creates one DRAFT campaign per priority persona.
 * The admin reviews and clicks "send" Monday morning — the cron never sends
 * on its own.
 *
 * Auth: same Bearer ${CRON_SECRET} pattern as dispatch-scheduled.
 *
 * Idempotency: each persona's draft is skipped if a campaign with its
 * deterministic name already exists for today. Lets the cron be safely
 * re-triggered manually for debugging — a persona that already shipped a
 * draft is left untouched while missing personas are filled in.
 */
export async function GET(req: Request) {
  const fail = verifyCronSecret(req);
  if (fail) return NextResponse.json(fail.body, { status: fail.status });

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const sixtyDaysOut = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  const isoDate = now.toISOString().slice(0, 10);

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

  // Look up persona → tags.id once so we can stamp campaigns.targetTagIds.
  // A persona slug missing from the tags table is non-fatal: that variant
  // simply skips (rather than mis-routing to all subscribers).
  const personaTagRows = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(
      and(
        eq(tags.kind, "persona"),
        inArray(tags.name, [...PRIORITY_PERSONAS]),
      ),
    );
  const personaTagIdBySlug = new Map<PersonaSlug, string>();
  for (const row of personaTagRows) {
    if ((PRIORITY_PERSONAS as readonly string[]).includes(row.name)) {
      personaTagIdBySlug.set(row.name as PersonaSlug, row.id);
    }
  }

  // Pull every approved row in window once. We then filter intel per-persona
  // in-app (jsonb personas[] is awkward to filter in SQL, and the row counts
  // are small). Events/popups/grants/accelerators are persona-agnostic — they
  // ride every draft.
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
        .limit(40),
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

  const allIntel = intelRows.map((r) => ({
    id: r.id,
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

  const totalItems =
    allIntel.length +
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

  const bypassEditorialBar =
    process.env.DIGEST_BYPASS_EDITORIAL_BAR === "true";
  const drafts: Array<{
    persona: PersonaSlug;
    status: "created" | "skipped";
    reason?: string;
    campaignId?: string;
    counts?: {
      intel: number;
      original: number;
      events: number;
      popupCities: number;
      grants: number;
      accelerators: number;
    };
    subject?: string;
  }> = [];

  // Accumulate submission ids stamped with featuredInCampaignId across the
  // run. Each id stamped at most once — points at the first draft that
  // included it. Stops next week's cron from re-picking the same items even
  // though several drafts referenced them this week.
  const stampedIntelIds = new Set<string>();
  const stampedEventIds = new Set<string>();
  const stampedPopupIds = new Set<string>();
  const stampedGrantIds = new Set<string>();
  const stampedAcceleratorIds = new Set<string>();
  const stampMap = new Map<string, string>(); // submissionId → campaignId

  for (const persona of PRIORITY_PERSONAS) {
    const personaTagId = personaTagIdBySlug.get(persona);
    if (!personaTagId) {
      drafts.push({
        persona,
        status: "skipped",
        reason: `no tags row with kind=persona name=${persona}`,
      });
      continue;
    }

    // Empty/undefined personas[] = "all personas" — grace rule mirrors
    // ungraded sourceGrade. Lets legacy intel still ship while contributors
    // adopt the new field.
    const intelForPersona = allIntel.filter((i) => {
      const list = i.payload.personas;
      return !list || list.length === 0 || list.includes(persona);
    });

    const originalIntelCount = intelForPersona.filter(
      (i) =>
        (i.payload.kind === "original" || i.payload.kind === "incident") &&
        i.payload.sourceGrade !== "hearsay",
    ).length;

    if (originalIntelCount === 0 && !bypassEditorialBar) {
      drafts.push({
        persona,
        status: "skipped",
        reason: "editorial bar not met for this persona",
      });
      continue;
    }

    const internalName = `Weekly Briefing [${persona}] — ${isoDate}`;
    const [existing] = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(eq(campaigns.name, internalName))
      .limit(1);

    if (existing) {
      drafts.push({
        persona,
        status: "skipped",
        reason: "draft for this persona already exists today",
        campaignId: existing.id,
      });
      continue;
    }

    const rendered = renderDigest({
      intel: intelForPersona.map((i) => ({
        publicId: i.publicId,
        payload: i.payload,
        publishedAt: i.publishedAt,
      })),
      events,
      popupCities,
      grants,
      accelerators,
      baseUrl,
      issueDate: now,
      persona,
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
        targetTagIds: [personaTagId],
      })
      .returning({ id: campaigns.id });

    // First persona that uses a submission "owns" the stamp. Doesn't matter
    // materially — both campaigns reference the row, the stamp just gates
    // next week's re-pick. Picking the first keeps it deterministic.
    for (const i of intelForPersona) {
      if (!stampedIntelIds.has(i.id)) {
        stampedIntelIds.add(i.id);
        stampMap.set(i.id, draft.id);
      }
    }
    for (const r of eventRows) {
      if (!stampedEventIds.has(r.id)) {
        stampedEventIds.add(r.id);
        stampMap.set(r.id, draft.id);
      }
    }
    for (const r of popupRows) {
      if (!stampedPopupIds.has(r.id)) {
        stampedPopupIds.add(r.id);
        stampMap.set(r.id, draft.id);
      }
    }
    for (const r of grantRows) {
      if (!stampedGrantIds.has(r.id)) {
        stampedGrantIds.add(r.id);
        stampMap.set(r.id, draft.id);
      }
    }
    for (const r of acceleratorRows) {
      if (!stampedAcceleratorIds.has(r.id)) {
        stampedAcceleratorIds.add(r.id);
        stampMap.set(r.id, draft.id);
      }
    }

    drafts.push({
      persona,
      status: "created",
      campaignId: draft.id,
      counts: {
        intel: intelForPersona.length,
        original: originalIntelCount,
        events: events.length,
        popupCities: popupCities.length,
        grants: grants.length,
        accelerators: accelerators.length,
      },
      subject: rendered.subject,
    });
  }

  // Stamp each submission with its owning campaign id. One UPDATE per
  // campaign keeps round-trips down; we group ids by the campaign that
  // claimed them.
  const idsByCampaign = new Map<string, string[]>();
  for (const [submissionId, campaignId] of stampMap) {
    const arr = idsByCampaign.get(campaignId) ?? [];
    arr.push(submissionId);
    idsByCampaign.set(campaignId, arr);
  }
  for (const [campaignId, ids] of idsByCampaign) {
    await db
      .update(submissions)
      .set({ featuredInCampaignId: campaignId, updatedAt: new Date() })
      .where(inArray(submissions.id, ids));
  }

  return NextResponse.json({
    ok: true,
    drafts,
    pool: {
      intel: allIntel.length,
      events: events.length,
      popupCities: popupCities.length,
      grants: grants.length,
      accelerators: accelerators.length,
    },
  });
}
