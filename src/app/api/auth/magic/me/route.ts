import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getMagicSession } from "@/lib/magic-auth";
import { db, submitters } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/auth/magic/me
// Returns the current Magic session's contributor profile, or 204 if no
// session. Re-reads the live `submitters` row so updates to tier/points/
// handle since the cookie was minted surface to the client.
export async function GET() {
  const session = await getMagicSession();
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
