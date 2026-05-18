import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, suppressions } from "@/lib/db";
import { requireOperator } from "@/lib/auth";

/**
 * DELETE /api/suppressions/[id]
 * Remove from the block list. Use sparingly — re-adding a hard-bounce email
 * to active sending damages sender reputation.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;

  const [row] = await db
    .delete(suppressions)
    .where(eq(suppressions.id, params.id))
    .returning({ id: suppressions.id });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
