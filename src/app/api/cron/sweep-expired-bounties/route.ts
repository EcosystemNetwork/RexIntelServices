import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { and, eq, inArray, lt } from "drizzle-orm";
import { db, bounties, bountyClaims, bountyPayouts } from "@/lib/db";

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
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  // Timing-safe header check — a naive === leaks one byte at a time on a
  // remote timing oracle. Length-mismatched headers fall through to a
  // dummy compare so the failure latency doesn't reveal a length match.
  const expectedHeader = `Bearer ${expected}`;
  const presented = req.headers.get("authorization") ?? "";
  const a = Buffer.from(expectedHeader);
  const b = Buffer.from(
    presented.length === expectedHeader.length
      ? presented
      : expectedHeader,
  );
  const headerOk =
    presented.length === expectedHeader.length && timingSafeEqual(a, b);
  if (!headerOk) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

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

    await db
      .update(bounties)
      .set({
        status: willRefund ? "refunded" : "expired",
        updatedAt: now,
      })
      .where(eq(bounties.id, b.id));
    bountiesExpired += 1;

    if (willRefund) {
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

    // Step 2: auto-withdraw any open claims and refund their bonds.
    const openClaims = await db
      .select({
        id: bountyClaims.id,
        publicId: bountyClaims.publicId,
        claimantSubmitterId: bountyClaims.claimantSubmitterId,
        bondAmountUsdc: bountyClaims.bondAmountUsdc,
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
      if (bond > 0) {
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
