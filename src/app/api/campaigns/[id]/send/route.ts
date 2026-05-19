import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db, campaigns } from "@/lib/db";
import { sendCampaign } from "@/lib/email/sender";
import { isSameOrigin } from "@/lib/origin-check";
import { getSession } from "@/lib/auth";

// Fast-path: we send the first few batches inline so the operator sees
// immediate movement (3 batches × 100 recipients × 1.1s gap ≈ 3.5s round-trip).
// The rest of the list streams in via the continue-sending cron, one tick
// per minute, so a 30k campaign drains in ~10 minutes without ever risking a
// serverless timeout.
export const maxDuration = 60;
const FAST_PATH_BATCHES = 3;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Atomic state transition: only flip draft|scheduled → sending if it's
  // still in that state. A concurrent send (double-click, CSRF, duplicate
  // delivery) gets 0 rows back and 409s without ever calling sendCampaign.
  const claimed = await db
    .update(campaigns)
    .set({ status: "sending", updatedAt: new Date() })
    .where(
      and(
        eq(campaigns.id, params.id),
        inArray(campaigns.status, ["draft", "scheduled"] as const),
      ),
    )
    .returning({ id: campaigns.id, status: campaigns.status });

  if (claimed.length === 0) {
    return NextResponse.json(
      { error: "campaign_not_sendable", reason: "must be draft or scheduled" },
      { status: 409 },
    );
  }

  try {
    const result = await sendCampaign(params.id, {
      maxBatches: FAST_PATH_BATCHES,
    });
    return NextResponse.json({
      ok: true,
      ...result,
      message: result.complete
        ? "All recipients sent."
        : `Sent ${result.totalSent}, ${result.remaining} queued — continuing in the background.`,
    });
  } catch (err: unknown) {
    // Leave the row in 'sending' so the continue-sending cron can retry.
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
