import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { unsealData } from "iron-session";

// Admin pages and API routes that require authentication
const PROTECTED_PREFIXES = [
  "/api/subscribers",
  "/api/campaigns",
  "/api/submissions",
  "/api/tags",
  "/api/suppressions",
  "/api/admin",
];
// `/contributors/[slug]` is a public profile page, so we use the admin URL
// `/users` (matches the conceptual "users with accounts" naming) to keep the
// public profile path open while still gating the admin list.
const PROTECTED_PAGES_REGEX =
  /^\/(dashboard|subscribers|campaigns|submissions|tags|suppressions|users)(\/|$)/;

// Public routes that should never be blocked
const PUBLIC_ROUTES = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/webhooks/",
  "/api/track/",
  "/api/subscribe",
  "/api/submit",
  // Location-context cookie clear — used by the header "📍 city · clear" pill.
  "/api/loc/",
  // Tokenized self-service edit — auth is the unguessable URL itself, same
  // model as /unsubscribe. Carved out from the otherwise-admin /api/submissions
  // prefix.
  "/api/submissions/edit/",
  // Vercel Cron requests don't carry a session — protected instead by a
  // CRON_SECRET bearer token validated inside each /api/cron/* route.
  "/api/cron/",
];

/**
 * Path-prefix match that respects route boundaries. Prefer this over a raw
 * `startsWith` on a route prefix, because e.g. `/api/subscribers` literally
 * begins with the string `/api/subscribe` — a naive `startsWith` would let
 * an admin endpoint through whatever rule we wrote for the public subscribe
 * route. A prefix listed with a trailing `/` is treated as a directory match.
 */
function pathMatches(pathname: string, prefix: string): boolean {
  if (prefix.endsWith("/")) return pathname.startsWith(prefix);
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

// Persistent location context. When a public page is loaded with `?loc=Lisbon`
// (or similar), we mirror the value into a cookie so subsequent visits to other
// lanes (events / jobs / hackathons / search) auto-scope to the same place
// without making the user re-type. Lane pages read the cookie when no explicit
// `?loc=` is present. Cleared via /api/loc/clear.
const LOC_COOKIE = "rex_loc";

/**
 * Wraps the standard NextResponse.next() with two behaviors used across every
 * branch:
 *   - Mirrors `?loc=` into the persistent location cookie.
 *   - Stamps the request pathname into an `x-pathname` request header so
 *     server components (e.g. the header pill) can render context-aware
 *     "back to here" links — Next App Router doesn't expose pathname in
 *     `headers()` natively.
 */
function publicResponse(req: NextRequest): NextResponse {
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-pathname", req.nextUrl.pathname);
  reqHeaders.set("x-full-path", req.nextUrl.pathname + req.nextUrl.search);
  const res = NextResponse.next({ request: { headers: reqHeaders } });

  const loc = req.nextUrl.searchParams.get("loc");
  if (loc !== null) {
    const trimmed = loc.trim().slice(0, 80);
    if (trimmed) {
      res.cookies.set(LOC_COOKIE, trimmed, {
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
        sameSite: "lax",
      });
    } else {
      res.cookies.delete(LOC_COOKIE);
    }
  }
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public pages and APIs through
  if (
    PUBLIC_ROUTES.some((p) => pathMatches(pathname, p)) ||
    pathname === "/" ||
    pathname.startsWith("/unsubscribe") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return publicResponse(req);
  }

  const isProtectedApi = PROTECTED_PREFIXES.some((p) =>
    pathMatches(pathname, p),
  );
  const isProtectedPage = PROTECTED_PAGES_REGEX.test(pathname);
  if (!isProtectedApi && !isProtectedPage) {
    return publicResponse(req);
  }

  const cookie = req.cookies.get("newsletter_session")?.value;
  let valid = false;
  if (cookie && process.env.SESSION_PASSWORD) {
    try {
      await unsealData(cookie, { password: process.env.SESSION_PASSWORD });
      valid = true;
    } catch {
      valid = false;
    }
  }

  if (!valid) {
    if (isProtectedApi) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return publicResponse(req);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
