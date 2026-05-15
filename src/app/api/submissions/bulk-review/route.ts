import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import { getSession } from "@/lib/auth";

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
    .returning({ id: submissions.id });

  return NextResponse.json({
    ok: true,
    updatedCount: updated.length,
    requestedCount: ids.length,
  });
}
