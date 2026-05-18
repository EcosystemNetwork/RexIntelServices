import { NextResponse } from "next/server";
import { destroyCircleSession } from "@/lib/circle-auth";

// POST /api/auth/circle/logout
// Clears the Circle session cookie. The curator session (newsletter_session)
// is independent and untouched.
export async function POST() {
  await destroyCircleSession();
  return NextResponse.json({ ok: true });
}
