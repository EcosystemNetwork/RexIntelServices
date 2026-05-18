import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, bounties } from "@/lib/db";
import { requireHermes } from "@/lib/hermes-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =====================================================================
// POST /api/bounties/[publicId]/fund
//
// Hermes-only (Circle webhook proxy). Reports that USDC has landed in the
// custodial escrow wallet for a bounty. Flips status draft → funded → open
// once the escrowed amount meets the bounty's posted amount.
//
// We gate this on the Hermes bearer rather than the Circle webhook
// directly so the same path can be exercised by integration tests and by
// future ops tooling. The Circle webhook handler lives at
// /api/auth/circle/* and forwards confirmed transfers here.
//
// Body:
//   { amountUsdc: number,
//     fundingTxHash?: string,
//     circleWalletId?: string }
// =====================================================================

export async function POST(
  req: NextRequest,
  { params }: { params: { publicId: string } },
) {
  const denial = requireHermes(req);
  if (denial) return denial;

  type Body = {
    amountUsdc?: number;
    fundingTxHash?: string;
    circleWalletId?: string;
  };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const amount = Number(body.amountUsdc);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { ok: false, error: "amount_required" },
      { status: 400 },
    );
  }

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

  if (bounty.status !== "draft" && bounty.status !== "funded") {
    // Once we're past the initial funding stage the status machine moves
    // on its own (open / adjudicating / paid). Late top-ups land here too,
    // but only while the bounty is still being assembled.
    return NextResponse.json(
      {
        ok: false,
        error: "bounty_not_fundable",
        status: bounty.status,
      },
      { status: 409 },
    );
  }

  // Bump the escrowed amount. Threshold to flip funded → open: the
  // escrowed total covers the posted amount AND the victim has proven
  // ownership of the email (audit finding #5 — without verification a
  // malicious actor could post + fund a bounty in someone else's name,
  // taking it public for defamation/harassment). If escrow covers the
  // amount but the victim hasn't verified, we stay in `funded` and the
  // detail page surfaces a "verify your email to publish" CTA.
  const newEscrowed = Number(bounty.escrowedAmountUsdc ?? "0") + amount;
  const posted =
    bounty.kind === "recovery"
      ? 0
      : Number(bounty.flatAmountUsdc ?? "0");
  const escrowSatisfied = newEscrowed >= Math.max(posted, 1);
  const victimVerified = bounty.victimVerifiedAt != null;
  const shouldOpen = escrowSatisfied && victimVerified;

  await db
    .update(bounties)
    .set({
      escrowedAmountUsdc: sql`${bounties.escrowedAmountUsdc} + ${amount.toFixed(2)}`,
      circleWalletId: body.circleWalletId ?? bounty.circleWalletId,
      fundingTxHash: body.fundingTxHash ?? bounty.fundingTxHash,
      status: shouldOpen ? "open" : "funded",
      updatedAt: new Date(),
    })
    .where(eq(bounties.id, bounty.id));

  return NextResponse.json({
    ok: true,
    publicId: bounty.publicId,
    escrowedAmountUsdc: newEscrowed.toFixed(2),
    status: shouldOpen ? "open" : "funded",
    escrowSatisfied,
    victimVerified,
    // Surfaced so the funding-status UI knows what's still blocking
    // publication when status stays at `funded`.
    nextAction: shouldOpen
      ? "claim_window_open"
      : !escrowSatisfied
        ? "need_more_escrow"
        : "need_victim_verification",
  });
}
