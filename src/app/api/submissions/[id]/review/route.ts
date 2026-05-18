import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { awardContributionPoints } from "@/lib/circle-auth";
import { pointsKindForSubmission } from "@/lib/clearance";
import { awardCitationCredit } from "@/lib/citation-awards";
import { processLossReportApproval } from "@/lib/loss-report-attribution";
import type { LossReportPayload } from "@/lib/db/schema";
import { SUBMISSIONS_TAG } from "@/lib/cache";

/**
 * Admin-only: approve / reject / mark-spam a submission.
 * Auth handled by middleware (admin prefix); we re-check session for the
 * reviewedBy user id since middleware doesn't pass it through.
 *
 * POST /api/submissions/[id]/review
 * Body: { action: "approve" | "reject" | "spam", notes?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { action?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action;
  if (action !== "approve" && action !== "reject" && action !== "spam") {
    return NextResponse.json(
      { error: "action must be 'approve', 'reject', or 'spam'" },
      { status: 400 },
    );
  }

  const status =
    action === "approve" ? "approved" : action === "reject" ? "rejected" : "spam";

  // Read the prior row first so we can detect the pending → approved
  // transition (the only edge that awards points) and avoid double-awarding
  // when an already-approved submission is re-reviewed.
  const [prior] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, params.id))
    .limit(1);
  if (!prior) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const now = new Date();
  const [row] = await db
    .update(submissions)
    .set({
      status,
      reviewedBy: session.userId,
      reviewedAt: now,
      reviewNotes: body.notes?.trim().slice(0, 500) || null,
      publishedAt: action === "approve" ? now : null,
      updatedAt: now,
    })
    .where(eq(submissions.id, params.id))
    .returning();

  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Points award on the first pending → approved transition. Anonymous and
  // legacy email-only submissions still get the award (the email submitter
  // row earns points too — they just can't unlock wallet-gated surfaces
  // without later connecting a wallet). Skip if there's no submitter row at
  // all (anonymous intel).
  let award: { points: number; tier: string } | null = null;
  let citationsAwarded = 0;
  const isFirstApproval =
    action === "approve" && prior.status !== "approved";
  if (isFirstApproval && row.submitterId) {
    const kind = pointsKindForSubmission(row.type, row.payload);
    award = await awardContributionPoints({
      submitterId: row.submitterId,
      kind,
      submissionId: row.id,
      awardedByUserId: session.userId,
    });
  }
  // Citation credit: any prior approved intel that linked the same addresses
  // earns its original author +1 each (capped). Runs even for anonymous
  // currents — the *prior* authors are what's being credited.
  if (isFirstApproval && row.type === "intel") {
    try {
      const res = await awardCitationCredit({
        submissionId: row.id,
        awardedByUserId: session.userId,
      });
      citationsAwarded = res.awardedCount;
    } catch (err) {
      console.warn("[review] citation credit failed:", err);
    }
  }
  // Loss-report attribution: either write community-loss-report rows to the
  // address graph now, or mark the submission queued for backfill when the
  // open-tier submitter eventually earns a verified contribution.
  let graphAttribution: "written" | "queued" | null = null;
  if (isFirstApproval && row.type === "loss_report") {
    try {
      graphAttribution = await processLossReportApproval({
        submissionId: row.id,
        submitterId: row.submitterId,
        payload: row.payload as LossReportPayload,
      });
    } catch (err) {
      console.warn("[review] loss-report attribution failed:", err);
    }
  }

  // Flush cached listing queries so the new state of this row is visible
  // immediately on /events, /jobs, /hackathons etc. without waiting for the
  // 5-minute revalidate backstop.
  revalidateTag(SUBMISSIONS_TAG);

  return NextResponse.json({
    submission: row,
    award,
    citationsAwarded,
    graphAttribution,
  });
}
