import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { unsealData } from "iron-session";

// Admin pages and API routes that require authentication
const PROTECTED_PREFIXES = [
  "/api/subscribers",
  "/api/campaigns",
  "/api/submissions",
];
const PROTECTED_PAGES_REGEX =
  /^\/(dashboard|subscribers|campaigns|submissions)(\/|$)/;

// Public routes that should never be blocked
const PUBLIC_ROUTES = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/webhooks/",
  "/api/track/",
  "/api/subscribe",
  "/api/submit",
  // Vercel Cron requests don't carry a session — protected instead by a
  // CRON_SECRET bearer token validated inside each /api/cron/* route.
  "/api/cron/",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public pages and APIs through
  if (
    PUBLIC_ROUTES.some((p) => pathname.startsWith(p)) ||
    pathname === "/" ||
    pathname.startsWith("/unsubscribe") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const isProtectedApi = PROTECTED_PREFIXES.some((p) =>
    pathname.startsWith(p),
  );
  const isProtectedPage = PROTECTED_PAGES_REGEX.test(pathname);
  if (!isProtectedApi && !isProtectedPage) return NextResponse.next();

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

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
