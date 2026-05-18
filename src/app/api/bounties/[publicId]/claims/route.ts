import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  bounties,
  bountyClaims,
  submitters,
} from "@/lib/db";
import { getCircleSession, requireCircleTier } from "@/lib/circle-auth";
import {
  BOUNTY_CLAIM_MIN_TIER,
  bountyClaimBondUsdc,
  checkBountyClaimGate,
  validateClaimEvidence,
} from "@/lib/bounty";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/origin-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =====================================================================
// GET /api/bounties/[publicId]/claims
//
// Lists claims on a bounty. Gated:
//   - The victim sees every claim with its sealed evidence payload.
//   - Other trusted+ readers see a redacted summary (status + claimant
//     handle + submittedAt) so they can decide whether to submit their
//     own claim without freeriding off others' research.
//   - Everyone else gets only a count.
// =====================================================================

export async function GET(
  _req: NextRequest,
  { params }: { params: { publicId: string } },
) {
  const [bounty] = await db
    .select({
      id: bounties.id,
      publicId: bounties.publicId,
      victimSubmitterId: bounties.victimSubmitterId,
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

  const session = await getCircleSession();
  const isVictim =
    session?.submitterId &&
    bounty.victimSubmitterId &&
    session.submitterId === bounty.victimSubmitterId;
  const isTrusted = !!(await requireCircleTier(BOUNTY_CLAIM_MIN_TIER));

  const rows = await db
    .select({
      publicId: bountyClaims.publicId,
      status: bountyClaims.status,
      rejectionReason: bountyClaims.rejectionReason,
      submittedAt: bountyClaims.submittedAt,
      reviewedAt: bountyClaims.reviewedAt,
      claimantHandle: submitters.displayHandle,
      claimantSlug: submitters.slug,
      claimantId: submitters.id,
      evidencePayload: bountyClaims.evidencePayload,
    })
    .from(bountyClaims)
    .leftJoin(
      submitters,
      eq(submitters.id, bountyClaims.claimantSubmitterId),
    )
    .where(eq(bountyClaims.bountyId, bounty.id))
    .orderBy(desc(bountyClaims.submittedAt));

  if (isVictim) {
    return NextResponse.json({ ok: true, claims: rows, viewer: "victim" });
  }
  if (isTrusted) {
    // Match the detail page's identity-hiding rule: bad-faith verdicts get
    // their handle hidden so the public surface isn't a backdoor doxxing
    // mention.
    return NextResponse.json({
      ok: true,
      claims: rows.map((r) => {
        const hidden =
          r.status === "rejected" &&
          (r.rejectionReason === "bad_faith" ||
            r.rejectionReason === "doxx_attempt");
        return {
          publicId: r.publicId,
          status: r.status,
          rejectionReason: r.rejectionReason,
          submittedAt: r.submittedAt,
          reviewedAt: r.reviewedAt,
          claimantHandle: hidden ? null : r.claimantHandle ?? null,
          claimantSlug: hidden ? null : r.claimantSlug ?? null,
          claimantHidden: hidden,
        };
      }),
      viewer: "trusted",
    });
  }
  return NextResponse.json({
    ok: true,
    claims: { count: rows.length },
    viewer: "public",
  });
}

// =====================================================================
// POST /api/bounties/[publicId]/claims
//
// Submit a claim. Gated:
//   - Caller must have a Circle session.
//   - Caller must meet BOUNTY_CLAIM_MIN_TIER.
//   - Caller must not be bounty-banned (2 strikes per
//     project_bounty_bad_faith_policy.md).
//   - Caller cannot claim their own bounty.
//   - One claim per (bounty, claimant) — unique index. Re-submitting
//     returns the existing claim id with no DB write.
//
// Body:
//   { evidence: BountyClaimEvidence }
//
// On success returns: { publicId, bondAmountUsdc, bondDepositAddress? }
// where bondDepositAddress is the wallet the claimant should send the
// USDC bond to. (Bond rail is a TODO follow-up; v1 we accept claims with
// bondAmountUsdc=0 until the Circle deposit wallet lookup is wired up.)
// =====================================================================

export async function POST(
  req: NextRequest,
  { params }: { params: { publicId: string } },
) {
  // Defense in depth on top of SameSite=Lax cookies — a cross-origin
  // POST without an Origin (or with a wrong one) is rejected before we
  // touch the session or the DB.
  if (!isSameOrigin(req)) {
    return NextResponse.json(
      { ok: false, error: "bad_origin" },
      { status: 403 },
    );
  }

  const ip = clientIp(req);
  const limit = await rateLimit(`bounty-claim:${ip}`, 10, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const session = await requireCircleTier(BOUNTY_CLAIM_MIN_TIER);
  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        error: "insufficient_tier",
        required: BOUNTY_CLAIM_MIN_TIER,
      },
      { status: 403 },
    );
  }

  const gate = await checkBountyClaimGate(session.submitterId);
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.reason },
      { status: 403 },
    );
  }

  type Body = { evidence?: unknown };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const validated = validateClaimEvidence(body.evidence);
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, error: "validation_failed", reason: validated.reason },
      { status: 400 },
    );
  }

  const [bounty] = await db
    .select({
      id: bounties.id,
      publicId: bounties.publicId,
      status: bounties.status,
      victimSubmitterId: bounties.victimSubmitterId,
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
  if (bounty.status !== "open" && bounty.status !== "adjudicating") {
    return NextResponse.json(
      { ok: false, error: "bounty_not_open", status: bounty.status },
      { status: 409 },
    );
  }
  if (
    bounty.victimSubmitterId &&
    bounty.victimSubmitterId === session.submitterId
  ) {
    return NextResponse.json(
      { ok: false, error: "victim_cannot_claim_own_bounty" },
      { status: 403 },
    );
  }

  // Idempotent: if the claimant already has a claim on this bounty, return
  // it. The unique (bounty_id, claimant_submitter_id) index would error on
  // double-insert; doing the read first lets us 200 instead of 409.
  const [existing] = await db
    .select({
      publicId: bountyClaims.publicId,
      bondAmountUsdc: bountyClaims.bondAmountUsdc,
    })
    .from(bountyClaims)
    .where(
      and(
        eq(bountyClaims.bountyId, bounty.id),
        eq(bountyClaims.claimantSubmitterId, session.submitterId),
      ),
    )
    .limit(1);
  if (existing) {
    return NextResponse.json({
      ok: true,
      publicId: existing.publicId,
      bondAmountUsdc: existing.bondAmountUsdc,
      existed: true,
    });
  }

  const bond = bountyClaimBondUsdc();

  const [inserted] = await db
    .insert(bountyClaims)
    .values({
      bountyId: bounty.id,
      claimantSubmitterId: session.submitterId,
      claimantTierAtSubmit: session.clearanceTier,
      evidencePayload: validated.evidence,
      bondAmountUsdc: bond.toFixed(2),
      status: "submitted",
    })
    .returning({
      publicId: bountyClaims.publicId,
      bondAmountUsdc: bountyClaims.bondAmountUsdc,
    });

  // Move the bounty into adjudicating so the public surface signals that
  // claims are under review.
  await db
    .update(bounties)
    .set({ status: "adjudicating", updatedAt: new Date() })
    .where(eq(bounties.id, bounty.id));

  return NextResponse.json({
    ok: true,
    publicId: inserted!.publicId,
    bondAmountUsdc: inserted!.bondAmountUsdc,
    existed: false,
  });
}
