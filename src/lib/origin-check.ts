import type { NextRequest } from "next/server";
import { siteUrl } from "./site-url";

/**
 * Verify that a cookie-authenticated POST request originated from our own
 * site, not a cross-origin attacker. Defense in depth on top of the
 * session cookie's SameSite=Lax — Lax already blocks most cross-site
 * POSTs in modern browsers, but Origin check catches the rest (older
 * browsers, edge cases, server-side relays).
 *
 * Returns true when the request appears same-origin. Returns false for
 * any mismatch or for requests with no Origin header (which is itself
 * suspicious for a state-changing POST — legit browser POSTs always
 * include it). Hermes (bearer-token) routes don't need this check; they
 * have their own auth and aren't cookie-driven.
 */
export function isSameOrigin(req: NextRequest | Request): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  // Build the set of acceptable origins from the canonical site URL plus
  // any preview / Vercel deploy URL the runtime tells us about. Strip
  // path/trailing-slash; we only compare scheme+host.
  const acceptable = acceptableOrigins();

  if (origin) {
    return acceptable.has(originOnly(origin));
  }

  // Some clients omit Origin (notably older browsers and a few crawler
  // user-agents). Fall back to Referer's origin part — same rule.
  if (referer) {
    try {
      return acceptable.has(originOnly(new URL(referer).origin));
    } catch {
      return false;
    }
  }

  return false;
}

function acceptableOrigins(): Set<string> {
  const out = new Set<string>();
  out.add(originOnly(siteUrl()));
  const vercel = process.env.VERCEL_URL;
  if (vercel) {
    out.add(originOnly(`https://${vercel}`));
  }
  // Localhost is acceptable in development for local browser testing of
  // protected POST routes.
  if (process.env.NODE_ENV !== "production") {
    out.add("http://localhost:3000");
    out.add("http://127.0.0.1:3000");
  }
  return out;
}

function originOnly(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}`;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}
