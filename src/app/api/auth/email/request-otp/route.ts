import { NextRequest, NextResponse } from "next/server";
import { requestEmailOtp } from "@/lib/email-otp";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// POST /api/auth/email/request-otp
// Body: { email: string }
// Always returns 200 with a generic "check your inbox" response — even
// when send failed or the request was rate-limited — to avoid leaking
// whether an email is registered. Real failures are logged server-side.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const body = (await req.json().catch(() => null)) as {
    email?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "valid email required" }, { status: 400 });
  }

  // 3 OTPs per email per hour — caps the "spam someone with codes" abuse
  // vector. 10 per IP per hour catches automated attempts across emails.
  const [emailLimit, ipLimit] = await Promise.all([
    rateLimit(`otp-email:${email}`, 3, 60 * 60 * 1000),
    rateLimit(`otp-ip:${ip}`, 10, 60 * 60 * 1000),
  ]);
  if (!emailLimit.ok || !ipLimit.ok) {
    // Same generic body as success — don't tell the attacker which limit hit.
    return NextResponse.json({ ok: true, message: "If that address is valid, a code is on the way." });
  }

  // Wrap in try/catch to honor the always-200 contract: any internal throw
  // (DB blip, missing env var, Resend SDK error) must not leak as a 5xx,
  // because a 5xx tells the client "this email is special" relative to a
  // generic 200 — partial enumeration channel. Log the reason so the cause
  // is visible in server logs, then mirror the success body.
  try {
    const result = await requestEmailOtp({ email, ipAddress: ip === "unknown" ? null : ip });
    if (!result.ok) {
      console.error("[otp request]", email, result.reason);
    }
  } catch (err) {
    console.error("[otp request] threw:", email, err);
  }
  return NextResponse.json({ ok: true, message: "If that address is valid, a code is on the way." });
}
