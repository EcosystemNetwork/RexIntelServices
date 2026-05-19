import { NextRequest, NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { db, campaigns } from "@/lib/db";
import { requireOperator } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;

  // Pagination: cap each page at 100 and require explicit offset for older
  // pages. Without this, the dashboard query selects every campaign ever
  // and serializes ~200KB of HTML per row — the admin list grinds as the
  // campaign archive grows.
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, parseInt(sp.get("offset") ?? "0", 10) || 0);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(campaigns)
      .orderBy(desc(campaigns.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(campaigns),
  ]);
  return NextResponse.json({ campaigns: rows, total, limit, offset });
}

export async function POST(req: NextRequest) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;

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
      bodyDoc: body.bodyDoc ?? null,
      textBody: body.textBody ?? null,
      targetTagIds: body.targetTagIds ?? [],
      segmentId: body.segmentId ?? null,
      subjectB: body.subjectB ?? null,
      abSampleSize: body.abSampleSize ?? null,
      abWinnerMetric: body.abWinnerMetric ?? null,
      status: "draft",
    })
    .returning();

  return NextResponse.json({ campaign: row });
}
