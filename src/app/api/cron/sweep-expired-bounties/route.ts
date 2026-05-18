import { NextResponse } from "next/server";
import { and, eq, inArray, lt } from "drizzle-orm";
import { db, bounties, bountyClaims, bountyPayouts } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";

/**
 * GET /api/cron/sweep-expired-bounties
 *
 * Hourly sweep. Two responsibilities:
 *
 *   1. Bounties whose expires_at has passed AND are still in
 *      open/funded/adjudicating get flipped to 'expired' and a
 *      victim_refund payout row is written for the full escrowed amount.
 *      An open bounty with no claims is the common path; an adjudicating
 *      bounty that ran out the clock without a curator verdict also
 *      lands here (curator missed the window → victim still gets refunded).
 *
 *   2. Any claims still in 'submitted' / 'under_review' / 'needs_info'
 *      against an expired bounty get auto-withdrawn so the gates on
 *      bounty_claims.bountyId + claimant unique-index don't soft-block
 *      a future re-post by the same claimant. Bonds are refunded.
 *
 * Auth: Bearer ${CRON_SECRET}.
 */

export async function GET(req: Request) {
  const fail = verifyCronSecret(req);
  if (fail) return NextResponse.json(fail.body, { status: fail.status });

  const now = new Date();

  // Step 1: find bounties past expiry that are still in a non-terminal state.
  const expiring = await db
    .select({
      id: bounties.id,
      publicId: bounties.publicId,
      victimSubmitterId: bounties.victimSubmitterId,
      escrowedAmountUsdc: bounties.escrowedAmountUsdc,
      status: bounties.status,
    })
    .from(bounties)
    .where(
      and(
        lt(bounties.expiresAt, now),
        inArray(bounties.status, ["open", "funded", "adjudicating"] as const),
      ),
    );

  let bountiesExpired = 0;
  let refundsWritten = 0;
  let claimsWithdrawn = 0;
  let bondsRefunded = 0;

  for (const b of expiring) {
    // Flip bounty to expired (and immediately to refunded if a refund row
    // is being written — keeps the public surface coherent: 'expired'
    // means the offer closed, 'refunded' means the money is on its way back).
    const escrow = Number(b.escrowedAmountUsdc ?? "0");
    const willRefund = escrow > 0;

    // Anon-victim guard: payout cron resolves the destination via
    // submitters.walletAddress (joined on payeeSubmitterId). For anon-victim
    // bounties (victimSubmitterId IS NULL) the cron has no destination,
    // returns skipped: no_or_invalid_destination, and the row sits pending
    // forever — i.e. anon-victim escrow gets stuck. Until the OTP-claim
    // refund path is wired, flip to 'expired' (not 'refunded') and surface
    // a loud warning so ops can manually sweep the wallet.
    const anonVictim = !b.victimSubmitterId;
    const writeRefund = willRefund && !anonVictim;

    await db
      .update(bounties)
      .set({
        status: writeRefund ? "refunded" : "expired",
        updatedAt: now,
      })
      .where(eq(bounties.id, b.id));
    bountiesExpired += 1;

    if (willRefund && anonVictim) {
      console.warn(
        `[sweep-expired-bounties] anon-victim bounty ${b.publicId} expired with $${escrow.toFixed(2)} in escrow and no submitter to refund — manual sweep required`,
      );
    }

    if (writeRefund) {
      await db.insert(bountyPayouts).values({
        bountyId: b.id,
        bountyClaimId: null,
        amountUsdc: escrow.toFixed(2),
        payeeKind: "victim_refund",
        payeeSubmitterId: b.victimSubmitterId,
        status: "pending",
      });
      refundsWritten += 1;
    }

    // Step 2: auto-withdraw any open claims and refund their bonds. Gated
    // on bondTxHash being present: an un-collected bond has no funds to
    // refund, and writing a payout row anyway would drain the bounty's own
    // escrow to the claimant (the payout cron sources from
    // bounties.circleWalletId regardless of payeeKind).
    const openClaims = await db
      .select({
        id: bountyClaims.id,
        publicId: bountyClaims.publicId,
        claimantSubmitterId: bountyClaims.claimantSubmitterId,
        bondAmountUsdc: bountyClaims.bondAmountUsdc,
        bondTxHash: bountyClaims.bondTxHash,
      })
      .from(bountyClaims)
      .where(
        and(
          eq(bountyClaims.bountyId, b.id),
          inArray(bountyClaims.status, [
            "submitted",
            "under_review",
            "needs_info",
          ] as const),
        ),
      );

    for (const c of openClaims) {
      await db
        .update(bountyClaims)
        .set({ status: "withdrawn", reviewedAt: now })
        .where(eq(bountyClaims.id, c.id));
      claimsWithdrawn += 1;

      const bond = Number(c.bondAmountUsdc ?? "0");
      if (bond > 0 && c.bondTxHash) {
        await db.insert(bountyPayouts).values({
          bountyId: b.id,
          bountyClaimId: c.id,
          amountUsdc: bond.toFixed(2),
          payeeKind: "bond_refund",
          payeeSubmitterId: c.claimantSubmitterId,
          status: "pending",
        });
        bondsRefunded += 1;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    bountiesExpired,
    refundsWritten,
    claimsWithdrawn,
    bondsRefunded,
    ranAt: now.toISOString(),
  });
}
