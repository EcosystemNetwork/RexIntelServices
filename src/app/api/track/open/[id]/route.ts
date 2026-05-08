import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, sends, campaigns } from "@/lib/db";

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const sendId = params.id;

  // Fire-and-forget: don't block the pixel response
  recordOpen(sendId).catch((err) =>
    console.error("[track open]", err),
  );

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": PIXEL.length.toString(),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}

async function recordOpen(sendId: string) {
  const [send] = await db
    .select()
    .from(sends)
    .where(eq(sends.id, sendId))
    .limit(1);

  if (!send) return;

  const isFirstOpen = !send.openedAt;
  await db
    .update(sends)
    .set({
      status: send.status === "delivered" || send.status === "sent" ? "opened" : send.status,
      openedAt: send.openedAt ?? new Date(),
      openCount: sql`${sends.openCount} + 1`,
    })
    .where(eq(sends.id, sendId));

  if (isFirstOpen) {
    await db
      .update(campaigns)
      .set({ openedCount: sql`${campaigns.openedCount} + 1` })
      .where(eq(campaigns.id, send.campaignId));
  }
}
