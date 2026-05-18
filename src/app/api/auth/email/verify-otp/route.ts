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
    // Single generic message so an attacker can't distinguish "no active
    // code for this email" (= unregistered email) from "code didn't match"
    // (= registered email with a pending OTP). Returning the failure
    // reason would let a determined attacker enumerate registered emails
    // at OTP-verify rate-limit speed (~20/30min/IP). The locked/expired
    // states are not actionable to the client either — the right next
    // action is always "request a new code."
    return NextResponse.json(
      { error: "Code expired, invalid, or already used. Request a new one." },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
