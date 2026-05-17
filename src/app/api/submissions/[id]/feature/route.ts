import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { SUBMISSIONS_TAG } from "@/lib/cache";

/**
 * Admin-only: toggle the `featured` flag on a submission so it pins to
 * the top of its listing surface.
 *
 * Auth handled by middleware (admin prefix); we still call getSession
 * to confirm — middleware doesn't pass anything we need here, this is
 * defense-in-depth.
 *
 * POST /api/submissions/[id]/feature
 * Body: { featured: boolean }
 *
 * Returns the updated row so the client can patch its local state
 * without an extra fetch.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { featured?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.featured !== "boolean") {
    return NextResponse.json(
      { error: "featured must be boolean" },
      { status: 400 },
    );
  }

  const [row] = await db
    .update(submissions)
    .set({ featured: body.featured, updatedAt: new Date() })
    .where(eq(submissions.id, params.id))
    .returning();

  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Featuring pins ordering on listing pages — flush cached listings so the
  // change is visible immediately.
  revalidateTag(SUBMISSIONS_TAG);

  return NextResponse.json({ submission: row });
}
