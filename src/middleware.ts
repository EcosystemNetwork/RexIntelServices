import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { unsealData } from "iron-session";
import { siteUrl } from "@/lib/site-url";

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
  /^\/(dashboard|subscribers|campaigns|submissions|tags|suppressions|users|bounty-overview|bounty-claims)(\/|$)/;

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

// AI crawler / LLM-training user-agents that get hard-blocked at the HTML
// surface. RexIntel's planned monetization is a paid B2B agent API (x402
// micro-fees) — humans browse free, agents pay. The block forces would-be
// data harvesters through the paid surface instead of scraping. Also see
// public/robots.txt for the polite-bot version.
//
// Matching is case-insensitive, substring against the User-Agent header.
// Internal API paths are NOT subject to this block — only public HTML pages.
// The exemption shapes:
//   - /api/* requests bypass the UA block (cron + webhook traffic)
//   - Static assets (_next/*, favicon) bypass the UA block
const BLOCKED_AGENT_PATTERNS = [
  "gptbot",
  "chatgpt-user",
  "oai-searchbot",
  "claudebot",
  "claude-web",
  "anthropic-ai",
  "cohere-ai",
  "ccbot",
  "google-extended",
  "perplexitybot",
  "perplexity-user",
  "amazonbot",
  "applebot-extended",
  "bytespider",
  "imagesiftbot",
  "diffbot",
  "omgili",
  "facebookbot",
  "meta-externalagent",
  "mistralai-user",
  "duckassistbot",
  "youbot",
  "timpibot",
  "icc-crawler",
];

function isBlockedAiAgent(ua: string | null): boolean {
  if (!ua) return false;
  const lc = ua.toLowerCase();
  return BLOCKED_AGENT_PATTERNS.some((pat) => lc.includes(pat));
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
    // Allowlist: only letters/digits/spaces/commas/dots/hyphens are valid
    // location-context tokens. A future component that renders rex_loc into
    // an href/meta-refresh without escaping shouldn't be able to be turned
    // into a `javascript:` redirect or HTML-injection vector from this
    // path. Anything outside the allowlist deletes the cookie instead of
    // setting it.
    if (trimmed && /^[A-Za-z0-9 ,.\-]{1,80}$/.test(trimmed)) {
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

  // ── AI-crawler block on public HTML surface ──────────────────────────
  // API paths (including operator/cron/webhook traffic) bypass this — they
  // have their own auth rails. Static assets bypass too. The block applies
  // to humans-browsing-the-site pages where we want to keep AI agents out
  // and route them to the future paid /api/v1/* surface instead.
  if (
    !pathname.startsWith("/api/") &&
    !pathname.startsWith("/_next/") &&
    pathname !== "/favicon.ico" &&
    isBlockedAiAgent(req.headers.get("user-agent"))
  ) {
    return new NextResponse(
      JSON.stringify({
        ok: false,
        error: "ai_agent_blocked",
        message:
          "RexIntel does not allow AI-crawler access to the public HTML surface. Use the paid agent API (coming soon) for programmatic data access.",
        humans: "If you're seeing this, please email rexintelservices@proton.me",
      }),
      {
        status: 403,
        headers: { "content-type": "application/json" },
      },
    );
  }

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

  // CSRF guard on every state-changing admin API call. Defense in depth on
  // top of the newsletter_session cookie's SameSite=Lax — Lax blocks
  // classic cross-site POSTs in modern browsers but not (a) top-level form
  // POSTs across origins or (b) requests from another path on the same
  // Vercel project. Without this, an admin browsing evil.com could trigger
  // a state-changing POST that carries the session cookie. The
  // /api/campaigns/[id]/send route is the worst case — one form post =
  // entire newsletter blast.
  if (
    isProtectedApi &&
    (req.method === "POST" ||
      req.method === "PATCH" ||
      req.method === "PUT" ||
      req.method === "DELETE")
  ) {
    if (!isAcceptableOrigin(req)) {
      return NextResponse.json({ error: "bad_origin" }, { status: 403 });
    }
  }

  return publicResponse(req);
}

function isAcceptableOrigin(req: NextRequest): boolean {
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
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === expectedHost;
    } catch {
      return false;
    }
  }
  // No Origin and no Referer — browsers always send at least one on a
  // state-changing request. Curl/bot traffic without either is exactly the
  // shape we want to reject here.
  return false;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
