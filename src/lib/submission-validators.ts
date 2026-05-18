import type {
  IntelPayload,
  IntelMedia,
  EventPayload,
  JobPayload,
  HackathonPayload,
  PopupCityPayload,
  GrantPayload,
  AcceleratorPayload,
  CapitalPayload,
  ResidencyPayload,
  PerksPayload,
  FellowshipPayload,
  LossReportPayload,
  SubmissionPayload,
} from "@/lib/db/schema";
import { PERSONA_SLUGS, type PersonaSlug } from "@/lib/personas";

/**
 * Per-type payload validators + the small set of string/URL/tag sanitizers
 * they share. Pulled out of /api/submit/route.ts so the edit endpoint
 * (/api/submissions/edit/[token]) can apply the same rules to incoming
 * payloads without duplicating the logic.
 *
 * All validators return a discriminated `Result<T>` so callers can branch on
 * `.ok` and either persist `.payload` or surface `.error` to the client.
 */

export type ValidationResult<T> =
  | { ok: true; payload: T }
  | { ok: false; error: string };

export type SubmissionType =
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
  | "fellowship"
  | "loss_report";

/** Dispatch by submission type. Useful when the caller has a runtime string. */
export function validateBySubmissionType(
  type: SubmissionType,
  raw: unknown,
): ValidationResult<SubmissionPayload> {
  switch (type) {
    case "intel":
      return validateIntelPayload(raw);
    case "event":
      return validateEventPayload(raw);
    case "job":
      return validateJobPayload(raw);
    case "grant":
      return validateGrantPayload(raw);
    case "accelerator":
      return validateAcceleratorPayload(raw);
    case "popup_city":
      return validatePopupCityPayload(raw);
    case "hackathon":
      return validateHackathonPayload(raw);
    case "capital":
      return validateCapitalPayload(raw);
    case "residency":
      return validateResidencyPayload(raw);
    case "perks":
      return validatePerksPayload(raw);
    case "fellowship":
      return validateFellowshipPayload(raw);
    case "loss_report":
      return validateLossReportPayload(raw);
  }
}

export function validateIntelPayload(
  raw: unknown,
): ValidationResult<IntelPayload> {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "payload is required" };
  }
  const p = raw as Record<string, unknown>;

  const headline = typeof p.headline === "string" ? p.headline.trim() : "";
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

  const kind = (["tip", "original", "incident"] as const).includes(
    p.kind as never,
  )
    ? (p.kind as IntelPayload["kind"])
    : undefined;

  const sourceGrade = (["primary", "secondary", "hearsay"] as const).includes(
    p.sourceGrade as never,
  )
    ? (p.sourceGrade as IntelPayload["sourceGrade"])
    : undefined;

  const archiveUrl = sanitizeSingleUrl(p.archiveUrl);
  const personas = sanitizePersonaList(p.personas);

  const heroImageUrl = sanitizeSingleUrl(p.heroImageUrl);
  const heroVideoUrl = sanitizeSingleUrl(p.heroVideoUrl);
  const heroPoster = sanitizeSingleUrl(p.heroPoster);
  const heroAlt = trimToString(p.heroAlt, 200);
  const heroCaption = trimToString(p.heroCaption, 400);
  const heroCredit = trimToString(p.heroCredit, 200);
  const dek = trimToString(p.dek, 300);
  const media = sanitizeIntelMediaList(p.media);
  const bodyFormat =
    p.bodyFormat === "markdown" || p.bodyFormat === "plain"
      ? (p.bodyFormat as "markdown" | "plain")
      : undefined;

  return {
    ok: true,
    payload: {
      headline,
      body,
      dek,
      links: links.length ? links : undefined,
      sources: sources.length ? sources : undefined,
      severity,
      category,
      anonymous: p.anonymous === true,
      kind,
      sourceGrade,
      archiveUrl,
      personas,
      heroImageUrl,
      heroVideoUrl,
      heroPoster,
      heroAlt,
      heroCaption,
      heroCredit,
      media,
      bodyFormat,
    },
  };
}

// Caps payload bloat + filters out anything that isn't a real http(s) URL
// referencing an image / video / embeddable host. The renderer trusts the
// kind tag — anything mis-tagged here renders as a broken figure, which is
// a visible-on-review failure (good).
const MEDIA_KINDS = ["image", "video", "embed"] as const;
function sanitizeIntelMediaList(v: unknown): IntelMedia[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: IntelMedia[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const m = raw as Record<string, unknown>;
    const url = sanitizeSingleUrl(m.url);
    if (!url) continue;
    if (!MEDIA_KINDS.includes(m.kind as never)) continue;
    out.push({
      kind: m.kind as IntelMedia["kind"],
      url,
      caption: trimToString(m.caption, 400),
      alt: trimToString(m.alt, 200),
      credit: trimToString(m.credit, 200),
      poster: sanitizeSingleUrl(m.poster),
    });
    if (out.length >= 12) break;
  }
  return out.length ? out : undefined;
}

const LOSS_TYPES = [
  "phishing",
  "drain",
  "sim-swap",
  "exploit",
  "lost-keys",
  "rug-pull",
  "other",
] as const;

export function validateLossReportPayload(
  raw: unknown,
): ValidationResult<LossReportPayload> {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "payload is required" };
  }
  const p = raw as Record<string, unknown>;

  const headline = typeof p.headline === "string" ? p.headline.trim() : "";
  if (headline.length < 5 || headline.length > 200) {
    return { ok: false, error: "Headline must be 5–200 characters." };
  }

  const story = typeof p.story === "string" ? p.story.trim() : "";
  if (story.length < 50 || story.length > 3000) {
    return {
      ok: false,
      error:
        "Tell us what happened — at least 50 characters (max 3000). Include dates, services involved, and any tx hashes you have.",
    };
  }

  if (!LOSS_TYPES.includes(p.lossType as never)) {
    return { ok: false, error: "Loss type is required." };
  }
  const lossType = p.lossType as LossReportPayload["lossType"];

  const lossDate = typeof p.lossDate === "string" ? p.lossDate.trim() : "";
  if (!lossDate || isNaN(Date.parse(lossDate))) {
    return { ok: false, error: "Loss date is required (ISO format)." };
  }
  // Reject future-dated losses outright. Off-by-one a few hours of clock skew
  // is fine; off-by-months suggests a typo or a bad actor padding history.
  if (Date.parse(lossDate) > Date.now() + 36 * 60 * 60 * 1000) {
    return { ok: false, error: "Loss date cannot be in the future." };
  }

  const claimedUsdRaw =
    typeof p.claimedUsd === "number"
      ? p.claimedUsd
      : typeof p.claimedUsd === "string" && p.claimedUsd.trim()
        ? Number(p.claimedUsd.replace(/[,_$\s]/g, ""))
        : NaN;
  const claimedUsd =
    Number.isFinite(claimedUsdRaw) && claimedUsdRaw >= 0
      ? Math.min(Math.round(claimedUsdRaw), 10_000_000_000)
      : undefined;

  const evidenceLinks = sanitizeUrlList(p.evidenceLinks);

  return {
    ok: true,
    payload: {
      headline,
      story,
      lossType,
      lossDate,
      claimedUsd,
      evidenceLinks: evidenceLinks.length ? evidenceLinks : undefined,
      anonymous: p.anonymous === true,
    },
  };
}

function sanitizePersonaList(v: unknown): PersonaSlug[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: PersonaSlug[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    if (typeof x !== "string") continue;
    if (!(PERSONA_SLUGS as readonly string[]).includes(x)) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x as PersonaSlug);
  }
  return out.length ? out : undefined;
}

export function validateEventPayload(
  raw: unknown,
): ValidationResult<EventPayload> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "payload is required" };
  const p = raw as Record<string, unknown>;

  const name = typeof p.name === "string" ? p.name.trim() : "";
  if (name.length < 3 || name.length > 200)
    return { ok: false, error: "Event name must be 3–200 characters." };

  const startsAt = typeof p.startsAt === "string" ? p.startsAt.trim() : "";
  if (!startsAt || isNaN(Date.parse(startsAt)))
    return { ok: false, error: "Start date is required (ISO format)." };

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

  const prizeUsd = parseUsdAmount(p.prizeUsd);

  const registrationDeadline =
    typeof p.registrationDeadline === "string" &&
    p.registrationDeadline.trim() &&
    !isNaN(Date.parse(p.registrationDeadline))
      ? p.registrationDeadline.trim()
      : undefined;

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
      prizeUsd,
      registrationDeadline,
      imageUrl: sanitizeSingleUrl(p.imageUrl),
    },
  };
}

export function validateJobPayload(
  raw: unknown,
): ValidationResult<JobPayload> {
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

export function validateHackathonPayload(
  raw: unknown,
): ValidationResult<HackathonPayload> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "payload is required" };
  const p = raw as Record<string, unknown>;
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const description = typeof p.description === "string" ? p.description.trim() : "";
  if (name.length < 3 || name.length > 200)
    return { ok: false, error: "Hackathon name must be 3–200 characters." };
  if (description.length < 20 || description.length > 5000)
    return { ok: false, error: "Description must be 20–5000 characters." };

  const startsAt = typeof p.startsAt === "string" ? p.startsAt.trim() : "";
  if (!startsAt || isNaN(Date.parse(startsAt)))
    return { ok: false, error: "Start date is required (ISO format)." };
  const endsAt = typeof p.endsAt === "string" ? p.endsAt.trim() : "";
  if (!endsAt || isNaN(Date.parse(endsAt)))
    return { ok: false, error: "End date is required (ISO format)." };

  const validModes = ["online", "irl", "hybrid"] as const;

  const registrationDeadline =
    typeof p.registrationDeadline === "string" &&
    p.registrationDeadline.trim() &&
    !isNaN(Date.parse(p.registrationDeadline))
      ? p.registrationDeadline.trim()
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
      mode: validModes.includes(p.mode as never)
        ? (p.mode as HackathonPayload["mode"])
        : undefined,
      city: trimToString(p.city, 100),
      country: trimToString(p.country, 100),
      venue: trimToString(p.venue, 200),
      url: sanitizeSingleUrl(p.url),
      registrationUrl: sanitizeSingleUrl(p.registrationUrl),
      registrationDeadline,
      prizePool: trimToString(p.prizePool, 200),
      prizeUsd: parseUsdAmount(p.prizeUsd),
      tracks: sanitizeTagList(p.tracks),
      sponsors: sanitizeTagList(p.sponsors),
      tags: sanitizeTagList(p.tags),
      imageUrl: sanitizeSingleUrl(p.imageUrl),
    },
  };
}

export function validatePopupCityPayload(
  raw: unknown,
): ValidationResult<PopupCityPayload> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "payload is required" };
  const p = raw as Record<string, unknown>;
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const description = typeof p.description === "string" ? p.description.trim() : "";
  if (name.length < 3 || name.length > 200)
    return { ok: false, error: "Name must be 3–200 characters." };
  if (description.length < 20 || description.length > 5000)
    return { ok: false, error: "Description must be 20–5000 characters." };

  // Dates are optional — entries without dates render as "rolling/TBC".
  // When present they must be valid ISO; when absent, they're undefined.
  const startsAtRaw = typeof p.startsAt === "string" ? p.startsAt.trim() : "";
  const startsAt =
    startsAtRaw && !isNaN(Date.parse(startsAtRaw)) ? startsAtRaw : undefined;
  const endsAtRaw = typeof p.endsAt === "string" ? p.endsAt.trim() : "";
  const endsAt =
    endsAtRaw && !isNaN(Date.parse(endsAtRaw)) ? endsAtRaw : undefined;

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
      rolling: p.rolling === true,
      focus: trimToString(p.focus, 200),
      tags: sanitizeTagList(p.tags),
      imageUrl: sanitizeSingleUrl(p.imageUrl),
    },
  };
}

export function validateGrantPayload(
  raw: unknown,
): ValidationResult<GrantPayload> {
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

export function validateAcceleratorPayload(
  raw: unknown,
): ValidationResult<AcceleratorPayload> {
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
      investmentUsd: parseUsdAmount(p.investmentUsd),
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

export function validateCapitalPayload(
  raw: unknown,
): ValidationResult<CapitalPayload> {
  if (!raw || typeof raw !== "object")
    return { ok: false, error: "payload is required" };
  const p = raw as Record<string, unknown>;
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const organization =
    typeof p.organization === "string" ? p.organization.trim() : "";
  const description =
    typeof p.description === "string" ? p.description.trim() : "";

  if (name.length < 2 || name.length > 200)
    return { ok: false, error: "Fund name must be 2–200 characters." };
  if (organization.length < 2 || organization.length > 120)
    return { ok: false, error: "Organization must be 2–120 characters." };
  if (description.length < 20 || description.length > 5000)
    return { ok: false, error: "Description must be 20–5000 characters." };

  return {
    ok: true,
    payload: {
      name,
      organization,
      organizationUrl: sanitizeSingleUrl(p.organizationUrl),
      description,
      stage: trimToString(p.stage, 200),
      checkSize: trimToString(p.checkSize, 200),
      location: trimToString(p.location, 200),
      focus: trimToString(p.focus, 200),
      pitchUrl: sanitizeSingleUrl(p.pitchUrl),
      decisionWindow: trimToString(p.decisionWindow, 200),
      tags: sanitizeTagList(p.tags),
      imageUrl: sanitizeSingleUrl(p.imageUrl),
    },
  };
}

export function validateResidencyPayload(
  raw: unknown,
): ValidationResult<ResidencyPayload> {
  if (!raw || typeof raw !== "object")
    return { ok: false, error: "payload is required" };
  const p = raw as Record<string, unknown>;
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const organization =
    typeof p.organization === "string" ? p.organization.trim() : "";
  const description =
    typeof p.description === "string" ? p.description.trim() : "";

  if (name.length < 3 || name.length > 200)
    return { ok: false, error: "Name must be 3–200 characters." };
  if (organization.length < 2 || organization.length > 120)
    return { ok: false, error: "Organization must be 2–120 characters." };
  if (description.length < 20 || description.length > 5000)
    return { ok: false, error: "Description must be 20–5000 characters." };

  // Dates are optional — entries without dates render as "rolling/TBC".
  // When present they must be valid ISO; when absent, they're undefined.
  const startsAtRaw = typeof p.startsAt === "string" ? p.startsAt.trim() : "";
  const startsAt =
    startsAtRaw && !isNaN(Date.parse(startsAtRaw)) ? startsAtRaw : undefined;
  const endsAtRaw = typeof p.endsAt === "string" ? p.endsAt.trim() : "";
  const endsAt =
    endsAtRaw && !isNaN(Date.parse(endsAtRaw)) ? endsAtRaw : undefined;

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
      organization,
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
      rolling: p.rolling === true,
      cohortSize: trimToString(p.cohortSize, 100),
      cost: trimToString(p.cost, 200),
      focus: trimToString(p.focus, 200),
      tags: sanitizeTagList(p.tags),
      imageUrl: sanitizeSingleUrl(p.imageUrl),
    },
  };
}

export function validatePerksPayload(
  raw: unknown,
): ValidationResult<PerksPayload> {
  if (!raw || typeof raw !== "object")
    return { ok: false, error: "payload is required" };
  const p = raw as Record<string, unknown>;
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const organization =
    typeof p.organization === "string" ? p.organization.trim() : "";
  const description =
    typeof p.description === "string" ? p.description.trim() : "";

  if (name.length < 2 || name.length > 200)
    return { ok: false, error: "Perk name must be 2–200 characters." };
  if (organization.length < 2 || organization.length > 120)
    return { ok: false, error: "Organization must be 2–120 characters." };
  if (description.length < 20 || description.length > 5000)
    return { ok: false, error: "Description must be 20–5000 characters." };

  const deadline =
    typeof p.deadline === "string" &&
    p.deadline.trim() &&
    !isNaN(Date.parse(p.deadline))
      ? p.deadline.trim()
      : undefined;
  const rolling = typeof p.rolling === "boolean" ? p.rolling : undefined;

  return {
    ok: true,
    payload: {
      name,
      organization,
      organizationUrl: sanitizeSingleUrl(p.organizationUrl),
      description,
      value: trimToString(p.value, 200),
      category: trimToString(p.category, 100),
      ecosystem: trimToString(p.ecosystem, 100),
      eligibility: trimToString(p.eligibility, 500),
      applyUrl: sanitizeSingleUrl(p.applyUrl),
      deadline,
      rolling,
      tags: sanitizeTagList(p.tags),
      imageUrl: sanitizeSingleUrl(p.imageUrl),
    },
  };
}

export function validateFellowshipPayload(
  raw: unknown,
): ValidationResult<FellowshipPayload> {
  if (!raw || typeof raw !== "object")
    return { ok: false, error: "payload is required" };
  const p = raw as Record<string, unknown>;
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const organization =
    typeof p.organization === "string" ? p.organization.trim() : "";
  const description =
    typeof p.description === "string" ? p.description.trim() : "";

  if (name.length < 3 || name.length > 200)
    return { ok: false, error: "Fellowship name must be 3–200 characters." };
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
      stipend: trimToString(p.stipend, 200),
      stipendUsd: parseUsdAmount(p.stipendUsd),
      duration: trimToString(p.duration, 100),
      eligibility: trimToString(p.eligibility, 500),
      location: trimToString(p.location, 200),
      focus: trimToString(p.focus, 200),
      applyUrl: sanitizeSingleUrl(p.applyUrl),
      nextDeadline,
      rolling: p.rolling === true,
      cadence: trimToString(p.cadence, 100),
      tags: sanitizeTagList(p.tags),
      imageUrl: sanitizeSingleUrl(p.imageUrl),
    },
  };
}

// ── Shared sanitizers ────────────────────────────────────────────────

// Parse a USD amount from either a number or a stringified form like
// "$500,000" / "500_000" / " 1000000 ". Clamps to [0, 1B] and rounds to an
// integer so listing-page numeric filters get clean cents-free values.
export function parseUsdAmount(v: unknown): number | undefined {
  const raw =
    typeof v === "number"
      ? v
      : typeof v === "string" && v.trim()
        ? Number(v.replace(/[,_$\s]/g, ""))
        : NaN;
  if (!Number.isFinite(raw) || raw < 0) return undefined;
  return Math.min(Math.round(raw), 1_000_000_000);
}

export function trimToString(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

export function sanitizeSingleUrl(v: unknown): string | undefined {
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

export function sanitizeUrlList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => sanitizeSingleUrl(x))
    .filter((x): x is string => !!x)
    .slice(0, 10);
}

export function sanitizeTagList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim().slice(0, 40))
    .filter((x) => x.length > 0)
    .slice(0, 12);
  return out.length ? out : undefined;
}
