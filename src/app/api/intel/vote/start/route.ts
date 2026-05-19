import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { db, submissions, voteTokens, suppressions } from "@/lib/db";
import type { SubmissionPayload } from "@/lib/db/schema";
import {
  submissionTitle,
  type SubmissionType,
} from "@/lib/submission-display";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { sendVoteMagicLinkEmail } from "@/lib/email/vote-magic-link-email";
import { absoluteUrl } from "@/lib/site-url";

/**
 * POST /api/intel/vote/start
 * Body: { publicId, email, website (honeypot), turnstileToken }
 *
 * Step 1 of the magic-link vote flow. Validates the intel exists + is
 * approved, creates a one-time vote_tokens row (storing only the sha256
 * of the random token), emails the user a confirm link with the raw
 * token. The vote is NOT recorded yet — it's recorded by /vote/confirm.
 *
 * On success returns { ok: true, sent: true } regardless of whether the
 * email actually went out. The confirm URL is also returned when
 * NODE_ENV !== "production" so local dev can click through without
 * configured email.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  // Tight IP-level ceiling first so a bot can't probe email enumeration
  // for free.
  const limit = await rateLimit(`vote-start:${ip}`, 10, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many vote attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSec) },
      },
    );
  }

  let body: {
    publicId?: string;
    email?: string;
    website?: string;
    turnstileToken?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Honeypot — silent success so we don't reveal the trap.
  if (body.website && body.website.trim() !== "") {
    return NextResponse.json({ ok: true, sent: true });
  }

  const captcha = await verifyTurnstileToken(body.turnstileToken, ip);
  if (!captcha.ok) {
    return NextResponse.json({ error: captcha.error }, { status: 400 });
  }

  const email = body.email?.toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json(
      { error: "Please provide a valid email address." },
      { status: 400 },
    );
  }

  // Disposable-domain block — cheapest sybil layer that actually catches
  // the lazy attacker. Real prevention (paid challenge, on-chain attest)
  // is still required before the pool goes live; this is a speed-bump.
  const domain = email.split("@")[1] ?? "";
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return NextResponse.json(
      { error: "Disposable email addresses can't vote on the prize pool." },
      { status: 400 },
    );
  }

  // Canonicalize for sybil-resistance: strip `+tag` aliases everywhere,
  // strip dots for gmail/googlemail. Two senders that map to the same
  // canonical address share a rate-limit bucket. We send to the literal
  // address the user typed so they actually get the email.
  const canonical = canonicalizeEmail(email);
  const perEmailLimit = await rateLimit(
    `vote-start-email:${canonical}`,
    3,
    24 * 60 * 60 * 1000,
  );
  if (!perEmailLimit.ok) {
    return NextResponse.json(
      { error: "This email has hit the daily vote-request limit." },
      {
        status: 429,
        headers: { "Retry-After": String(perEmailLimit.retryAfterSec) },
      },
    );
  }

  const publicId = body.publicId?.toLowerCase().trim();
  if (!publicId || !/^[0-9a-f]{16}$/.test(publicId)) {
    return NextResponse.json({ error: "Invalid submission reference." }, { status: 400 });
  }

  // Per-(email, intel) ceiling — one token request per email per intel per
  // 24h. Closes a vote-quota denial attack where a single IP scripts
  // distinct emails to burn the per-email daily quota of N strangers across
  // the leaderboard. With this, the worst they can do is one token to one
  // specific intel from each canonical address.
  const perEmailIntelLimit = await rateLimit(
    `vote-start-email-intel:${canonical}:${publicId}`,
    1,
    24 * 60 * 60 * 1000,
  );
  if (!perEmailIntelLimit.ok) {
    return NextResponse.json(
      { error: "You already requested a vote link for this intel today." },
      {
        status: 429,
        headers: {
          "Retry-After": String(perEmailIntelLimit.retryAfterSec),
        },
      },
    );
  }

  // Validate the submission BEFORE the suppression check so a non-suppressed
  // and a suppressed email at the same valid submission do roughly equal DB
  // work. (Some residual timing leak remains because only the non-suppressed
  // path does the token insert + Resend dispatch; the dispatch is fire-and-
  // forget so its cost is largely off the response timeline.)
  //
  // Accepts any approved community submission type except loss_report, which
  // is walled off from the prize pool by design (victim self-reports are not
  // editorial intel).
  const [intel] = await db
    .select({
      id: submissions.id,
      type: submissions.type,
      payload: submissions.payload,
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

  // Suppression list — never email someone who's blocked us. Silent
  // success so we don't leak suppression state. Now runs AFTER the intel
  // lookup so timing is closer between suppressed and live paths.
  const [suppressed] = await db
    .select({ email: suppressions.email })
    .from(suppressions)
    .where(eq(suppressions.email, email))
    .limit(1);
  if (suppressed) {
    return NextResponse.json({ ok: true, sent: true });
  }

  const headline = submissionTitle(
    intel.type as SubmissionType,
    intel.payload as SubmissionPayload,
  );

  // Burn a fresh single-use token. 24 bytes = 192 bits of entropy. The
  // raw token only ever exists in the email link — DB stores sha256(token)
  // so a DB leak doesn't yield live voting power.
  const rawToken = randomBytes(24).toString("base64url");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.insert(voteTokens).values({
    tokenHash,
    email,
    submissionId: intel.id,
    expiresAt,
    ipAddress: ip === "unknown" ? null : ip,
  });

  const confirmUrl = absoluteUrl(`/api/intel/vote/confirm/${rawToken}`);

  // Fire-and-forget the email. If Resend isn't configured we still return
  // ok:true; the confirm URL is exposed below for local-dev click-through.
  void sendVoteMagicLinkEmail({
    to: email,
    intelHeadline: headline ?? "RexIntel",
    confirmUrl,
  });

  const inDev = process.env.NODE_ENV !== "production";
  return NextResponse.json({
    ok: true,
    sent: true,
    // Exposed only in dev so a developer can click through without Resend.
    confirmUrl: inDev ? confirmUrl : undefined,
  });
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function canonicalizeEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  let canonLocal = local.split("+")[0]!;
  if (domain === "gmail.com" || domain === "googlemail.com") {
    canonLocal = canonLocal.replace(/\./g, "");
  }
  return `${canonLocal}@${domain}`;
}

// Curated short list of the most-abused disposable providers. Not
// exhaustive — keeping it small avoids false positives. The point is to
// raise attacker cost above zero, not to enforce a comprehensive policy.
const DISPOSABLE_EMAIL_DOMAINS = new Set<string>([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "sharklasers.com",
  "yopmail.com",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "tempmail.net",
  "temp-mail.org",
  "throwawaymail.com",
  "trashmail.com",
  "trashmail.net",
  "fakeinbox.com",
  "getairmail.com",
  "mintemail.com",
  "mohmal.com",
  "dispostable.com",
  "maildrop.cc",
  "mailnesia.com",
  "discard.email",
  "spam4.me",
  "moakt.com",
]);
