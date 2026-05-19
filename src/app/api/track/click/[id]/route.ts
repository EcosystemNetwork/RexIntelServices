import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, sends, campaigns, clickUrls } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const clickUrlId = params.id;
  const sendId = req.nextUrl.searchParams.get("s");

  const [target] = await db
    .select()
    .from(clickUrls)
    .where(eq(clickUrls.id, clickUrlId))
    .limit(1);

  if (!target) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Await the tracking writes before redirecting. Fire-and-forget loses
  // clicks on Vercel cold-start termination; the extra ~50ms latency on
  // a redirect is invisible to the user since the browser is already
  // navigating away.
  try {
    await recordClick(target.id, target.campaignId, sendId);
  } catch (err) {
    console.error("[track click]", err);
  }

  return NextResponse.redirect(target.url, { status: 302 });
}

async function recordClick(
  clickUrlId: string,
  campaignId: string,
  sendId: string | null,
) {
  await db
    .update(clickUrls)
    .set({ clickCount: sql`${clickUrls.clickCount} + 1` })
    .where(eq(clickUrls.id, clickUrlId));

  if (!sendId) return;

  const [send] = await db
    .select()
    .from(sends)
    .where(eq(sends.id, sendId))
    .limit(1);

  if (!send) return;

  const isFirstClick = !send.clickedAt;
  await db
    .update(sends)
    .set({
      status: "clicked",
      clickedAt: send.clickedAt ?? new Date(),
      clickCount: sql`${sends.clickCount} + 1`,
    })
    .where(eq(sends.id, sendId));

  if (isFirstClick) {
    await db
      .update(campaigns)
      .set({ clickedCount: sql`${campaigns.clickedCount} + 1` })
      .where(eq(campaigns.id, campaignId));
  }
}
