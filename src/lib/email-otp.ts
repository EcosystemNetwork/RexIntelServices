import { cookies } from "next/headers";
import { sealData, unsealData } from "iron-session";
import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db, emailVerifications } from "./db";
import { sendOtpEmail } from "./email/otp-email";

// =====================================================================
// Email OTP — verifies the user owns the email before we hand it to
// Magic Link for wallet provisioning. Without this layer, anyone could
// type vitalik@ethereum.org into the form and front-run that identity.
//
// Lifecycle:
//   1. POST /request-otp { email }  → row inserted with hashed 6-digit
//                                     code, 10-minute expiry; code emailed.
//   2. POST /verify-otp  { email, code }
//                                   → on success, `verified_at` set on the
//                                     row + sealed `rex_email_verified`
//                                     cookie minted (15min TTL).
//   3. POST /auth/magic/login { didToken } → reads + consumes the cookie
//                                     for the matching email; mints the
//                                     contributor session.
//
// The cookie is the load-bearing check at init-time; the DB row is the
// audit record + lets us cap brute-force attempts. Both layers must agree.
// =====================================================================

const VERIFIED_COOKIE = "rex_email_verified";
const VERIFIED_TTL_SECONDS = 15 * 60;
const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
// 100k codes = 16.6 hours of brute-forcing at the rate limit, but we cap
// attempts per row at 5 and rate-limit /verify-otp per IP — combined,
// guessing space is effectively closed.
const CODE_DIGITS = 6;

interface VerifiedCookiePayload {
  email: string;
  verifiedAt: number; // unix ms
}

function getSessionPassword(): string {
  const pw = process.env.SESSION_PASSWORD;
  if (!pw || pw.length < 32) {
    throw new Error(
      "SESSION_PASSWORD must be at least 32 characters — generate one with `openssl rand -base64 32`",
    );
  }
  return pw;
}

function hashCode(code: string): string {
  // HMAC-SHA256 keyed by SESSION_PASSWORD. Same key already protects the
  // session cookie; rotating it invalidates outstanding OTPs too, which
  // is the right behavior (you want to invalidate auth surfaces together).
  return createHmac("sha256", getSessionPassword()).update(code).digest("hex");
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

function generateCode(): string {
  // randomInt is uniformly distributed within [min, max). For a 6-digit
  // code we sample [0, 1_000_000) and zero-pad — avoids the modulo bias
  // a naive `Math.random() * 1e6 | 0` would have.
  const n = randomInt(0, 10 ** CODE_DIGITS);
  return n.toString().padStart(CODE_DIGITS, "0");
}

// ---------------------------------------------------------------------------
// Request OTP
// ---------------------------------------------------------------------------

export interface RequestOtpResult {
  ok: boolean;
  // Surfaced to the client UI as a hint — never tell them "no such email"
  // (enumeration leak); the API route returns a generic "check inbox"
  // message regardless of whether send succeeded.
  reason?: string;
}

export async function requestEmailOtp(args: {
  email: string;
  ipAddress: string | null;
}): Promise<RequestOtpResult> {
  const email = args.email.trim().toLowerCase();
  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  // Invalidate any prior unverified, unexpired rows for this email so a
  // request always points at exactly one active code. Verified rows are
  // left alone — they're the audit trail.
  await db
    .update(emailVerifications)
    .set({ expiresAt: new Date(0) })
    .where(
      and(
        sql`lower(${emailVerifications.email}) = ${email}`,
        isNull(emailVerifications.verifiedAt),
        gt(emailVerifications.expiresAt, new Date()),
      ),
    );

  await db.insert(emailVerifications).values({
    email,
    codeHash,
    expiresAt,
    ipAddress: args.ipAddress,
  });

  const sendResult = await sendOtpEmail({
    to: email,
    code,
    expiresInMinutes: OTP_TTL_MINUTES,
  });
  if (!sendResult.sent) {
    return { ok: false, reason: sendResult.reason };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Verify OTP
// ---------------------------------------------------------------------------

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "invalid" | "locked" | "not_found" };

export async function verifyEmailOtp(args: {
  email: string;
  code: string;
}): Promise<VerifyOtpResult> {
  const email = args.email.trim().toLowerCase();
  // Trim incidental whitespace from copy-paste; reject anything that
  // isn't exactly N digits afterward. No regex partial-match — strict.
  const code = args.code.trim();
  if (!/^\d+$/.test(code) || code.length !== CODE_DIGITS) {
    return { ok: false, reason: "invalid" };
  }

  const [row] = await db
    .select()
    .from(emailVerifications)
    .where(
      and(
        sql`lower(${emailVerifications.email}) = ${email}`,
        isNull(emailVerifications.verifiedAt),
      ),
    )
    .orderBy(desc(emailVerifications.createdAt))
    .limit(1);

  if (!row) return { ok: false, reason: "not_found" };
  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: "locked" };
  }

  // Always increment attempts, even on success — keeps the row's
  // attempt-count honest in case anyone audits later.
  const submittedHash = hashCode(code);
  const match = constantTimeEqualHex(submittedHash, row.codeHash);

  await db
    .update(emailVerifications)
    .set({
      attempts: row.attempts + 1,
      verifiedAt: match ? new Date() : null,
    })
    .where(eq(emailVerifications.id, row.id));

  if (!match) return { ok: false, reason: "invalid" };

  await mintVerifiedCookie({ email, verifiedAt: Date.now() });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sealed cookie — load-bearing check at /auth/magic/login
// ---------------------------------------------------------------------------

async function mintVerifiedCookie(data: VerifiedCookiePayload) {
  const sealed = await sealData(data, { password: getSessionPassword() });
  cookies().set(VERIFIED_COOKIE, sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: VERIFIED_TTL_SECONDS,
  });
}

/**
 * Read the `rex_email_verified` cookie and confirm it matches the given
 * email. Returns true only when the cookie is present, the email matches
 * (case-insensitive), and the verification is < VERIFIED_TTL_SECONDS old.
 * On success the cookie is cleared — one cookie buys one Magic login,
 * never replay.
 */
export async function consumeEmailVerifiedCookie(
  expectedEmail: string,
): Promise<boolean> {
  const raw = cookies().get(VERIFIED_COOKIE)?.value;
  if (!raw) return false;

  let payload: Partial<VerifiedCookiePayload>;
  try {
    payload = await unsealData<Partial<VerifiedCookiePayload>>(raw, {
      password: getSessionPassword(),
    });
  } catch {
    return false;
  }

  // iron-session's `unsealData` returns `{}` on garbage input — without
  // shape-checking the payload, the property accesses below would throw
  // (TypeError on `undefined.toLowerCase()`) and surface as a 500.
  if (typeof payload.email !== "string" || typeof payload.verifiedAt !== "number") {
    return false;
  }
  if (payload.email.toLowerCase() !== expectedEmail.toLowerCase()) {
    return false;
  }
  if (Date.now() - payload.verifiedAt > VERIFIED_TTL_SECONDS * 1000) {
    return false;
  }

  // Single-use: clear the cookie so a stolen browser session can't reuse
  // a verification round to provision Magic wallets repeatedly.
  cookies().delete(VERIFIED_COOKIE);
  return true;
}
