import { NextResponse } from "next/server";
import { destroyMagicSession } from "@/lib/magic-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/magic/logout
// Clears the Magic session cookie. The curator session is independent
// and untouched.
export async function POST() {
  await destroyMagicSession();
  return NextResponse.json({ ok: true });
}
