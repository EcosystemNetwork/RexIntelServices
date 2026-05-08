import { NextResponse } from "next/server";
import { sendCampaign } from "@/lib/email/sender";

// IMPORTANT: For larger lists, this can take longer than serverless timeouts allow.
// Vercel: 60s on Hobby, 300s on Pro. Enough for ~5-15k recipients with batched send.
// For 50k+, run a worker instead (see README -> "Scaling sending").
export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const result = await sendCampaign(params.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
