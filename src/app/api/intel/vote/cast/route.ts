import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { randomUUID } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import {
  db,
  submissions,
  subscribers,
  intelVotes,
  submitters,
  suppressions,
} from "@/lib/db";
import {
  buildVoterCookie,
  verifyVoterCookie,
  VOTER_COOKIE_MAX_AGE_SEC,
  VOTER_COOKIE_NAME,
} from "@/lib/voter-cookie";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { SUBMISSIONS_TAG } from "@/lib/cache";
import { siteUrl } from "@/lib/site-url";
import { MONTHLY_VOTE_CAP, countMonthlyVotes } from "@/lib/voting";

/**
 * POST /api/intel/vote/cast
 * Body: { publicId }
 *
 * Anonymous one-click vote. If the caller already has a valid voter cookie
 * we reuse the subscriber it points at; otherwise we mint a placeholder
 * anonymous subscriber row, set the cookie, and proceed. No email round-
 * trip. The 30-day cookie carries the anon identity across visits.
 *
 * Caps still apply against the (anon or real) subscriberId:
 *   - 1 vote per (submission, subscriber) — intel_votes PK
 *   - MONTHLY_VOTE_CAP votes per subscriber per UTC month
 * Anyone who clears cookies gets a fresh quota. The per-IP rate limit
 * below is the only remaining sybil dampener.
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

  let body: { publicId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const publicId = body.publicId?.toLowerCase().trim();
  if (!publicId || !/^[0-9a-f]{16}$/.test(publicId)) {
    return NextResponse.json({ error: "Invalid submission reference." }, { status: 400 });
  }

  // Any approved community submission can be voted on for the monthly prize
  // pool. Loss reports are the only type excluded — they're victim self-
  // reports, deliberately walled off from the editorial pipeline.
  const [intel] = await db
    .select({
      id: submissions.id,
      submitterEmail: submissions.submitterEmail,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.publicId, publicId),
        ne(submissions.type, "loss_report"),
        eq(submissions.status, "approved"),
      ),
    )
    .limit(1);

  if (!intel) {
    return NextResponse.json(
      { error: "That submission doesn't exist or isn't live." },
      { status: 404 },
    );
  }

  // Resolve voter identity AFTER validating the request. Cookie present →
  // run eligibility gates against the existing subscriber. Cookie missing →
  // mint a fresh anonymous subscriber for the (submission, subscriber) PK
  // and monthly cap. We defer the mint until here so malformed bodies and
  // dead intel refs don't leave stranded subscriber rows behind.
  const rawCookie = req.cookies.get(VOTER_COOKIE_NAME)?.value;
  let subscriberId = verifyVoterCookie(rawCookie);
  let voterEmail: string | null = null;
  let mintedNewCookie = false;

  if (subscriberId) {
    // Existing voter — same eligibility gates as before. Collapse all
    // rejection reasons to a single 401 so an attacker with a leaked
    // cookie can't infer the deliverability/ban status of the bound
    // subscriber. The submitter ban join is intentional: bounty-bad-faith
    // bans identity-wide; serial bad-actor submitters can't vote either.
    const [sub] = await db
      .select({
        id: subscribers.id,
        email: subscribers.email,
        status: subscribers.status,
        submitterBannedAt: submitters.bountyBannedAt,
      })
      .from(subscribers)
      .leftJoin(
        submitters,
        sql`lower(${submitters.email}) = lower(${subscribers.email})`,
      )
      .where(eq(subscribers.id, subscriberId))
      .limit(1);
    if (
      !sub ||
      sub.status === "bounced" ||
      sub.status === "complained" ||
      sub.status === "unsubscribed" ||
      sub.submitterBannedAt
    ) {
      return NextResponse.json(
        { error: "Voter not eligible." },
        { status: 401 },
      );
    }
    voterEmail = sub.email;

    // Suppression list — a subscriber may pass the row-status gate above
    // but still be in `suppressions` (Resend webhook bounces a single
    // message → adds to suppressions but leaves the subscriber row alone).
    // Voting must not use an identity we've committed to never email.
    if (sub.email) {
      const [hit] = await db
        .select({ email: suppressions.email })
        .from(suppressions)
        .where(sql`lower(${suppressions.email}) = lower(${sub.email})`)
        .limit(1);
      if (hit) {
        return NextResponse.json(
          { error: "Voter not eligible." },
          { status: 401 },
        );
      }
    }
  } else {
    // Placeholder email is unique-by-UUID and lives on a non-routable
    // domain so no mail ever gets sent. source="anon_vote" so these rows
    // can be filtered out of every mailing surface.
    const anonEmail = `anon-${randomUUID()}@anon.vote.rexintel.local`;
    const [created] = await db
      .insert(subscribers)
      .values({
        email: anonEmail,
        source: "anon_vote",
        status: "active",
        ipAddress: ip === "unknown" ? null : ip,
      })
      .returning({ id: subscribers.id });
    subscriberId = created.id;
    voterEmail = anonEmail;
    mintedNewCookie = true;
  }

  // Self-voting block — submitters cannot vote on their own intel. Match
  // on lower-cased email; anon voters use placeholder emails so this
  // gate never fires for them, which is fine (no identity to collide on).
  if (
    intel.submitterEmail &&
    voterEmail &&
    intel.submitterEmail.toLowerCase() === voterEmail.toLowerCase()
  ) {
    return NextResponse.json(
      { error: "Vote not eligible." },
      { status: 403 },
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
    return withVoterCookie(
      NextResponse.json({ ok: true, alreadyVoted: true }),
      mintedNewCookie ? subscriberId : null,
    );
  }

  // Monthly cap — counted AFTER the already-voted check so re-clicking an
  // intel you already voted on never costs a quota slot. UTC month window;
  // see lib/voting.ts.
  const monthlyVotes = await countMonthlyVotes(subscriberId);
  if (monthlyVotes >= MONTHLY_VOTE_CAP) {
    return withVoterCookie(
      NextResponse.json(
        {
          error: `Monthly vote limit reached (${MONTHLY_VOTE_CAP}/month). Resets at the start of next month UTC.`,
          capReached: true,
          cap: MONTHLY_VOTE_CAP,
        },
        { status: 429 },
      ),
      mintedNewCookie ? subscriberId : null,
    );
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

  return withVoterCookie(
    NextResponse.json({ ok: true, alreadyVoted: false }),
    mintedNewCookie ? subscriberId : null,
  );
}

function withVoterCookie(
  res: NextResponse,
  subscriberIdToBind: string | null,
): NextResponse {
  if (!subscriberIdToBind) return res;
  const cookie = buildVoterCookie(subscriberIdToBind);
  if (!cookie) return res;
  res.cookies.set(VOTER_COOKIE_NAME, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: VOTER_COOKIE_MAX_AGE_SEC,
  });
  return res;
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
