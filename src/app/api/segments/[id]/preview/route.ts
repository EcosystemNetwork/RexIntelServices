import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, segments } from "@/lib/db";
import { requireOperator } from "@/lib/auth";
import { resolveSegment } from "@/lib/segments";

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
  const ids = await resolveSegment(row.filterJson);
  return NextResponse.json({ count: ids.length });
}
