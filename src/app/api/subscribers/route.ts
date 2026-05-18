import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, subscribers, subscriberTags, tags } from "@/lib/db";
import { requireOperator } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const status = sp.get("status");
  const persona = sp.get("persona")?.trim();
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
  if (persona) {
    // Filter by persona-kind tag slug. Subselect keeps the join out of the
    // main query so pagination counts stay accurate.
    conditions.push(
      sql`${subscribers.id} IN (
        SELECT ${subscriberTags.subscriberId}
        FROM ${subscriberTags}
        INNER JOIN ${tags} ON ${tags.id} = ${subscriberTags.tagId}
        WHERE ${tags.kind} = 'persona' AND ${tags.name} = ${persona}
      )`,
    );
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

  // Bulk-load persona slugs for the visible page so the admin list can show
  // a "Class" column without N+1 queries.
  const ids = rows.map((r) => r.id);
  const personaRows = ids.length
    ? await db
        .select({
          subscriberId: subscriberTags.subscriberId,
          slug: tags.name,
        })
        .from(subscriberTags)
        .innerJoin(tags, eq(tags.id, subscriberTags.tagId))
        .where(
          and(
            eq(tags.kind, "persona"),
            inArray(subscriberTags.subscriberId, ids),
          ),
        )
    : [];
  const personaBySub = new Map<string, string>();
  for (const r of personaRows) personaBySub.set(r.subscriberId, r.slug);

  const enriched = rows.map((r) => ({
    ...r,
    persona: personaBySub.get(r.id) ?? null,
  }));

  return NextResponse.json({ subscribers: enriched, total: count });
}

export async function POST(req: NextRequest) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;

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
