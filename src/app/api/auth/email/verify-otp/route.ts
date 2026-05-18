import { NextRequest, NextResponse } from "next/server";
import { verifyEmailOtp } from "@/lib/email-otp";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// POST /api/auth/email/verify-otp
// Body: { email: string, code: string }
// On success: sets the sealed `rex_email_verified` cookie (handled inside
// verifyEmailOtp) and returns { ok: true }. The client then calls
// /api/auth/circle/init, which consumes the cookie.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  // Tighter rate limit on verify than on request — brute-force resistance.
  // 20 attempts per IP per 30min combined with the per-row 5-attempt cap
  // closes the 6-digit guess space cold.
  const limit = await rateLimit(`otp-verify:${ip}`, 20, 30 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    email?: string;
    code?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase();
  const code = body?.code?.trim();
  if (!email || !code) {
    return NextResponse.json(
      { error: "email and code required" },
      { status: 400 },
    );
  }

  const result = await verifyEmailOtp({ email, code });
  if (!result.ok) {
    const msg =
      result.reason === "expired"
        ? "Code expired. Request a new one."
        : result.reason === "locked"
          ? "Too many attempts on that code. Request a new one."
          : result.reason === "not_found"
            ? "No active code for that email. Request one first."
            : "That code didn't match.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
