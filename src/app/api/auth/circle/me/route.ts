import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCircleSession } from "@/lib/circle-auth";
import { db, submitters } from "@/lib/db";

// GET /api/auth/circle/me
// Returns the current Circle session's contributor profile, or 204 if no
// session. Re-reads the live `submitters` row so a contributor whose tier
// or points were updated since the cookie was minted sees current values.
export async function GET() {
  const session = await getCircleSession();
  if (!session) return new NextResponse(null, { status: 204 });

  const [row] = await db
    .select()
    .from(submitters)
    .where(eq(submitters.id, session.submitterId))
    .limit(1);
  if (!row) return new NextResponse(null, { status: 204 });

  return NextResponse.json({
    contributor: {
      id: row.id,
      slug: row.slug,
      email: row.email,
      walletAddress: row.walletAddress,
      displayHandle: row.displayHandle,
      points: row.points,
      clearanceTier: row.clearanceTier,
    },
  });
}
