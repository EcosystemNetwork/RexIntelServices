import { NextRequest, NextResponse } from "next/server";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, subscribers } from "@/lib/db";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const status = sp.get("status");
  const limit = Math.min(parseInt(sp.get("limit") ?? "50"), 200);
  const offset = parseInt(sp.get("offset") ?? "0");

  const conditions = [];
  if (q) {
    conditions.push(
      or(
        ilike(subscribers.email, `%${q}%`),
        ilike(subscribers.firstName, `%${q}%`),
        ilike(subscribers.lastName, `%${q}%`),
      ),
    );
  }
  if (status) {
    conditions.push(eq(subscribers.status, status as never));
  }

  const where = conditions.length
    ? conditions.reduce((a, b) => sql`${a} AND ${b}`)
    : sql`true`;

  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(subscribers)
      .where(where)
      .orderBy(desc(subscribers.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscribers)
      .where(where),
  ]);

  return NextResponse.json({ subscribers: rows, total: count });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const email = body.email?.toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }

  const [row] = await db
    .insert(subscribers)
    .values({
      email,
      firstName: body.firstName ?? null,
      lastName: body.lastName ?? null,
      source: body.source ?? "manual",
      status: "active",
    })
    .onConflictDoNothing()
    .returning();

  if (!row) {
    return NextResponse.json(
      { error: "already exists" },
      { status: 409 },
    );
  }

  return NextResponse.json({ subscriber: row });
}
