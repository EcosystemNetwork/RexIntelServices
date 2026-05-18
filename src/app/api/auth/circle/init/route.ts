import { NextRequest, NextResponse } from "next/server";
import { beginCircleAuth, CircleAuthGateError } from "@/lib/circle-auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// POST /api/auth/circle/init
// Body: { email: string }
// Provisions (or reuses) a Circle user keyed on the email, mints a Circle
// session token + encryption key, and returns the data the web SDK needs
// to drive the PIN setup or PIN entry UI. Idempotent — calling with the
// same email returns the same circleUserId and either a fresh challengeId
// (no wallet yet) or null + walletAddress (already initialized).
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  // Tighter than /submit — Circle calls cost money and a flood here would
  // burn the API quota. 10 attempts per IP per 30min should accommodate
  // legitimate retry/typo scenarios without enabling probing.
  const limit = await rateLimit(`circle-init:${ip}`, 10, 30 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many auth attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    email?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "valid email required" }, { status: 400 });
  }

  try {
    const result = await beginCircleAuth(email);
    return NextResponse.json({
      circleUserId: result.circleUserId,
      userToken: result.userToken,
      encryptionKey: result.encryptionKey,
      challengeId: result.challengeId,
      walletAddress: result.walletAddress,
      // App id is public — surface it so the client SDK can init without
      // a separate config fetch.
      appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID ?? null,
    });
  } catch (err) {
    if (err instanceof CircleAuthGateError) {
      // 403 — distinct from a Circle API failure so the client can route
      // back to the OTP step instead of showing a generic error.
      return NextResponse.json(
        { error: err.message, reason: err.reason },
        { status: 403 },
      );
    }
    const msg = err instanceof Error ? err.message : "circle auth failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
