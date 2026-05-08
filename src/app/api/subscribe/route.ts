import { NextRequest, NextResponse } from "next/server";
import { db, subscribers, suppressions } from "@/lib/db";
import { eq } from "drizzle-orm";

/**
 * Public API endpoint for newsletter signups.
 * No authentication required — this is called from the public landing page.
 *
 * POST /api/subscribe
 * Body: { email: string, firstName?: string }
 */
export async function POST(req: NextRequest) {
  let body: { email?: string; firstName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
  }

  // Check suppression list
  const [suppressed] = await db
    .select({ email: suppressions.email })
    .from(suppressions)
    .where(eq(suppressions.email, email))
    .limit(1);

  if (suppressed) {
    // Don't reveal suppression — just say they're already subscribed
    return NextResponse.json({ ok: true, message: "You're already on our list!" });
  }

  // Check if already subscribed
  const [existing] = await db
    .select({ id: subscribers.id, status: subscribers.status })
    .from(subscribers)
    .where(eq(subscribers.email, email))
    .limit(1);

  if (existing) {
    if (existing.status === "active") {
      return NextResponse.json({ ok: true, message: "You're already subscribed!" });
    }
    // Re-activate if they previously unsubscribed
    if (existing.status === "unsubscribed") {
      await db
        .update(subscribers)
        .set({
          status: "active",
          firstName: body.firstName?.trim() || undefined,
          updatedAt: new Date(),
        })
        .where(eq(subscribers.id, existing.id));
      return NextResponse.json({ ok: true, message: "Welcome back! You've been re-subscribed." });
    }
    return NextResponse.json({ ok: true, message: "You're already on our list!" });
  }

  // Create new subscriber
  await db.insert(subscribers).values({
    email,
    firstName: body.firstName?.trim() || null,
    source: "landing_page",
    status: "active",
  });

  return NextResponse.json({ ok: true, message: "You're in! Welcome to RexIntel." });
}
