import type {
  IntelPayload,
  EventPayload,
  JobPayload,
  HackathonPayload,
  PopupCityPayload,
  GrantPayload,
  AcceleratorPayload,
  SubmissionPayload,
} from "@/lib/db/schema";

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
  | "hackathon";

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

// ── Shared sanitizers ────────────────────────────────────────────────

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
