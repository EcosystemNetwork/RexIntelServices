import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  submissions,
  addresses,
  intelAddresses,
  submitters,
} from "@/lib/db";
import type { AddressRole } from "@/lib/db/schema";
import {
  validateIntelPayload,
  validateEventPayload,
  validateJobPayload,
  validateHackathonPayload,
  validatePopupCityPayload,
  validateGrantPayload,
  validateAcceleratorPayload,
  validateCapitalPayload,
  validateResidencyPayload,
  validatePerksPayload,
  validateLossReportPayload,
  sanitizeSingleUrl,
} from "@/lib/submission-validators";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { getMagicSession } from "@/lib/magic-auth";
import { CHAIN_SLUG_SET } from "@/lib/chains";
import { sendEditLinkEmail } from "@/lib/email/edit-link-email";
import { sendAdminAlertEmail } from "@/lib/email/admin-alert-email";
import { absoluteUrl } from "@/lib/site-url";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { detectPotentialDuplicate } from "@/lib/submission-dedup";
import { detailHref } from "@/lib/slug";

type AddressInput = {
  chain: string;
  address: string;
  role: AddressRole;
  label?: string;
};

/**
 * Public API endpoint for community-submitted intel and events.
 * No authentication required — called from the public /submit page.
 *
 * POST /api/submit
 * Body shape varies by `type`:
 *   { type: "intel", payload: IntelPayload, submitterEmail?, submitterHandle?, website? }
 *   { type: "event", payload: EventPayload, submitterEmail?, submitterHandle?, website? }
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  // 5 submissions per IP per 30min. Stricter than newsletter signup because
  // submission spam costs us human moderation time, not just a DB row.
  const limit = await rateLimit(`submit:${ip}`, 5, 30 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  let body: {
    type?:
      | "intel"
      | "event"
      | "job"
      | "grant"
      | "accelerator"
      | "popup_city"
      | "hackathon"
      | "capital"
      | "residency"
      | "perks"
      | "loss_report";
    payload?: unknown;
    addresses?: unknown;
    submitterEmail?: string;
    submitterHandle?: string;
    website?: string;
    turnstileToken?: string;
    // Set true by the client after the user dismisses the "looks like a
    // duplicate" warning. Lets a genuine reposter push through without
    // requiring a moderator to clean up the dup later.
    confirmedNonDuplicate?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Honeypot tripped — record it silently as spam so we can study patterns,
  // and return a generic success so the bot doesn't probe further.
  const honeypotTripped = !!(body.website && body.website.trim() !== "");

  // Turnstile captcha verification. Skipped automatically when env vars
  // aren't set, so local dev + first-deploys aren't blocked.
  const captcha = await verifyTurnstileToken(body.turnstileToken, ip);
  if (!captcha.ok) {
    return NextResponse.json({ error: captcha.error }, { status: 400 });
  }

  const ALL_TYPES = [
    "intel",
    "event",
    "job",
    "grant",
    "accelerator",
    "popup_city",
    "hackathon",
    "capital",
    "residency",
    "perks",
    "loss_report",
  ] as const;
  type SubmissionType = (typeof ALL_TYPES)[number];
  if (!body.type || !ALL_TYPES.includes(body.type as SubmissionType)) {
    return NextResponse.json(
      {
        error:
          "type must be one of: intel, event, job, grant, accelerator, popup_city, hackathon, capital, residency, perks, loss_report",
      },
      { status: 400 },
    );
  }
  const submissionType: SubmissionType = body.type as SubmissionType;

  const validation = (() => {
    switch (submissionType) {
      case "intel":
        return validateIntelPayload(body.payload);
      case "event":
        return validateEventPayload(body.payload);
      case "job":
        return validateJobPayload(body.payload);
      case "grant":
        return validateGrantPayload(body.payload);
      case "accelerator":
        return validateAcceleratorPayload(body.payload);
      case "popup_city":
        return validatePopupCityPayload(body.payload);
      case "hackathon":
        return validateHackathonPayload(body.payload);
      case "capital":
        return validateCapitalPayload(body.payload);
      case "residency":
        return validateResidencyPayload(body.payload);
      case "perks":
        return validatePerksPayload(body.payload);
      case "loss_report":
        return validateLossReportPayload(body.payload);
    }
  })();

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // Soft de-dup: compare the validated payload against recent submissions of
  // the same type for normalized-URL or near-identical-title collisions. If
  // the client sets `confirmedNonDuplicate: true` (after seeing the warning
  // once) we skip the check and let it through.
  if (!honeypotTripped && !body.confirmedNonDuplicate) {
    const dup = await detectPotentialDuplicate({
      type: submissionType,
      payload: validation.payload,
    });
    if (dup) {
      const detailPath =
        submissionType === "popup_city"
          ? "/pop-up-cities"
          : submissionType === "perks"
            ? "/perks"
            : submissionType === "capital"
              ? "/capital"
              : submissionType === "accelerator"
                ? "/accelerators"
                : submissionType === "residency"
                  ? "/residencies"
                  : `/${submissionType}s`;
      return NextResponse.json(
        {
          error: "Looks like this might already be on file.",
          duplicate: {
            publicId: dup.publicId,
            title: dup.title,
            reason: dup.reason,
            similarity: Math.round(dup.similarity * 100) / 100,
            url: absoluteUrl(detailHref(detailPath, dup.publicId, dup.title)),
          },
        },
        { status: 409 },
      );
    }
  }

  let submitterEmail = normalizeEmail(body.submitterEmail);
  if (body.submitterEmail && !submitterEmail) {
    return NextResponse.json(
      { error: "Submitter email is invalid." },
      { status: 400 },
    );
  }

  let submitterHandle = body.submitterHandle?.trim().slice(0, 80) || null;

  // Honor the anonymous contract at the server boundary: if an intel or
  // loss_report submission is flagged anonymous, never persist contact
  // info — even if the client sends it. The form UI hides the inputs
  // already, but a buggy or malicious client must not be able to bypass
  // that promise.
  if (
    (submissionType === "intel" || submissionType === "loss_report") &&
    (validation.payload as { anonymous?: boolean }).anonymous === true
  ) {
    submitterEmail = null;
    submitterHandle = null;
  }

  // Time-anchored lanes have a `startsAt` field — denormalize so the
  // existing eventStartsAt index serves listing queries. Residency and
  // popup_city dates are *optional* (rolling programs have none), so guard
  // against undefined and persist null in that case.
  const isTimeAnchored =
    submissionType === "event" ||
    submissionType === "popup_city" ||
    submissionType === "hackathon" ||
    submissionType === "residency";
  const startsAtRaw = isTimeAnchored
    ? (validation.payload as { startsAt?: string }).startsAt
    : undefined;
  const eventStartsAt = startsAtRaw ? new Date(startsAtRaw) : null;
  // endsAt denormalized so the lane queries can classify "past" as
  // ended-in-the-past, not just started-in-the-past — multi-week hackathons
  // shouldn't fall into Past the day after kickoff.
  const endsAtRaw = isTimeAnchored
    ? (validation.payload as { endsAt?: string }).endsAt
    : undefined;
  const eventEndsAt = endsAtRaw ? new Date(endsAtRaw) : null;

  // Address rows are meaningful for intel and loss_report submissions
  // (the latter being the whole point — victims naming the address(es)
  // that were drained). Validate up front so a bad row fails the whole
  // request before we write anything.
  const addressInputs =
    submissionType === "intel" || submissionType === "loss_report"
      ? sanitizeAddresses(body.addresses)
      : [];

  // Identity resolution order:
  //   1. Anonymous intel → no submitter (whistleblower contract).
  //   2. Magic session present → the email-onboarded contributor IS the
  //      canonical identity. If a handle was also typed in the form,
  //      persist it on the contributor row so the byline reflects the
  //      latest preference. Form email is ignored when a session is active.
  //   3. Email-only path (form-entered email, no signed-in session) →
  //      upsert keyed on lower(email). These rows have no wallet yet; the
  //      submitter can later sign in via Magic to claim them.
  //   4. Neither → no submitter (anonymous, can't earn clearance).
  //
  // Anonymous-intel always wins so a signed-in user can still file a
  // sensitive tip without it getting tied back to them.
  const isAnonymousIntel =
    (submissionType === "intel" || submissionType === "loss_report") &&
    (validation.payload as { anonymous?: boolean }).anonymous === true;
  let submitterId: string | null = null;
  if (!isAnonymousIntel) {
    const session = await getMagicSession();
    if (session) {
      submitterId = session.submitterId;
      if (submitterHandle) {
        // Best-effort handle update — never blocks the submission flow.
        await db
          .update(submitters)
          .set({ displayHandle: submitterHandle, updatedAt: new Date() })
          .where(eq(submitters.id, session.submitterId))
          .catch(() => null);
      }
    } else if (submitterEmail) {
      submitterId = await upsertSubmitter(submitterEmail, submitterHandle);
    }
  }

  // Every submission goes through human review — moderation is the product.
  // Honeypot trips are still recorded so we can study spam patterns, but
  // they're filed as spam, not pending.
  const status: "pending" | "spam" = honeypotTripped ? "spam" : "pending";

  // Edit-token expiry: 1 year from creation. Long enough to forget the
  // email and come back to fix a typo, short enough that a leaked archived
  // inbox can't be used to silently rewrite a 5-year-old listing.
  const editTokenExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  const [created] = await db
    .insert(submissions)
    .values({
      type: submissionType,
      status,
      payload: validation.payload,
      submitterEmail,
      submitterHandle,
      submitterId,
      ipAddress: ip === "unknown" ? null : ip,
      userAgent: req.headers.get("user-agent")?.slice(0, 500) || null,
      honeypotTripped,
      eventStartsAt,
      eventEndsAt,
      publishedAt: null,
      editTokenExpiresAt,
    })
    .returning({ id: submissions.id, editToken: submissions.editToken });

  // Link addresses even on honeypot-tripped submissions so the moderator can
  // still see what was claimed when reviewing spam patterns. The submission
  // status keeps the row out of public listings either way.
  if (created && addressInputs.length) {
    await linkAddressesToSubmission(created.id, addressInputs);
  }

  // Edit link for non-anonymous submitters who provided an email. Honeypot-
  // tripped rows are never emailed — they're spam, no follow-up. Anonymous
  // intel deliberately has no contact info, so no email there either.
  const editUrl = created ? absoluteUrl(`/submit/edit/${created.editToken}`) : null;
  const shouldEmailEdit =
    !!editUrl &&
    !honeypotTripped &&
    !!submitterEmail &&
    submissionType !== "intel" &&
    submissionType !== "loss_report";

  const payloadNameFromValidation = String(
    (validation.payload as { name?: string; headline?: string; title?: string }).name ??
      (validation.payload as { headline?: string }).headline ??
      (validation.payload as { title?: string }).title ??
      "Untitled",
  );

  if (shouldEmailEdit && editUrl && submitterEmail) {
    // Fire and forget — don't make the submitter wait for SMTP. Failures
    // log inside sendEditLinkEmail; the editUrl is also returned in the
    // JSON response so a determined user can copy it from there.
    void sendEditLinkEmail({
      to: submitterEmail,
      submissionType,
      payloadName: payloadNameFromValidation,
      editUrl,
    });
  }

  // Admin alert email so the moderator knows something landed without
  // polling /submissions. Skip honeypot rows (those are noise, not signal).
  // Skip if ADMIN_ALERT_EMAIL isn't configured — sendAdminAlertEmail
  // no-ops cleanly in that case.
  if (created && !honeypotTripped) {
    void sendAdminAlertEmail({
      submissionId: created.id,
      submissionType,
      payloadName: payloadNameFromValidation,
      submitterEmail,
      submitterHandle,
    });
  }

  const SURFACE_LABEL: Record<string, string> = {
    event: "Event",
    popup_city: "Pop-up city",
    hackathon: "Hackathon",
    grant: "Grant program",
    accelerator: "Accelerator",
    capital: "Capital source",
    residency: "Residency",
    perks: "Perk",
    job: "Job posting",
  };
  const label = SURFACE_LABEL[submissionType] ?? "Submission";

  return NextResponse.json({
    ok: true,
    // Echo back so the client can fire one shared analytics call without
    // capturing the literal in each form's closure.
    type: submissionType,
    autoApproved: false,
    // Only surface the edit URL to the client when we'd also email it. Keeps
    // intel/anonymous flows from accidentally rendering an "Edit" button.
    editUrl: shouldEmailEdit ? editUrl : null,
    message:
      submissionType === "intel"
        ? "Intel received. Our analysts will review and respond as warranted."
        : submissionType === "loss_report"
          ? "Loss report received. A curator will review and, if verified, add the addresses to the public graph."
          : `${label} received. We'll review it for the next publication.`,
  });
}

/**
 * Upsert each address into the addresses table and link it to the
 * submission via the intel_addresses junction. Dedupes per (chain,
 * lowercased address) so re-submitting the same address points at the
 * same row.
 */
async function linkAddressesToSubmission(
  submissionId: string,
  inputs: AddressInput[],
) {
  for (const input of inputs) {
    // Try the existing-row path first since it's the common case once the
    // graph has any history.
    const [existing] = await db
      .select({ id: addresses.id })
      .from(addresses)
      .where(
        and(
          eq(addresses.chain, input.chain),
          sql`lower(${addresses.address}) = lower(${input.address})`,
        ),
      )
      .limit(1);

    let addressId = existing?.id;
    if (!addressId) {
      // Defamation guard: a submission is "pending" at this point — no
      // curator approval. Free-form user `label` must NOT land on
      // addresses.label (which renders as the H1 on the address detail
      // page) before review. Labels are only promoted via curator-side
      // tooling or harvester-driven attribution rows.
      const [inserted] = await db
        .insert(addresses)
        .values({
          chain: input.chain,
          address: input.address,
          label: null,
        })
        .onConflictDoNothing()
        .returning({ id: addresses.id });
      if (inserted) {
        addressId = inserted.id;
      } else {
        // A concurrent insert won the race — re-read.
        const [raceRow] = await db
          .select({ id: addresses.id })
          .from(addresses)
          .where(
            and(
              eq(addresses.chain, input.chain),
              sql`lower(${addresses.address}) = lower(${input.address})`,
            ),
          )
          .limit(1);
        addressId = raceRow?.id;
      }
    }

    if (!addressId) continue;

    await db
      .insert(intelAddresses)
      .values({
        submissionId,
        addressId,
        role: input.role,
      })
      .onConflictDoNothing();
  }
}

/**
 * Find-or-create a submitter row keyed by lower(email). Updates display_handle
 * if the caller provided one (so the byline always reflects the most recent
 * preference). Slug is generated once on insert from the handle + a uuid
 * prefix to avoid collisions; never rewritten on subsequent submissions.
 */
async function upsertSubmitter(
  email: string,
  handle: string | null,
): Promise<string | null> {
  const lower = email.toLowerCase();
  const [existing] = await db
    .select({ id: submitters.id })
    .from(submitters)
    .where(sql`lower(${submitters.email}) = ${lower}`)
    .limit(1);

  if (existing) {
    if (handle && handle.trim()) {
      await db
        .update(submitters)
        .set({ displayHandle: handle.trim(), updatedAt: new Date() })
        .where(eq(submitters.id, existing.id));
    }
    return existing.id;
  }

  const displayHandle =
    (handle && handle.trim()) || lower.split("@")[0] || "anon";
  const baseSlug = displayHandle
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 50) || "contributor";

  // Insert with empty slug first, then fill from the freshly-minted id so the
  // uuid prefix guarantees uniqueness without retries.
  const [row] = await db
    .insert(submitters)
    .values({
      email: lower,
      displayHandle,
      slug: "",
    })
    .onConflictDoNothing()
    .returning({ id: submitters.id });

  if (!row) {
    // Lost the race to a concurrent insert — re-read.
    const [raceRow] = await db
      .select({ id: submitters.id })
      .from(submitters)
      .where(sql`lower(${submitters.email}) = ${lower}`)
      .limit(1);
    return raceRow?.id ?? null;
  }

  const slug = `${baseSlug}-${row.id.slice(0, 6)}`;
  await db
    .update(submitters)
    .set({ slug, updatedAt: new Date() })
    .where(eq(submitters.id, row.id));
  return row.id;
}

function normalizeEmail(raw?: string): string | null {
  if (!raw) return null;
  const email = raw.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return null;
  }
  return email;
}


const VALID_ADDRESS_ROLES = ["subject", "counterparty", "observed"] as const;

function sanitizeAddresses(raw: unknown): AddressInput[] {
  if (!Array.isArray(raw)) return [];
  const out: AddressInput[] = [];
  for (const item of raw.slice(0, 25)) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const chain =
      typeof rec.chain === "string" ? rec.chain.toLowerCase().trim() : "";
    const address =
      typeof rec.address === "string" ? rec.address.trim() : "";
    if (!CHAIN_SLUG_SET.has(chain)) continue;
    if (address.length < 4 || address.length > 200) continue;
    const role = VALID_ADDRESS_ROLES.includes(rec.role as never)
      ? (rec.role as AddressRole)
      : "observed";
    const label =
      typeof rec.label === "string" && rec.label.trim()
        ? rec.label.trim().slice(0, 120)
        : undefined;
    out.push({ chain, address, role, label });
  }
  return out;
}
