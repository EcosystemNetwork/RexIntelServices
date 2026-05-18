import { NextRequest, NextResponse } from "next/server";
import { completeCircleAuth } from "@/lib/circle-auth";

// POST /api/auth/circle/complete
// Body: { email: string }
// Called after the web SDK reports challenge success. Server re-fetches
// the user's wallet from Circle (now provisioned post-PIN), persists it
// to the submitter row, and mints the session cookie.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    email?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  try {
    const submitter = await completeCircleAuth({ email });
    return NextResponse.json({
      ok: true,
      contributor: {
        id: submitter.id,
        slug: submitter.slug,
        walletAddress: submitter.walletAddress,
        displayHandle: submitter.displayHandle,
        points: submitter.points,
        clearanceTier: submitter.clearanceTier,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "circle complete failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
