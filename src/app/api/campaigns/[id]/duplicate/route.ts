import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, campaigns } from "@/lib/db";

/**
 * POST /api/campaigns/[id]/duplicate
 * Clones a campaign (any status) into a fresh "draft" with all counters
 * reset and "(copy)" appended to the internal name.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const [src] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, params.id))
    .limit(1);
  if (!src) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [row] = await db
    .insert(campaigns)
    .values({
      name: `${src.name} (copy)`,
      subject: src.subject,
      fromName: src.fromName,
      fromEmail: src.fromEmail,
      replyTo: src.replyTo,
      previewText: src.previewText,
      htmlBody: src.htmlBody,
      textBody: src.textBody,
      targetTagIds: src.targetTagIds,
      status: "draft",
    })
    .returning();
  return NextResponse.json({ campaign: row });
}
