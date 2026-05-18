import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { awardContributionPoints } from "@/lib/circle-auth";
import { pointsKindForSubmission } from "@/lib/clearance";
import { awardCitationCredit } from "@/lib/citation-awards";
import { processLossReportApproval } from "@/lib/loss-report-attribution";
import type { LossReportPayload } from "@/lib/db/schema";
import { SUBMISSIONS_TAG } from "@/lib/cache";

/**
 * Admin-only: review N submissions with the same action in a single call.
 * Mirrors /api/submissions/[id]/review but for a batch — saves the
 * moderator from clicking through 30 honeypot-marked spam rows one by one.
 *
 * POST /api/submissions/bulk-review
 * Body: { ids: string[], action: "approve" | "reject" | "spam" }
 *
 * Only rows currently in `pending` get updated; already-reviewed rows are
 * left alone. Returns the count of rows actually changed so the caller
 * can surface "3 of 5 were already reviewed" if needed.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { ids?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 200)
    : [];
  if (ids.length === 0) {
    return NextResponse.json(
      { error: "ids must be a non-empty array" },
      { status: 400 },
    );
  }

  const action = body.action;
  if (action !== "approve" && action !== "reject" && action !== "spam") {
    return NextResponse.json(
      { error: "action must be 'approve', 'reject', or 'spam'" },
      { status: 400 },
    );
  }

  const newStatus =
    action === "approve" ? "approved" : action === "reject" ? "rejected" : "spam";
  const now = new Date();

  // For approvals we need (type, payload, submitterId) to issue points, so
  // capture the rows we actually updated rather than just their ids. The
  // pending-only filter ensures we never double-award on a retry.
  const updated = await db
    .update(submissions)
    .set({
      status: newStatus,
      reviewedBy: session.userId,
      reviewedAt: now,
      publishedAt: action === "approve" ? now : null,
      updatedAt: now,
    })
    .where(
      and(
        inArray(submissions.id, ids),
        eq(submissions.status, "pending"),
      ),
    )
    .returning({
      id: submissions.id,
      type: submissions.type,
      payload: submissions.payload,
      submitterId: submissions.submitterId,
    });

  let awardedCount = 0;
  let citationsAwarded = 0;
  if (action === "approve") {
    // Sequential rather than Promise.all — awardContributionPoints runs a
    // transaction per call, and parallel writes against the same submitter
    // row would race on the points cache. N is bounded to 200 anyway.
    for (const r of updated) {
      if (r.submitterId) {
        const kind = pointsKindForSubmission(r.type, r.payload);
        await awardContributionPoints({
          submitterId: r.submitterId,
          kind,
          submissionId: r.id,
          awardedByUserId: session.userId,
        });
        awardedCount += 1;
      }
      // Citation credit fires for every intel approval, including anonymous
      // currents (the *prior* authors are what's being rewarded).
      if (r.type === "intel") {
        try {
          const res = await awardCitationCredit({
            submissionId: r.id,
            awardedByUserId: session.userId,
          });
          citationsAwarded += res.awardedCount;
        } catch (err) {
          console.warn("[bulk-review] citation credit failed:", err);
        }
      }
      // Loss-report attribution gate. Same rules as the single-row endpoint:
      // anonymous + contributor-tier+ write immediately; open-tier queue.
      if (r.type === "loss_report") {
        try {
          await processLossReportApproval({
            submissionId: r.id,
            submitterId: r.submitterId,
            payload: r.payload as LossReportPayload,
          });
        } catch (err) {
          console.warn("[bulk-review] loss-report attribution failed:", err);
        }
      }
    }
  }

  if (updated.length > 0) {
    revalidateTag(SUBMISSIONS_TAG);
  }

  return NextResponse.json({
    ok: true,
    updatedCount: updated.length,
    requestedCount: ids.length,
    awardedCount,
    citationsAwarded,
  });
}
