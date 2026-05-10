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
  AddressRole,
} from "@/lib/db/schema";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { CHAIN_SLUG_SET } from "@/lib/chains";

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
    type?: "intel" | "event";
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

  if (body.type !== "intel" && body.type !== "event") {
    return NextResponse.json(
      { error: "type must be 'intel' or 'event'" },
      { status: 400 },
    );
  }

  const validation =
    body.type === "intel"
      ? validateIntelPayload(body.payload)
      : validateEventPayload(body.payload);

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
    body.type === "intel" &&
    (validation.payload as { anonymous?: boolean }).anonymous === true
  ) {
    submitterEmail = null;
    submitterHandle = null;
  }

  const eventStartsAt =
    body.type === "event"
      ? new Date(
          (validation.payload as { startsAt: string }).startsAt,
        )
      : null;

  // Address rows are only meaningful for intel submissions. Validate up
  // front so a bad row fails the whole request before we write anything.
  const addressInputs =
    body.type === "intel" ? sanitizeAddresses(body.addresses) : [];

  const [created] = await db
    .insert(submissions)
    .values({
      type: body.type,
      status: honeypotTripped ? "spam" : "pending",
      payload: validation.payload,
      submitterEmail,
      submitterHandle,
      ipAddress: ip === "unknown" ? null : ip,
      userAgent: req.headers.get("user-agent")?.slice(0, 500) || null,
      honeypotTripped,
      eventStartsAt,
    })
    .returning({ id: submissions.id });

  // Link addresses even on honeypot-tripped submissions so the moderator can
  // still see what was claimed when reviewing spam patterns. The submission
  // status keeps the row out of public listings either way.
  if (created && addressInputs.length) {
    await linkAddressesToSubmission(created.id, addressInputs);
  }

  return NextResponse.json({
    ok: true,
    message:
      body.type === "intel"
        ? "Intel received. Our analysts will review and respond as warranted."
        : "Event submission received. We'll review it for the next briefing.",
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
    },
  };
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
