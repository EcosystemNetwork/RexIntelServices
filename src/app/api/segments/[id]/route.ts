import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, segments } from "@/lib/db";
import { requireOperator } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;
  const [row] = await db
    .select()
    .from(segments)
    .where(eq(segments.id, params.id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ segment: row });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === "string") update.name = body.name.trim();
  if (body.description !== undefined) update.description = body.description;
  if (body.filterJson !== undefined) update.filterJson = body.filterJson;
  const [row] = await db
    .update(segments)
    .set(update)
    .where(eq(segments.id, params.id))
    .returning();
  return NextResponse.json({ segment: row });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;
  await db.delete(segments).where(eq(segments.id, params.id));
  return NextResponse.json({ ok: true });
}
