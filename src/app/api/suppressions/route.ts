import { NextRequest, NextResponse } from "next/server";
import { desc, ilike, sql } from "drizzle-orm";
import { db, suppressions } from "@/lib/db";

const VALID_REASONS = [
  "hard_bounce",
  "complaint",
  "manual",
  "unsubscribe_global",
] as const;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * GET /api/suppressions?q=foo&limit=200
 * The block list — once an email is here, no campaign will send to it,
 * imports will skip it, and webhooks add to it on hard bounce / complaint.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const limit = Math.min(parseInt(sp.get("limit") ?? "200"), 1000);

  const where = q ? ilike(suppressions.email, `%${q}%`) : sql`true`;

  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(suppressions)
      .where(where)
      .orderBy(desc(suppressions.createdAt))
      .limit(limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(suppressions)
      .where(where),
  ]);

  return NextResponse.json({ suppressions: rows, total: count });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = body.email?.toString().toLowerCase().trim();
  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }
  const reason: (typeof VALID_REASONS)[number] = VALID_REASONS.includes(
    body.reason,
  )
    ? body.reason
    : "manual";

  const [row] = await db
    .insert(suppressions)
    .values({
      email,
      reason,
      notes: body.notes?.toString().slice(0, 500) || null,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) {
    return NextResponse.json(
      { error: "already suppressed" },
      { status: 409 },
    );
  }
  return NextResponse.json({ suppression: row });
}
