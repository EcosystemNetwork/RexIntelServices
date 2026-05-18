import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed voter cookie. After a successful magic-link confirm, the server
 * sets this cookie so subsequent votes in the same browser don't require
 * another email round-trip. Cookie value:
 *
 *   {subscriberId}.{issuedAtMs}.{hmacOfBoth}
 *
 * The HMAC uses VOTER_COOKIE_SECRET. The subscriberId is recoverable from
 * the cookie itself once verified, so the vote endpoint can insert
 * straight into intel_votes without re-looking-up by email.
 *
 * If VOTER_COOKIE_SECRET is missing, verify() always returns null — the
 * vote endpoint falls back to the magic-link path. Don't ship without
 * setting the secret in prod.
 */

export const VOTER_COOKIE_NAME = "rex_voter";
export const VOTER_COOKIE_MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days

function getSecret(): string | null {
  const s = process.env.VOTER_COOKIE_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") {
      // Loud throw in production — silently disabling the cookie path
      // makes voting feel broken to users ("magic link every time") and
      // there's no admin surface that flags the misconfig. Crash at first
      // use so the deploy fails health checks instead.
      throw new Error(
        "VOTER_COOKIE_SECRET must be set and >= 32 chars in production. Generate with `openssl rand -hex 32`.",
      );
    }
    return null;
  }
  return s;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function buildVoterCookie(subscriberId: string): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const issuedAt = Date.now();
  const payload = `${subscriberId}.${issuedAt}`;
  const sig = sign(payload, secret);
  return `${payload}.${sig}`;
}

/**
 * Returns the subscriberId encoded in the cookie if (a) the signature is
 * valid and (b) the issuedAt is within the max-age window. Anything else
 * returns null so callers fall through to the magic-link flow.
 */
export function verifyVoterCookie(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const secret = getSecret();
  if (!secret) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [subscriberId, issuedAtStr, sig] = parts;
  if (!subscriberId || !issuedAtStr || !sig) return null;

  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt)) return null;
  const ageSec = (Date.now() - issuedAt) / 1000;
  if (ageSec < 0 || ageSec > VOTER_COOKIE_MAX_AGE_SEC) return null;

  const expected = sign(`${subscriberId}.${issuedAtStr}`, secret);
  // Length check is paranoid since hex is fixed-width, but timingSafeEqual
  // throws on mismatched lengths.
  if (expected.length !== sig.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;

  return subscriberId;
}
