import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  findOrCreateOperatorUser,
  isOperatorEmail,
} from "@/lib/auth";
import { resolveMagicDidToken, MagicAuthError } from "@/lib/magic-auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/operator/magic-login
// Body: { didToken: string }
//
// Operator (admin) sign-in via Magic Link. Validates the DID token,
// checks the verified email against the operator allowlist, then mints
// the `newsletter_session` cookie that the middleware + (admin) layout
// already use to gate every admin surface.
//
// The community Magic flow (`/api/auth/magic/login`) is unchanged —
// that endpoint mints `rex_magic_session` for submitters. Operators and
// community contributors run on independent cookies; a single Magic
// account can hold both sessions simultaneously without one stomping
// the other.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  // Tighter than the community Magic route — the operator surface has a
  // much smaller legitimate userbase (currently 1). 5 / IP / 15min is
  // generous for an admin re-trying after a flaky OTP without giving an
  // attacker meaningful budget to burn Magic quota.
  const ipLimit = await rateLimit(
    `operator-magic-login-ip:${ip}`,
    5,
    15 * 60 * 1000,
  );
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(ipLimit.retryAfterSec) },
      },
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

  let meta;
  try {
    meta = await resolveMagicDidToken(didToken);
  } catch (err) {
    if (err instanceof MagicAuthError) {
      return NextResponse.json(
        { error: "Authentication failed" },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: "Magic validation failed" },
      { status: 502 },
    );
  }

  if (!meta.email) {
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 401 },
    );
  }

  // Identical generic 401 whether the email is allowlisted or not — an
  // operator portal that distinguished "wrong email" from "wrong code"
  // would leak which addresses are admins.
  if (!isOperatorEmail(meta.email)) {
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 401 },
    );
  }

  const user = await findOrCreateOperatorUser(meta.email);
  await createSession({ userId: user.id, email: user.email });
  return NextResponse.json({ ok: true });
}
