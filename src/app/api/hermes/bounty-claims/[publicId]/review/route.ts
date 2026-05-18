import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  db,
  bounties,
  bountyClaims,
  users,
  type BountyClaimRejectionReason,
} from "@/lib/db";
import { requireHermes } from "@/lib/hermes-auth";
import { applyClaimReview } from "@/lib/bounty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =====================================================================
// POST /api/hermes/bounty-claims/[publicId]/review
//
// Hermes-only. Curator verdict on a bounty claim. Single endpoint covers
// all four terminal verdicts and the non-terminal needs_info nudge.
// applyClaimReview is the single source of truth — this handler is
// translation only (HTTP → typed args → JSON).
//
// On accepted/partial verdicts a pending bountyPayouts row is written;
// the actual Circle transfer is dispatched by a separate worker that
// watches `bounty_payouts.status = 'pending'`. Bond refund/slash payout
// rows are also written here.
//
// Body:
//   { verdict: "accepted" | "partial" | "rejected" | "needs_info",
//     rejectionReason?: "insufficient_evidence" | "duplicate" |
//                        "out_of_scope" | "bad_faith" | "doxx_attempt",
//     payoutAmountUsdc?: number,   // required for accepted/partial
//     curatorNotes?: string,
//     reviewerEmail?: string }     // optional, resolves to users.id
// =====================================================================

type Body = {
  verdict?: "accepted" | "partial" | "rejected" | "needs_info";
  rejectionReason?: BountyClaimRejectionReason;
  payoutAmountUsdc?: number;
  curatorNotes?: string;
  reviewerEmail?: string;
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
  const denial = requireHermes(req);
  if (denial) return denial;

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

  // Already-terminal claims cannot be re-reviewed. accepted/partial/
  // rejected/withdrawn are terminal; submitted / under_review / needs_info
  // are open for new verdicts.
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

  // Resolve the reviewer user id. If not provided we fall back to the
  // "Hermes operator" service user — created on first use.
  let reviewerUserId: string;
  const email = (body.reviewerEmail ?? "hermes@rexintel.local").trim().toLowerCase();
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (u) {
    reviewerUserId = u.id;
  } else {
    // Service account — never password-loginable. Bcrypt-hash a 32-byte
    // random string the caller never sees, so even if /login later
    // accepts this user's row, no plaintext password can authenticate.
    // Belt-and-braces hardening on top of "this email isn't surfaced in
    // any sign-in flow."
    const disabledPasswordHash = await bcrypt.hash(
      randomBytes(32).toString("hex"),
      12,
    );
    const [created] = await db
      .insert(users)
      .values({
        email,
        passwordHash: disabledPasswordHash,
        name: "Hermes (operator)",
      })
      .returning({ id: users.id });
    reviewerUserId = created!.id;
  }

  try {
    const result = await applyClaimReview({
      claim,
      bounty,
      reviewerUserId,
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
    // claim_already_reviewed comes from the status-guarded UPDATE — another
    // request beat us to the verdict. 409 so clients can refetch and skip.
    const status = reason === "claim_already_reviewed" ? 409 : 400;
    return NextResponse.json(
      { ok: false, error: "review_failed", reason },
      { status },
    );
  }
}
