import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, bounties, hackTraces } from "@/lib/db";
import { getMagicSession } from "@/lib/magic-auth";
import { meetsTier } from "@/lib/clearance";
import { BOUNTY_CLAIM_MIN_TIER, checkVictimAccessToken } from "@/lib/bounty";
import { isPubliclyVisible } from "@/lib/bounty-visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =====================================================================
// GET /api/bounties/[publicId]
//
// Public bounty detail. Returns the headline fields for everyone, but
// gates the full markdown `description` behind the same trust tier that
// gates claim submission — skin-in-the-game for reading the actual asks.
// Anyone signed in at trusted+ tier (or the victim themselves) sees the
// full description; everyone else sees a redacted preview.
// =====================================================================

export async function GET(
  req: NextRequest,
  { params }: { params: { publicId: string } },
) {
  const [bounty] = await db
    .select()
    .from(bounties)
    .where(eq(bounties.publicId, params.publicId))
    .limit(1);

  if (!bounty) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }

  // Three viewer modes for draft/funded/refunded/expired bounties:
  //   - victim via Magic session (matches victimSubmitterId)
  //   - victim via raw access token presented as ?token=… (works for
  //     anon victims with no contributor account — audit finding #6)
  //   - public — falls through to the "not visible" 404 below
  const session = await getMagicSession();
  const isVictimSession =
    !!session?.submitterId &&
    !!bounty.victimSubmitterId &&
    session.submitterId === bounty.victimSubmitterId;

  const presentedToken = new URL(req.url).searchParams.get("token");
  const isVictimToken = checkVictimAccessToken(
    presentedToken,
    bounty.victimAccessTokenHash,
  );
  const isVictim = isVictimSession || isVictimToken;

  if (!isPubliclyVisible(bounty.status) && !isVictim) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }

  // Description gate: full text for victim, trusted+ readers, and admins.
  // Everyone else gets a 200-char preview that the UI can dress up as a
  // "sign in at trusted tier to read the full bounty" CTA.
  const isTrusted =
    !!session && meetsTier(session.clearanceTier, BOUNTY_CLAIM_MIN_TIER);
  const showFullDescription = isVictim || isTrusted;

  // Trace context (optional) — gives the public page enough to show the
  // chain + root address without a second round trip.
  let trace: {
    publicId: string;
    chain: string;
    rootAddress: string;
    lossUsd: string | null;
  } | null = null;
  if (bounty.hackTraceId) {
    const [t] = await db
      .select({
        publicId: hackTraces.publicId,
        chain: hackTraces.chain,
        rootAddress: hackTraces.rootAddress,
        lossUsd: hackTraces.lossUsd,
      })
      .from(hackTraces)
      .where(eq(hackTraces.id, bounty.hackTraceId))
      .limit(1);
    trace = t ?? null;
  }

  return NextResponse.json({
    ok: true,
    bounty: {
      publicId: bounty.publicId,
      kind: bounty.kind,
      status: bounty.status,
      recoveryPercentBps: bounty.recoveryPercentBps,
      flatAmountUsdc: bounty.flatAmountUsdc,
      escrowedAmountUsdc: bounty.escrowedAmountUsdc,
      policeReportFiled: bounty.policeReportFiled,
      expiresAt: bounty.expiresAt,
      createdAt: bounty.createdAt,
      victimVerified: bounty.victimVerifiedAt != null,
      description: showFullDescription
        ? bounty.description
        : bounty.description.slice(0, 200) +
          (bounty.description.length > 200 ? "…" : ""),
      descriptionRedacted: !showFullDescription,
      trace,
    },
    viewer: {
      isVictim,
      isVictimViaToken: isVictimToken,
      meetsClaimTier: isTrusted,
    },
  });
}
