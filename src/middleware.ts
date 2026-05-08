import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { unsealData } from "iron-session";

const PROTECTED_PREFIXES = ["/api/subscribers", "/api/campaigns"];
const PROTECTED_PAGES_REGEX = /^\/(subscribers|campaigns)(\/|$)|^\/$/;

const PUBLIC_API = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/webhooks/",
  "/api/track/",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow webhooks, tracking, login, unsubscribe, and static pages through.
  if (
    PUBLIC_API.some((p) => pathname.startsWith(p)) ||
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
