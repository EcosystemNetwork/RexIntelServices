import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, bounties } from "@/lib/db";
import { consumeEmailVerifiedCookie } from "@/lib/email-otp";
import { checkVictimAccessToken } from "@/lib/bounty";
import { isSameOrigin } from "@/lib/origin-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =====================================================================
// POST /api/bounties/[publicId]/verify-victim
//
// Stamps `victim_verified_at` on a draft bounty. Two acceptable proofs:
//   1. A presented access token that matches the stored hash AND the
//      caller just completed an email-OTP round for the bounty's
//      victim email (the rex_email_verified cookie is consumed).
//   2. (Future) Circle session match — handled at create time, so any
//      caller hitting this route is by definition the token+OTP path.
//
// Idempotent: if already verified, returns ok=true without re-consuming
// the OTP cookie.
//
// Origin-checked to defend cookie-auth POSTs against CSRF in addition to
// SameSite=Lax on the cookies.
// =====================================================================

export async function POST(
  req: NextRequest,
  { params }: { params: { publicId: string } },
) {
  if (!isSameOrigin(req)) {
    return NextResponse.json(
      { ok: false, error: "bad_origin" },
      { status: 403 },
    );
  }

  type Body = { token?: string };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const [bounty] = await db
    .select({
      id: bounties.id,
      publicId: bounties.publicId,
      victimEmail: bounties.victimEmail,
      victimVerifiedAt: bounties.victimVerifiedAt,
      victimAccessTokenHash: bounties.victimAccessTokenHash,
    })
    .from(bounties)
    .where(eq(bounties.publicId, params.publicId))
    .limit(1);

  if (!bounty) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }

  if (bounty.victimVerifiedAt) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  if (!checkVictimAccessToken(body.token, bounty.victimAccessTokenHash)) {
    return NextResponse.json(
      { ok: false, error: "invalid_token" },
      { status: 403 },
    );
  }

  // Consume the email-OTP cookie — single-use, must match the bounty's
  // victim email. consumeEmailVerifiedCookie clears the cookie on
  // success so a stolen browser session can't replay verification
  // against multiple bounties.
  const verified = await consumeEmailVerifiedCookie(bounty.victimEmail);
  if (!verified) {
    return NextResponse.json(
      {
        ok: false,
        error: "otp_required",
        hint: "Complete email-OTP verification for the bounty's victim email first.",
      },
      { status: 403 },
    );
  }

  await db
    .update(bounties)
    .set({
      victimVerifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(bounties.id, bounty.id));

  return NextResponse.json({ ok: true, verified: true });
}
