import { NextRequest, NextResponse } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { db, tags, subscriberTags } from "@/lib/db";

/**
 * GET /api/tags
 * Returns every tag with a denormalized subscriber count. Cheap because
 * the subscriber_tags table is small and indexed.
 */
export async function GET() {
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      description: tags.description,
      kind: tags.kind,
      createdAt: tags.createdAt,
      subscriberCount: sql<number>`count(${subscriberTags.subscriberId})::int`,
    })
    .from(tags)
    .leftJoin(subscriberTags, eq(subscriberTags.tagId, tags.id))
    .groupBy(tags.id)
    .orderBy(asc(tags.name));
  return NextResponse.json({ tags: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = body.name?.toString().trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (name.length > 64) {
    return NextResponse.json({ error: "name too long" }, { status: 400 });
  }

  const kind = body.kind === "persona" ? "persona" : "interest";
  const [row] = await db
    .insert(tags)
    .values({
      name,
      description: body.description?.toString().trim() || null,
      kind,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) {
    return NextResponse.json({ error: "tag already exists" }, { status: 409 });
  }
  return NextResponse.json({ tag: row });
}
