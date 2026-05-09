import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";

/**
 * Admin-only: list submissions for the moderation queue.
 * Auth handled by middleware.ts (admin-only prefix).
 *
 * GET /api/submissions?status=pending&type=intel&limit=50
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "pending";
  const type = url.searchParams.get("type"); // optional: intel | event
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

  const validStatuses = ["pending", "approved", "rejected", "spam"] as const;
  if (!validStatuses.includes(status as never)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const isTypeFilter = type === "intel" || type === "event";
  const rowConditions = [
    eq(submissions.status, status as (typeof validStatuses)[number]),
  ];
  if (isTypeFilter) rowConditions.push(eq(submissions.type, type));

  const [rows, [{ counts }]] = await Promise.all([
    db
      .select()
      .from(submissions)
      .where(and(...rowConditions))
      .orderBy(desc(submissions.createdAt))
      .limit(limit),
    db
      .select({
        counts: sql<{
          pending: number;
          approved: number;
          rejected: number;
          spam: number;
        }>`json_build_object(
          'pending', count(*) filter (where status = 'pending')::int,
          'approved', count(*) filter (where status = 'approved')::int,
          'rejected', count(*) filter (where status = 'rejected')::int,
          'spam', count(*) filter (where status = 'spam')::int
        )`,
      })
      .from(submissions)
      .where(isTypeFilter ? eq(submissions.type, type) : undefined),
  ]);

  return NextResponse.json({ submissions: rows, counts });
}
