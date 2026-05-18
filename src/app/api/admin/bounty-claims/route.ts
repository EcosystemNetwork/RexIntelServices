import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  bounties,
  bountyClaims,
  submitters,
} from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =====================================================================
// GET /api/admin/bounty-claims
//
// Curator queue. Admin-session-gated. Returns claims in non-terminal
// statuses (submitted, under_review, needs_info) joined with the bounty
// kind/amount + claimant handle so the queue table can render without
// extra round trips.
//
// Optional ?status=… to filter to a single open status. Default is all
// non-terminal.
// =====================================================================

const NON_TERMINAL = ["submitted", "under_review", "needs_info"] as const;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");
  const filteredStatuses =
    statusFilter && (NON_TERMINAL as readonly string[]).includes(statusFilter)
      ? [statusFilter as (typeof NON_TERMINAL)[number]]
      : (NON_TERMINAL as unknown as Array<(typeof NON_TERMINAL)[number]>);

  const rows = await db
    .select({
      claimPublicId: bountyClaims.publicId,
      claimStatus: bountyClaims.status,
      submittedAt: bountyClaims.submittedAt,
      lastTouchedAt: bountyClaims.lastTouchedAt,
      claimantSubmitterId: bountyClaims.claimantSubmitterId,
      claimantHandle: submitters.displayHandle,
      claimantSlug: submitters.slug,
      claimantStrikes: submitters.bountyStrikes,
      claimantBannedAt: submitters.bountyBannedAt,
      evidence: bountyClaims.evidencePayload,
      bondAmountUsdc: bountyClaims.bondAmountUsdc,
      bountyPublicId: bounties.publicId,
      bountyKind: bounties.kind,
      bountyStatus: bounties.status,
      bountyFlatAmountUsdc: bounties.flatAmountUsdc,
      bountyRecoveryPercentBps: bounties.recoveryPercentBps,
      bountyEscrowedAmountUsdc: bounties.escrowedAmountUsdc,
      bountyVictimEmail: bounties.victimEmail,
      bountyExpiresAt: bounties.expiresAt,
      bountyPoliceReportFiled: bounties.policeReportFiled,
    })
    .from(bountyClaims)
    .innerJoin(bounties, eq(bounties.id, bountyClaims.bountyId))
    .leftJoin(submitters, eq(submitters.id, bountyClaims.claimantSubmitterId))
    .where(and(inArray(bountyClaims.status, filteredStatuses)))
    // Oldest-needing-attention first: a claim that's been sitting
    // unanswered the longest tops the queue. submittedAt as the tie-break
    // keeps fresh re-submissions from leapfrogging stale ones.
    .orderBy(asc(bountyClaims.lastTouchedAt), asc(bountyClaims.submittedAt))
    .limit(200);

  return NextResponse.json({ ok: true, claims: rows });
}
