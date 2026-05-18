import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  db,
  bounties,
  bountyClaims,
  type BountyClaimRejectionReason,
} from "@/lib/db";
import { getSession } from "@/lib/auth";
import { applyClaimReview } from "@/lib/bounty";
import { isSameOrigin } from "@/lib/origin-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =====================================================================
// POST /api/admin/bounty-claims/[publicId]/review
//
// Admin-session-gated claim adjudication. Wraps applyClaimReview(); the
// reviewer-user id comes from the admin session cookie.
// =====================================================================

type Body = {
  verdict?: "accepted" | "partial" | "rejected" | "needs_info";
  rejectionReason?: BountyClaimRejectionReason;
  payoutAmountUsdc?: number;
  curatorNotes?: string;
};

const VALID_VERDICTS = new Set<NonNullable<Body["verdict"]>>([
  "accepted",
  "partial",
  "rejected",
  "needs_info",
]);

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
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  if (!body.verdict || !VALID_VERDICTS.has(body.verdict)) {
    return NextResponse.json(
      { ok: false, error: "invalid_verdict" },
      { status: 400 },
    );
  }

  const [claim] = await db
    .select()
    .from(bountyClaims)
    .where(eq(bountyClaims.publicId, params.publicId))
    .limit(1);
  if (!claim) {
    return NextResponse.json(
      { ok: false, error: "claim_not_found" },
      { status: 404 },
    );
  }
  const TERMINAL = ["accepted", "partial", "rejected", "withdrawn"] as const;
  if ((TERMINAL as readonly string[]).includes(claim.status)) {
    return NextResponse.json(
      { ok: false, error: "claim_already_terminal", status: claim.status },
      { status: 409 },
    );
  }

  const [bounty] = await db
    .select()
    .from(bounties)
    .where(eq(bounties.id, claim.bountyId))
    .limit(1);
  if (!bounty) {
    return NextResponse.json(
      { ok: false, error: "bounty_not_found" },
      { status: 404 },
    );
  }

  try {
    const result = await applyClaimReview({
      claim,
      bounty,
      reviewerUserId: session.userId,
      verdict: body.verdict,
      rejectionReason: body.rejectionReason ?? null,
      payoutAmountUsdc: body.payoutAmountUsdc,
      curatorNotes: body.curatorNotes ?? null,
    });

    return NextResponse.json({
      ok: true,
      claim: {
        publicId: result.claim.publicId,
        status: result.claim.status,
        rejectionReason: result.claim.rejectionReason,
        strikeIssued: result.strikeIssued,
      },
      banApplied: result.banApplied,
      payoutId: result.payoutId ?? null,
      bondPayoutId: result.bondPayoutId ?? null,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown_error";
    const status = reason === "claim_already_reviewed" ? 409 : 400;
    return NextResponse.json(
      { ok: false, error: "review_failed", reason },
      { status },
    );
  }
}
