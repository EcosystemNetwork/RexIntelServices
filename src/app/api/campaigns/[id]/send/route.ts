import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db, campaigns } from "@/lib/db";
import { sendCampaign } from "@/lib/email/sender";
import { isSameOrigin } from "@/lib/origin-check";
import { getSession } from "@/lib/auth";

// IMPORTANT: For larger lists, this can take longer than serverless timeouts allow.
// Vercel: 60s on Hobby, 300s on Pro. Enough for ~5-15k recipients with batched send.
// For 50k+, run a worker instead (see README -> "Scaling sending").
export const maxDuration = 300;

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
  // Without this, two clicks two seconds apart blast the entire list twice
  // — an irrecoverable list-reputation burn.
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
    const result = await sendCampaign(params.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    // Rollback the state-machine on send failure so an operator can retry.
    // Worst case the send was partially delivered before crashing — surface
    // the error, leave the row in 'sending' for the admin to inspect.
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
