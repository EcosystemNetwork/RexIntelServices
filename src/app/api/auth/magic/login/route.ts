import { NextRequest, NextResponse } from "next/server";
import { completeMagicLogin, MagicAuthError } from "@/lib/magic-auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/magic/login
// Body: { didToken: string }
//
// The DID token comes from `magic.auth.loginWithEmailOTP` on the client.
// Magic only issues it after the user passes their OTP challenge, so the
// token doubles as proof of email ownership. Server validates the token
// (signature, expiry, audience) via the Admin SDK and mints our session
// cookie keyed on the submitter row resolved by email.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  // Tight on this endpoint: the Magic Admin SDK call is the only paid path,
  // and a flood would burn Magic quota. 10/IP/30min.
  const limit = await rateLimit(`magic-login:${ip}`, 10, 30 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many auth attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    didToken?: string;
  } | null;
  const didToken = body?.didToken?.trim();
  if (!didToken || didToken.length < 32 || didToken.length > 4096) {
    return NextResponse.json(
      { error: "didToken required" },
      { status: 400 },
    );
  }

  try {
    const submitter = await completeMagicLogin({ didToken });
    return NextResponse.json({
      ok: true,
      contributor: {
        id: submitter.id,
        slug: submitter.slug,
        walletAddress: submitter.walletAddress,
        displayHandle: submitter.displayHandle,
        points: submitter.points,
        clearanceTier: submitter.clearanceTier,
      },
    });
  } catch (err) {
    if (err instanceof MagicAuthError) {
      return NextResponse.json(
        { error: err.message, reason: err.reason },
        { status: 401 },
      );
    }
    const msg = err instanceof Error ? err.message : "magic login failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
