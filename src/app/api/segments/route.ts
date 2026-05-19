import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, segments } from "@/lib/db";
import { requireOperator } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;
  const rows = await db
    .select()
    .from(segments)
    .orderBy(desc(segments.updatedAt));
  return NextResponse.json({ segments: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({}));
  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 },
    );
  }
  const filter = (body.filterJson ?? {}) as Record<string, unknown>;
  const [row] = await db
    .insert(segments)
    .values({
      name: body.name.trim(),
      description: body.description ?? null,
      filterJson: filter,
    })
    .returning();
  return NextResponse.json({ segment: row });
}
