import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  submissions,
  addresses,
  intelAddresses,
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
  sanitizeSingleUrl,
} from "@/lib/submission-validators";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { CHAIN_SLUG_SET } from "@/lib/chains";
import {
  isTrustedEventUrl,
  isTrustedPopupCityUrl,
  isTrustedHackathonUrl,
  isTrustedJobUrl,
  isTrustedGrantUrl,
  isTrustedAcceleratorUrl,
  isTrustedCapitalUrl,
  isTrustedResidencyUrl,
} from "@/lib/event-parser";
import { sendEditLinkEmail } from "@/lib/email/edit-link-email";
import { sendAdminAlertEmail } from "@/lib/email/admin-alert-email";
import { absoluteUrl } from "@/lib/site-url";
import { verifyTurnstileToken } from "@/lib/turnstile";

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
      | "residency";
    payload?: unknown;
    addresses?: unknown;
    submitterEmail?: string;
    submitterHandle?: string;
    website?: string;
    turnstileToken?: string;
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
  ] as const;
  type SubmissionType = (typeof ALL_TYPES)[number];
  if (!body.type || !ALL_TYPES.includes(body.type as SubmissionType)) {
    return NextResponse.json(
      {
        error:
          "type must be one of: intel, event, job, grant, accelerator, popup_city, hackathon, capital, residency",
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
    }
  })();

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  let submitterEmail = normalizeEmail(body.submitterEmail);
  if (body.submitterEmail && !submitterEmail) {
    return NextResponse.json(
      { error: "Submitter email is invalid." },
      { status: 400 },
    );
  }

  let submitterHandle = body.submitterHandle?.trim().slice(0, 80) || null;

  // Honor the anonymous contract at the server boundary: if an intel
  // submission is flagged anonymous, never persist contact info — even if
  // the client sends it. The form UI hides the inputs already, but a buggy
  // or malicious client must not be able to bypass that promise.
  if (
    submissionType === "intel" &&
    (validation.payload as { anonymous?: boolean }).anonymous === true
  ) {
    submitterEmail = null;
    submitterHandle = null;
  }

  // Both events and pop-up cities have a `startsAt` field — denormalize so
  // the existing eventStartsAt index serves both listing queries.
  const isTimeAnchored =
    submissionType === "event" ||
    submissionType === "popup_city" ||
    submissionType === "hackathon" ||
    submissionType === "residency";
  const eventStartsAt = isTimeAnchored
    ? new Date((validation.payload as { startsAt: string }).startsAt)
    : null;
  // endsAt denormalized so the lane queries can classify "past" as
  // ended-in-the-past, not just started-in-the-past — multi-week hackathons
  // shouldn't fall into Past the day after kickoff.
  const endsAtRaw = isTimeAnchored
    ? (validation.payload as { endsAt?: string }).endsAt
    : undefined;
  const eventEndsAt = endsAtRaw ? new Date(endsAtRaw) : null;

  // Address rows are only meaningful for intel submissions. Validate up
  // front so a bad row fails the whole request before we write anything.
  const addressInputs =
    submissionType === "intel" ? sanitizeAddresses(body.addresses) : [];

  // Trust-tier auto-approval per surface. Intel always goes through human
  // review — moderation is the product. Each other surface has its own
  // allowlist of hosts that we'll trust to vet content.
  // Pull whichever public URL the payload provides — different types use
  // different field names. Capital uses pitchUrl; jobs use companyUrl;
  // others use url/applyUrl. Trust verdict is based on whichever one we
  // find first.
  const payloadUrl = (validation.payload as { url?: string }).url
    ?? (validation.payload as { applyUrl?: string }).applyUrl
    ?? (validation.payload as { pitchUrl?: string }).pitchUrl
    ?? (validation.payload as { companyUrl?: string }).companyUrl
    ?? (validation.payload as { organizationUrl?: string }).organizationUrl;

  const autoApprove =
    !honeypotTripped &&
    body.type !== "intel" &&
    ((submissionType === "event" && isTrustedEventUrl(payloadUrl)) ||
      (submissionType === "popup_city" && isTrustedPopupCityUrl(payloadUrl)) ||
      (submissionType === "hackathon" && isTrustedHackathonUrl(payloadUrl)) ||
      (submissionType === "grant" && isTrustedGrantUrl(payloadUrl)) ||
      (submissionType === "accelerator" && isTrustedAcceleratorUrl(payloadUrl)) ||
      (submissionType === "capital" && isTrustedCapitalUrl(payloadUrl)) ||
      (submissionType === "residency" && isTrustedResidencyUrl(payloadUrl)) ||
      (submissionType === "job" && isTrustedJobUrl(payloadUrl)));

  const status: "approved" | "pending" | "spam" = honeypotTripped
    ? "spam"
    : autoApprove
      ? "approved"
      : "pending";

  const [created] = await db
    .insert(submissions)
    .values({
      type: submissionType,
      status,
      payload: validation.payload,
      submitterEmail,
      submitterHandle,
      ipAddress: ip === "unknown" ? null : ip,
      userAgent: req.headers.get("user-agent")?.slice(0, 500) || null,
      honeypotTripped,
      eventStartsAt,
      eventEndsAt,
      publishedAt: autoApprove ? new Date() : null,
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
    submissionType !== "intel";

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
      autoApproved: autoApprove,
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
    job: "Job posting",
  };
  const label = SURFACE_LABEL[submissionType] ?? "Submission";

  return NextResponse.json({
    ok: true,
    // Echo back so the client can fire one shared analytics call without
    // capturing the literal in each form's closure.
    type: submissionType,
    autoApproved: autoApprove,
    // Only surface the edit URL to the client when we'd also email it. Keeps
    // intel/anonymous flows from accidentally rendering an "Edit" button.
    editUrl: shouldEmailEdit ? editUrl : null,
    message:
      submissionType === "intel"
        ? "Intel received. Our analysts will review and respond as warranted."
        : autoApprove
          ? `${label} published. It's live now.`
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
      const [inserted] = await db
        .insert(addresses)
        .values({
          chain: input.chain,
          address: input.address,
          label: input.label || null,
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
