import { NextRequest, NextResponse } from "next/server";
import { db, subscribers, suppressions } from "@/lib/db";
import { eq } from "drizzle-orm";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * Public API endpoint for newsletter signups.
 * No authentication required — this is called from the public landing page.
 *
 * POST /api/subscribe
 * Body: { email: string, firstName?: string, website?: string (honeypot) }
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  // 5 signups per IP per 10 minutes. Tight enough to deter scripted abuse,
  // loose enough that a household / office NAT'd behind one IP isn't blocked
  // for a real signup or two.
  const limit = rateLimit(`subscribe:${ip}`, 5, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSec) },
      },
    );
  }

  let body: { email?: string; firstName?: string; website?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Honeypot: real users never see/fill the `website` field; bots do. Pretend
  // the request succeeded so we don't tip them off, but skip writing.
  if (body.website && body.website.trim() !== "") {
    return NextResponse.json({ ok: true, message: "You're in! Welcome to Rex Intel Services." });
  }

  const email = body.email?.toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json(
      { error: "Please provide a valid email address." },
      { status: 400 },
    );
  }

  const firstName = body.firstName?.trim().slice(0, 80) || null;

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
          firstName: firstName ?? undefined,
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
    firstName,
    source: "landing_page",
    status: "active",
    ipAddress: ip === "unknown" ? null : ip,
  });

  return NextResponse.json({ ok: true, message: "You're in! Welcome to Rex Intel Services." });
}
