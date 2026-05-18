import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, tags } from "@/lib/db";
import { requireOperator } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = body.name.toString().trim();
    if (!name || name.length > 64) {
      return NextResponse.json({ error: "invalid name" }, { status: 400 });
    }
    update.name = name;
  }
  if (body.description !== undefined) {
    update.description = body.description?.toString().trim() || null;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const [row] = await db
    .update(tags)
    .set(update)
    .where(eq(tags.id, params.id))
    .returning();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ tag: row });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;

  // ON DELETE CASCADE on subscriber_tags will drop assignments automatically.
  const [row] = await db
    .delete(tags)
    .where(eq(tags.id, params.id))
    .returning({ id: tags.id });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
