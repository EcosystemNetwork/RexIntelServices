import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, submissions, subscribers, intelVotes } from "@/lib/db";
import { verifyVoterCookie, VOTER_COOKIE_NAME } from "@/lib/voter-cookie";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { SUBMISSIONS_TAG } from "@/lib/cache";
import { siteUrl } from "@/lib/site-url";

/**
 * POST /api/intel/vote/cast
 * Body: { publicId }
 *
 * Same-browser fast path. If the caller has a valid voter cookie (from a
 * previous magic-link confirm in the last 30d), record their vote without
 * another email round-trip. No cookie = caller must use /vote/start.
 *
 * One vote per (intel, subscriber) is enforced by the intel_votes PK; a
 * repeat call returns ok:true with alreadyVoted:true.
 */
export async function POST(req: NextRequest) {
  // CSRF defense: reject any request whose Origin (or Referer, for clients
  // that don't send Origin on same-site POST) doesn't match our site. The
  // voter cookie is sameSite:"strict" so this is belt-and-braces — third-
  // party-initiated POSTs already wouldn't carry the cookie — but real
  // money flows through this endpoint, so we hard-block the obvious shape.
  if (!isSameOriginPost(req)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed." },
      { status: 403 },
    );
  }

  const ip = clientIp(req);

  // Sane rate ceiling per browser even with a valid cookie (someone could
  // script the endpoint with their own cookie). 60 votes/hour is way more
  // than a real user; bots well past this become obvious.
  const limit = await rateLimit(`vote-cast:${ip}`, 60, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many votes. Slow down." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const cookie = req.cookies.get(VOTER_COOKIE_NAME)?.value;
  const subscriberId = verifyVoterCookie(cookie);
  if (!subscriberId) {
    return NextResponse.json(
      { error: "Confirm your email first via /vote/start." },
      { status: 401 },
    );
  }

  // Defense in depth — the cookie is signed, but if a subscriber row was
  // deleted (e.g. GDPR erasure) the FK would 500. Verify they still exist
  // and are not bounced/unsubscribed in a way that should block voting.
  const [sub] = await db
    .select({ id: subscribers.id, status: subscribers.status })
    .from(subscribers)
    .where(eq(subscribers.id, subscriberId))
    .limit(1);
  if (!sub) {
    return NextResponse.json(
      { error: "Voter not found." },
      { status: 401 },
    );
  }
  if (sub.status === "bounced" || sub.status === "complained") {
    return NextResponse.json(
      { error: "This voter account is not in good standing." },
      { status: 403 },
    );
  }

  let body: { publicId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const publicId = body.publicId?.toLowerCase().trim();
  if (!publicId || !/^[0-9a-f]{16}$/.test(publicId)) {
    return NextResponse.json({ error: "Invalid intel reference." }, { status: 400 });
  }

  const [intel] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        eq(submissions.publicId, publicId),
        eq(submissions.type, "intel"),
        eq(submissions.status, "approved"),
      ),
    )
    .limit(1);

  if (!intel) {
    return NextResponse.json(
      { error: "That intel doesn't exist or isn't live." },
      { status: 404 },
    );
  }

  // Already voted? Check before insert so we can return alreadyVoted:true
  // with a useful response rather than a generic onConflictDoNothing.
  const [existingVote] = await db
    .select({ submissionId: intelVotes.submissionId })
    .from(intelVotes)
    .where(
      and(
        eq(intelVotes.submissionId, intel.id),
        eq(intelVotes.subscriberId, subscriberId),
      ),
    )
    .limit(1);

  if (existingVote) {
    return NextResponse.json({ ok: true, alreadyVoted: true });
  }

  await db
    .insert(intelVotes)
    .values({
      submissionId: intel.id,
      subscriberId,
    })
    .onConflictDoNothing();

  try {
    revalidateTag(SUBMISSIONS_TAG);
  } catch {
    /* see /vote/confirm */
  }

  return NextResponse.json({ ok: true, alreadyVoted: false });
}

function isSameOriginPost(req: NextRequest): boolean {
  let expectedHost: string;
  try {
    expectedHost = new URL(siteUrl()).host;
  } catch {
    return false;
  }
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === expectedHost;
    } catch {
      return false;
    }
  }
  // Some browsers omit Origin on same-origin POSTs — fall back to Referer
  // which Next.js production deployments always carry over HTTPS.
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === expectedHost;
    } catch {
      return false;
    }
  }
  // No Origin and no Referer — block. A real browser submission to the same
  // origin will set at least one. Curl/bot traffic with neither is exactly
  // what we want to reject here.
  return false;
}
