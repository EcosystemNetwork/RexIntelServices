import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, campaigns } from "@/lib/db";

/**
 * POST /api/campaigns/[id]/schedule
 * Body: { scheduledFor: ISO 8601 string }
 *
 * Marks a campaign as "scheduled" and stamps the dispatch time. The cron
 * dispatcher at /api/cron/dispatch-scheduled picks it up at/after that time.
 *
 * To unschedule, send { scheduledFor: null } — campaign returns to "draft".
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const body = (await req.json().catch(() => ({}))) as {
    scheduledFor?: string | null;
  };

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, params.id))
    .limit(1);
  if (!campaign) {
    return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  }
  if (campaign.status === "sent" || campaign.status === "sending") {
    return NextResponse.json(
      { error: `cannot schedule a campaign that is ${campaign.status}` },
      { status: 400 },
    );
  }

  // Unschedule
  if (body.scheduledFor === null || body.scheduledFor === undefined) {
    const [updated] = await db
      .update(campaigns)
      .set({ status: "draft", scheduledFor: null, updatedAt: new Date() })
      .where(eq(campaigns.id, params.id))
      .returning();
    return NextResponse.json({ ok: true, campaign: updated });
  }

  const when = new Date(body.scheduledFor);
  if (Number.isNaN(when.getTime())) {
    return NextResponse.json(
      { error: "scheduledFor must be a valid ISO date string" },
      { status: 400 },
    );
  }
  if (when.getTime() < Date.now() - 60_000) {
    return NextResponse.json(
      { error: "scheduledFor must be in the future" },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(campaigns)
    .set({
      status: "scheduled",
      scheduledFor: when,
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, params.id))
    .returning();

  return NextResponse.json({ ok: true, campaign: updated });
}
