import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  submissions,
  addresses,
  intelAddresses,
} from "@/lib/db";
import type {
  IntelPayload,
  EventPayload,
  JobPayload,
  PopupCityPayload,
  GrantPayload,
  AcceleratorPayload,
  AddressRole,
} from "@/lib/db/schema";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { CHAIN_SLUG_SET } from "@/lib/chains";
import {
  isTrustedEventUrl,
  isTrustedPopupCityUrl,
  isTrustedJobUrl,
  isTrustedGrantUrl,
  isTrustedAcceleratorUrl,
} from "@/lib/event-parser";

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
  const limit = rateLimit(`submit:${ip}`, 5, 30 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  let body: {
    type?: "intel" | "event" | "job" | "grant" | "accelerator" | "popup_city";
    payload?: unknown;
    addresses?: unknown;
    submitterEmail?: string;
    submitterHandle?: string;
    website?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Honeypot tripped — record it silently as spam so we can study patterns,
  // and return a generic success so the bot doesn't probe further.
  const honeypotTripped = !!(body.website && body.website.trim() !== "");

  const ALL_TYPES = [
    "intel",
    "event",
    "job",
    "grant",
    "accelerator",
    "popup_city",
  ] as const;
  type SubmissionType = (typeof ALL_TYPES)[number];
  if (!body.type || !ALL_TYPES.includes(body.type as SubmissionType)) {
    return NextResponse.json(
      {
        error:
          "type must be one of: intel, event, job, grant, accelerator, popup_city",
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
  const eventStartsAt =
    submissionType === "event" || submissionType === "popup_city"
      ? new Date(
          (validation.payload as { startsAt: string }).startsAt,
        )
      : null;

  // Address rows are only meaningful for intel submissions. Validate up
  // front so a bad row fails the whole request before we write anything.
  const addressInputs =
    submissionType === "intel" ? sanitizeAddresses(body.addresses) : [];

  // Trust-tier auto-approval per surface. Intel always goes through human
  // review — moderation is the product. Each other surface has its own
  // allowlist of hosts that we'll trust to vet content.
  const payloadUrl = (validation.payload as { url?: string; applyUrl?: string; companyUrl?: string }).url
    ?? (validation.payload as { applyUrl?: string }).applyUrl
    ?? (validation.payload as { companyUrl?: string }).companyUrl;

  const autoApprove =
    !honeypotTripped &&
    body.type !== "intel" &&
    ((submissionType === "event" && isTrustedEventUrl(payloadUrl)) ||
      (submissionType === "popup_city" && isTrustedPopupCityUrl(payloadUrl)) ||
      (submissionType === "grant" && isTrustedGrantUrl(payloadUrl)) ||
      (submissionType === "accelerator" && isTrustedAcceleratorUrl(payloadUrl)) ||
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
      publishedAt: autoApprove ? new Date() : null,
    })
    .returning({ id: submissions.id });

  // Link addresses even on honeypot-tripped submissions so the moderator can
  // still see what was claimed when reviewing spam patterns. The submission
  // status keeps the row out of public listings either way.
  if (created && addressInputs.length) {
    await linkAddressesToSubmission(created.id, addressInputs);
  }

  const SURFACE_LABEL: Record<string, string> = {
    event: "Event",
    popup_city: "Pop-up city",
    grant: "Grant program",
    accelerator: "Accelerator",
    job: "Job posting",
  };
  const label = SURFACE_LABEL[submissionType] ?? "Submission";

  return NextResponse.json({
    ok: true,
    autoApproved: autoApprove,
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

function validateIntelPayload(
  raw: unknown,
):
  | { ok: true; payload: IntelPayload }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "payload is required" };
  }
  const p = raw as Record<string, unknown>;

  const headline =
    typeof p.headline === "string" ? p.headline.trim() : "";
  const body = typeof p.body === "string" ? p.body.trim() : "";

  if (headline.length < 5 || headline.length > 200) {
    return { ok: false, error: "Headline must be 5–200 characters." };
  }
  if (body.length < 20 || body.length > 5000) {
    return { ok: false, error: "Body must be 20–5000 characters." };
  }

  const links = sanitizeUrlList(p.links);
  const sources = sanitizeUrlList(p.sources);

  const severity = (["low", "medium", "high", "critical"] as const).includes(
    p.severity as never,
  )
    ? (p.severity as IntelPayload["severity"])
    : undefined;

  const category =
    typeof p.category === "string" && p.category.trim()
      ? p.category.trim().slice(0, 60)
      : undefined;

  return {
    ok: true,
    payload: {
      headline,
      body,
      links: links.length ? links : undefined,
      sources: sources.length ? sources : undefined,
      severity,
      category,
      anonymous: p.anonymous === true,
    },
  };
}

function validateEventPayload(
  raw: unknown,
):
  | { ok: true; payload: EventPayload }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "payload is required" };
  }
  const p = raw as Record<string, unknown>;

  const name = typeof p.name === "string" ? p.name.trim() : "";
  if (name.length < 3 || name.length > 200) {
    return { ok: false, error: "Event name must be 3–200 characters." };
  }

  const startsAt = typeof p.startsAt === "string" ? p.startsAt.trim() : "";
  if (!startsAt || isNaN(Date.parse(startsAt))) {
    return { ok: false, error: "Start date is required (ISO format)." };
  }

  const endsAt =
    typeof p.endsAt === "string" && p.endsAt.trim() && !isNaN(Date.parse(p.endsAt))
      ? p.endsAt.trim()
      : undefined;

  const url = sanitizeSingleUrl(p.url);
  const validEventTypes = [
    "conference",
    "workshop",
    "meetup",
    "hackathon",
    "other",
  ] as const;
  const validPriceTiers = ["free", "paid", "invite"] as const;

  return {
    ok: true,
    payload: {
      name,
      startsAt,
      endsAt,
      venue: trimToString(p.venue, 200),
      city: trimToString(p.city, 100),
      country: trimToString(p.country, 100),
      url,
      description: trimToString(p.description, 1000),
      eventType: validEventTypes.includes(p.eventType as never)
        ? (p.eventType as EventPayload["eventType"])
        : undefined,
      priceTier: validPriceTiers.includes(p.priceTier as never)
        ? (p.priceTier as EventPayload["priceTier"])
        : undefined,
      // imageUrl comes from the parse-url prefill (lu.ma CDN, etc.). Use the
      // same single-URL sanitizer as `url` to enforce http(s) and length.
      imageUrl: sanitizeSingleUrl(p.imageUrl),
    },
  };
}

function validateJobPayload(
  raw: unknown,
): { ok: true; payload: JobPayload } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "payload is required" };
  const p = raw as Record<string, unknown>;
  const title = typeof p.title === "string" ? p.title.trim() : "";
  const company = typeof p.company === "string" ? p.company.trim() : "";
  const description = typeof p.description === "string" ? p.description.trim() : "";

  if (title.length < 3 || title.length > 200)
    return { ok: false, error: "Job title must be 3–200 characters." };
  if (company.length < 2 || company.length > 120)
    return { ok: false, error: "Company name must be 2–120 characters." };
  if (description.length < 20 || description.length > 5000)
    return { ok: false, error: "Description must be 20–5000 characters." };

  const validEmploymentTypes = ["full-time", "part-time", "contract", "internship"] as const;
  const validSeniorities = ["junior", "mid", "senior", "staff", "principal", "exec"] as const;

  const expiresAt =
    typeof p.expiresAt === "string" && p.expiresAt.trim() && !isNaN(Date.parse(p.expiresAt))
      ? p.expiresAt.trim()
      : undefined;

  return {
    ok: true,
    payload: {
      title,
      company,
      companyUrl: sanitizeSingleUrl(p.companyUrl),
      description,
      location: trimToString(p.location, 200),
      remote: p.remote === true,
      employmentType: validEmploymentTypes.includes(p.employmentType as never)
        ? (p.employmentType as JobPayload["employmentType"])
        : undefined,
      seniority: validSeniorities.includes(p.seniority as never)
        ? (p.seniority as JobPayload["seniority"])
        : undefined,
      compensation: trimToString(p.compensation, 200),
      applyUrl: sanitizeSingleUrl(p.applyUrl),
      tags: sanitizeTagList(p.tags),
      expiresAt,
      imageUrl: sanitizeSingleUrl(p.imageUrl),
    },
  };
}

function validatePopupCityPayload(
  raw: unknown,
): { ok: true; payload: PopupCityPayload } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "payload is required" };
  const p = raw as Record<string, unknown>;
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const description = typeof p.description === "string" ? p.description.trim() : "";
  if (name.length < 3 || name.length > 200)
    return { ok: false, error: "Name must be 3–200 characters." };
  if (description.length < 20 || description.length > 5000)
    return { ok: false, error: "Description must be 20–5000 characters." };

  const startsAt = typeof p.startsAt === "string" ? p.startsAt.trim() : "";
  if (!startsAt || isNaN(Date.parse(startsAt)))
    return { ok: false, error: "Start date is required (ISO format)." };
  const endsAt = typeof p.endsAt === "string" ? p.endsAt.trim() : "";
  if (!endsAt || isNaN(Date.parse(endsAt)))
    return { ok: false, error: "End date is required (ISO format)." };

  const applicationDeadline =
    typeof p.applicationDeadline === "string" &&
    p.applicationDeadline.trim() &&
    !isNaN(Date.parse(p.applicationDeadline))
      ? p.applicationDeadline.trim()
      : undefined;

  return {
    ok: true,
    payload: {
      name,
      organization: trimToString(p.organization, 120),
      organizationUrl: sanitizeSingleUrl(p.organizationUrl),
      description,
      startsAt,
      endsAt,
      city: trimToString(p.city, 100),
      country: trimToString(p.country, 100),
      venue: trimToString(p.venue, 200),
      url: sanitizeSingleUrl(p.url),
      applyUrl: sanitizeSingleUrl(p.applyUrl),
      applicationDeadline,
      focus: trimToString(p.focus, 200),
      tags: sanitizeTagList(p.tags),
      imageUrl: sanitizeSingleUrl(p.imageUrl),
    },
  };
}

function validateGrantPayload(
  raw: unknown,
): { ok: true; payload: GrantPayload } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "payload is required" };
  const p = raw as Record<string, unknown>;
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const organization = typeof p.organization === "string" ? p.organization.trim() : "";
  const description = typeof p.description === "string" ? p.description.trim() : "";
  if (name.length < 3 || name.length > 200)
    return { ok: false, error: "Grant name must be 3–200 characters." };
  if (organization.length < 2 || organization.length > 120)
    return { ok: false, error: "Organization must be 2–120 characters." };
  if (description.length < 20 || description.length > 5000)
    return { ok: false, error: "Description must be 20–5000 characters." };

  const deadline =
    typeof p.deadline === "string" && p.deadline.trim() && !isNaN(Date.parse(p.deadline))
      ? p.deadline.trim()
      : undefined;

  return {
    ok: true,
    payload: {
      name,
      organization,
      organizationUrl: sanitizeSingleUrl(p.organizationUrl),
      description,
      amount: trimToString(p.amount, 200),
      focus: trimToString(p.focus, 200),
      applyUrl: sanitizeSingleUrl(p.applyUrl),
      deadline,
      rolling: p.rolling === true,
      tags: sanitizeTagList(p.tags),
      imageUrl: sanitizeSingleUrl(p.imageUrl),
    },
  };
}

function validateAcceleratorPayload(
  raw: unknown,
): { ok: true; payload: AcceleratorPayload } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "payload is required" };
  const p = raw as Record<string, unknown>;
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const organization = typeof p.organization === "string" ? p.organization.trim() : "";
  const description = typeof p.description === "string" ? p.description.trim() : "";
  if (name.length < 3 || name.length > 200)
    return { ok: false, error: "Program name must be 3–200 characters." };
  if (organization.length < 2 || organization.length > 120)
    return { ok: false, error: "Organization must be 2–120 characters." };
  if (description.length < 20 || description.length > 5000)
    return { ok: false, error: "Description must be 20–5000 characters." };

  const nextDeadline =
    typeof p.nextDeadline === "string" &&
    p.nextDeadline.trim() &&
    !isNaN(Date.parse(p.nextDeadline))
      ? p.nextDeadline.trim()
      : undefined;

  return {
    ok: true,
    payload: {
      name,
      organization,
      organizationUrl: sanitizeSingleUrl(p.organizationUrl),
      description,
      duration: trimToString(p.duration, 100),
      investment: trimToString(p.investment, 200),
      location: trimToString(p.location, 200),
      focus: trimToString(p.focus, 200),
      applyUrl: sanitizeSingleUrl(p.applyUrl),
      nextDeadline,
      rolling: p.rolling === true,
      tags: sanitizeTagList(p.tags),
      imageUrl: sanitizeSingleUrl(p.imageUrl),
    },
  };
}

function sanitizeTagList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim().slice(0, 40))
    .filter((x) => x.length > 0)
    .slice(0, 12);
  return out.length ? out : undefined;
}

function trimToString(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

function sanitizeSingleUrl(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return undefined;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    return u.toString().slice(0, 500);
  } catch {
    return undefined;
  }
}

function sanitizeUrlList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => sanitizeSingleUrl(x))
    .filter((x): x is string => !!x)
    .slice(0, 10);
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
