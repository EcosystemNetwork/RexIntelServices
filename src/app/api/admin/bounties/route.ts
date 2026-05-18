import { NextResponse } from "next/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, bounties, bountyPayouts } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =====================================================================
// GET /api/admin/bounties
//
// Ops overview. Returns four buckets useful for a glance at the bounty
// surface's health:
//
//   - unfunded_drafts: status=draft, sorted by created_at desc (creators
//     who haven't completed funding — usually means they need a nudge
//     or the funding email didn't land)
//   - awaiting_verification: status=funded but victim_verified_at IS NULL
//     (escrow arrived but victim hasn't completed OTP — same nudge case)
//   - stuck_payouts: bounty_payouts where status='pending' AND created_at
//     older than 30 minutes (the payout cron should have picked these up
//     by now; investigate before they pile up)
//   - failed_payouts: bounty_payouts where status='failed' — needs curator
//     attention (often: insufficient escrow, sanctioned destination,
//     Circle API change)
//
// Plus aggregate counters for the top of the page.
// =====================================================================

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const [
    unfundedDrafts,
    awaitingVerification,
    stuckPayouts,
    failedPayouts,
    counters,
  ] = await Promise.all([
    db
      .select({
        publicId: bounties.publicId,
        kind: bounties.kind,
        victimEmail: bounties.victimEmail,
        flatAmountUsdc: bounties.flatAmountUsdc,
        recoveryPercentBps: bounties.recoveryPercentBps,
        createdAt: bounties.createdAt,
        circleWalletAddress: bounties.circleWalletAddress,
      })
      .from(bounties)
      .where(eq(bounties.status, "draft"))
      .orderBy(desc(bounties.createdAt))
      .limit(50),

    db
      .select({
        publicId: bounties.publicId,
        kind: bounties.kind,
        victimEmail: bounties.victimEmail,
        escrowedAmountUsdc: bounties.escrowedAmountUsdc,
        createdAt: bounties.createdAt,
      })
      .from(bounties)
      .where(
        and(
          eq(bounties.status, "funded"),
          isNull(bounties.victimVerifiedAt),
        ),
      )
      .orderBy(desc(bounties.createdAt))
      .limit(50),

    db
      .select({
        id: bountyPayouts.id,
        bountyId: bountyPayouts.bountyId,
        amountUsdc: bountyPayouts.amountUsdc,
        payeeKind: bountyPayouts.payeeKind,
        createdAt: bountyPayouts.createdAt,
        failureReason: bountyPayouts.failureReason,
      })
      .from(bountyPayouts)
      .where(
        and(
          eq(bountyPayouts.status, "pending"),
          sql`${bountyPayouts.createdAt} < now() - interval '30 minutes'`,
        ),
      )
      .orderBy(desc(bountyPayouts.createdAt))
      .limit(50),

    db
      .select({
        id: bountyPayouts.id,
        bountyId: bountyPayouts.bountyId,
        amountUsdc: bountyPayouts.amountUsdc,
        payeeKind: bountyPayouts.payeeKind,
        failureReason: bountyPayouts.failureReason,
        createdAt: bountyPayouts.createdAt,
      })
      .from(bountyPayouts)
      .where(eq(bountyPayouts.status, "failed"))
      .orderBy(desc(bountyPayouts.createdAt))
      .limit(50),

    // Aggregate counts. 5 queries in one round trip; cheap on small N
    // and matches the existing admin dashboard pattern.
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'draft')        AS drafts,
        COUNT(*) FILTER (WHERE status = 'funded')       AS funded,
        COUNT(*) FILTER (WHERE status = 'open')         AS open,
        COUNT(*) FILTER (WHERE status = 'adjudicating') AS adjudicating,
        COUNT(*) FILTER (WHERE status = 'paid')         AS paid,
        COUNT(*) FILTER (WHERE status = 'refunded')     AS refunded,
        COUNT(*) FILTER (WHERE status = 'expired')      AS expired,
        COALESCE(SUM(escrowed_amount_usdc) FILTER (WHERE status IN ('open','adjudicating')), 0) AS live_escrow_usdc
      FROM bounties
    `),
  ]);

  return NextResponse.json({
    ok: true,
    counters: counters.rows[0] ?? {},
    unfundedDrafts,
    awaitingVerification,
    stuckPayouts,
    failedPayouts,
  });
}

