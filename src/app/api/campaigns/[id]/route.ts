import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, campaigns } from "@/lib/db";
import { requireOperator } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;

  const [row] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, params.id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ campaign: row });
}

/**
 * PATCH /api/campaigns/[id]
 * Editing only allowed while the campaign is in draft or scheduled state.
 * (A scheduled edit silently keeps its scheduledFor timestamp.)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));

  const [existing] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, params.id))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (existing.status === "sent" || existing.status === "sending") {
    return NextResponse.json(
      { error: `cannot edit a ${existing.status} campaign` },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = { updatedAt: new Date() };
  const fields = [
    "name",
    "subject",
    "fromName",
    "fromEmail",
    "replyTo",
    "previewText",
    "htmlBody",
    "textBody",
    "subjectB",
    "abSampleSize",
    "abWinnerMetric",
  ] as const;
  for (const f of fields) {
    if (body[f] !== undefined) {
      update[f] = f === "fromEmail" ? String(body[f]).toLowerCase() : body[f];
    }
  }
  if (Array.isArray(body.targetTagIds)) {
    update.targetTagIds = body.targetTagIds;
  }
  if (body.bodyDoc !== undefined) {
    // null clears the round-trip JSON; an object stores it.
    update.bodyDoc = body.bodyDoc;
  }
  if (body.segmentId !== undefined) {
    update.segmentId = body.segmentId || null;
  }

  const [row] = await db
    .update(campaigns)
    .set(update)
    .where(eq(campaigns.id, params.id))
    .returning();
  return NextResponse.json({ campaign: row });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;

  const [existing] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, params.id))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (existing.status === "sent" || existing.status === "sending") {
    return NextResponse.json(
      { error: `cannot delete a ${existing.status} campaign` },
      { status: 400 },
    );
  }
  await db.delete(campaigns).where(eq(campaigns.id, params.id));
  return NextResponse.json({ ok: true });
}
