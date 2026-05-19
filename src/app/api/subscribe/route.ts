import { NextRequest, NextResponse } from "next/server";
import {
  db,
  subscribers,
  suppressions,
  tags,
  subscriberTags,
  PERSONA_SLUGS,
  type PersonaSlug,
} from "@/lib/db";
import { and, eq, inArray } from "drizzle-orm";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { fireSubscriberCreated } from "@/lib/email/automations";

// Third-party sites POST here directly from embedded signup widgets. The
// endpoint is already IP-rate-limited and the payload is plain user input,
// so allowing arbitrary origins is safe.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function withCors<T>(resp: NextResponse<T>): NextResponse<T> {
  for (const [k, v] of Object.entries(CORS_HEADERS)) resp.headers.set(k, v);
  return resp;
}

const ok = (msg: string) =>
  withCors(NextResponse.json({ ok: true, message: msg }));
const fail = (msg: string, status = 400, extraHeaders: Record<string, string> = {}) =>
  withCors(NextResponse.json({ error: msg }, { status, headers: extraHeaders }));

/**
 * Public API endpoint for newsletter signups.
 * Called from the public landing page AND from embedded signup widgets on
 * third-party sites (see /admin/embed for the snippet generator).
 *
 * POST /api/subscribe
 * Body: { email: string, firstName?: string, website?: string (honeypot),
 *         persona?: string, source?: string, tagIds?: string[] }
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  // 5 signups per IP per 10 minutes. Tight enough to deter scripted abuse,
  // loose enough that a household / office NAT'd behind one IP isn't blocked
  // for a real signup or two.
  const limit = await rateLimit(`subscribe:${ip}`, 5, 10 * 60 * 1000);
  if (!limit.ok) {
    return fail("Too many requests. Please try again later.", 429, {
      "Retry-After": String(limit.retryAfterSec),
    });
  }

  let body: {
    email?: string;
    firstName?: string;
    website?: string;
    persona?: string;
    turnstileToken?: string;
    source?: string;
    tagIds?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON");
  }

  // Honeypot: real users never see/fill the `website` field; bots do. Pretend
  // the request succeeded so we don't tip them off, but skip writing.
  if (body.website && body.website.trim() !== "") {
    return ok("You're in! Welcome to Rex Intel Services.");
  }

  // Turnstile captcha verification. Skipped automatically when env vars
  // aren't configured. Embed-source requests can skip captcha too because
  // they live behind the third-party site's own anti-abuse posture; the
  // server-side IP rate limit above is the floor.
  const isEmbedded = typeof body.source === "string" && body.source.startsWith("embed-");
  if (!isEmbedded) {
    const captcha = await verifyTurnstileToken(body.turnstileToken, ip);
    if (!captcha.ok) {
      return fail(captcha.error);
    }
  }

  const email = body.email?.toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return fail("Please provide a valid email address.");
  }

  const firstName = body.firstName?.trim().slice(0, 80) || null;
  const persona: PersonaSlug | null =
    body.persona && (PERSONA_SLUGS as readonly string[]).includes(body.persona)
      ? (body.persona as PersonaSlug)
      : null;

  const source =
    typeof body.source === "string" && body.source.length > 0
      ? body.source.slice(0, 80)
      : "landing_page";

  // Curated tag IDs from the embed snippet. Server-side validation: only
  // accept IDs that actually resolve to a tag — the client snippet is
  // operator-trusted but the request itself comes from the open internet.
  const requestedTagIds = Array.isArray(body.tagIds)
    ? body.tagIds.filter((id): id is string => typeof id === "string").slice(0, 10)
    : [];

  // Check suppression list
  const [suppressed] = await db
    .select({ email: suppressions.email })
    .from(suppressions)
    .where(eq(suppressions.email, email))
    .limit(1);

  if (suppressed) {
    // Don't reveal suppression — just say they're already subscribed
    return ok("You're already on our list!");
  }

  // Check if already subscribed
  const [existing] = await db
    .select({ id: subscribers.id, status: subscribers.status })
    .from(subscribers)
    .where(eq(subscribers.email, email))
    .limit(1);

  if (existing) {
    if (existing.status === "active") {
      if (persona) await applyPersonaTag(existing.id, persona);
      if (requestedTagIds.length > 0) await applyTags(existing.id, requestedTagIds);
      return ok("You're already subscribed!");
    }
    if (existing.status === "unsubscribed") {
      await db
        .update(subscribers)
        .set({
          status: "active",
          firstName: firstName ?? undefined,
          updatedAt: new Date(),
        })
        .where(eq(subscribers.id, existing.id));
      if (persona) await applyPersonaTag(existing.id, persona);
      if (requestedTagIds.length > 0) await applyTags(existing.id, requestedTagIds);
      return ok("Welcome back! You've been re-subscribed.");
    }
    return ok("You're already on our list!");
  }

  // Create new subscriber
  const [created] = await db
    .insert(subscribers)
    .values({
      email,
      firstName,
      source,
      status: "active",
      ipAddress: ip === "unknown" ? null : ip,
    })
    .returning({ id: subscribers.id });

  if (persona && created) await applyPersonaTag(created.id, persona);
  if (created && requestedTagIds.length > 0)
    await applyTags(created.id, requestedTagIds);

  // Fire-and-forget welcome email. Gate is in fireSubscriberCreated itself
  // (WELCOME_AUTOMATION_ENABLED + RESEND_API_KEY); both must be set in env
  // for this to do anything, so it stays a no-op until the operator opts in.
  fireSubscriberCreated({
    email,
    firstName,
    lastName: null,
  }).catch(() => {
    /* already logged by fireSubscriberCreated */
  });

  return ok("You're in! Welcome to Rex Intel Services.");
}

/**
 * Replace this subscriber's persona-kind tag with the given one. Persona is
 * 1:1 — having two persona tags would muddy segment-targeted sends. Interest
 * tags (kind = 'interest') are left alone.
 */
async function applyPersonaTag(subscriberId: string, slug: PersonaSlug) {
  const [tagRow] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.name, slug), eq(tags.kind, "persona")))
    .limit(1);
  if (!tagRow) return;
  const existingPersonaTagIds = await db
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.kind, "persona"));
  const allPersonaIds = existingPersonaTagIds.map((t) => t.id);
  const otherPersonaIds = allPersonaIds.filter((id) => id !== tagRow.id);
  if (otherPersonaIds.length) {
    await db
      .delete(subscriberTags)
      .where(
        and(
          eq(subscriberTags.subscriberId, subscriberId),
          inArray(subscriberTags.tagId, otherPersonaIds),
        ),
      );
  }
  await db
    .insert(subscriberTags)
    .values({ subscriberId, tagId: tagRow.id })
    .onConflictDoNothing();
}

/**
 * Idempotently apply a set of operator-supplied tag IDs to a subscriber.
 * Validates every ID against the tags table so a malicious embed can't
 * fabricate row references.
 */
async function applyTags(subscriberId: string, tagIds: string[]) {
  if (tagIds.length === 0) return;
  const valid = await db
    .select({ id: tags.id })
    .from(tags)
    .where(inArray(tags.id, tagIds));
  if (valid.length === 0) return;
  await db
    .insert(subscriberTags)
    .values(valid.map((t) => ({ subscriberId, tagId: t.id })))
    .onConflictDoNothing();
}
