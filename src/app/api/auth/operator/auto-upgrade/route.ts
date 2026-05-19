import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  createSession,
  findOrCreateOperatorUser,
  getSession,
  isOperatorEmail,
} from "@/lib/auth";
import { getMagicSession } from "@/lib/magic-auth";
import { db, submitters } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/auth/operator/auto-upgrade
//
// Inline-upgrade rail: when a visitor already holds a community Magic
// session whose email is on the operator allowlist, mint the operator
// session without a second OTP round-trip — the DID token was already
// validated when the community session was minted.
//
// Lives in a Route Handler (not the /login Server Component) because
// Next.js 14 only permits cookies().set() from Server Actions and Route
// Handlers; calling createSession() inline during a page render throws
// "Cookies can only be modified in a Server Action or Route Handler"
// and breaks the login surface for the exact users it was meant to
// fast-path.
export async function GET(req: NextRequest) {
  if (await getSession()) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  const magic = await getMagicSession();
  if (!magic) {
    return NextResponse.redirect(new URL("/login?upgrade=skip", req.url));
  }

  const [row] = await db
    .select({ email: submitters.email })
    .from(submitters)
    .where(eq(submitters.id, magic.submitterId))
    .limit(1);
  const email = row?.email;
  if (!email || !isOperatorEmail(email)) {
    return NextResponse.redirect(new URL("/login?upgrade=skip", req.url));
  }

  const user = await findOrCreateOperatorUser(email);
  await createSession({ userId: user.id, email: user.email });
  return NextResponse.redirect(new URL("/dashboard", req.url));
}
