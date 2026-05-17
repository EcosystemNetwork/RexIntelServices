import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import { getSession } from "@/lib/auth";
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

  // Flush cached listing queries so the new state of this row is visible
  // immediately on /events, /jobs, /hackathons etc. without waiting for the
  // 5-minute revalidate backstop.
  revalidateTag(SUBMISSIONS_TAG);

  return NextResponse.json({ submission: row });
}
