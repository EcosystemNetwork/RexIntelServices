import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, campaigns } from "@/lib/db";

export async function GET() {
  const rows = await db
    .select()
    .from(campaigns)
    .orderBy(desc(campaigns.createdAt));
  return NextResponse.json({ campaigns: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const required = ["name", "subject", "fromName", "fromEmail", "htmlBody"];
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json(
        { error: `${field} is required` },
        { status: 400 },
      );
    }
  }

  const [row] = await db
    .insert(campaigns)
    .values({
      name: body.name,
      subject: body.subject,
      fromName: body.fromName,
      fromEmail: body.fromEmail.toLowerCase(),
      replyTo: body.replyTo ?? null,
      previewText: body.previewText ?? null,
      htmlBody: body.htmlBody,
      textBody: body.textBody ?? null,
      targetTagIds: body.targetTagIds ?? [],
      status: "draft",
    })
    .returning();

  return NextResponse.json({ campaign: row });
}
