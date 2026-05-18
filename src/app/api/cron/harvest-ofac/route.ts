import { NextResponse } from "next/server";
import { harvestOfac } from "@/lib/harvesters/ofac";

/**
 * GET /api/cron/harvest-ofac
 *
 * Pulls the US Treasury OFAC SDN list and persists digital-currency
 * sanctions entries as address attributions. Idempotent. Scheduled weekly
 * via vercel.json — see crons section.
 *
 * Auth: Bearer ${CRON_SECRET}.
 */
export const maxDuration = 300;

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const result = await harvestOfac();
    console.log(
      `[harvest-ofac] done in ${Date.now() - startedAt}ms — ${result.rowsWritten} attributions, ${result.addressesTouched} addresses`,
    );
    return NextResponse.json({ ok: true, durationMs: Date.now() - startedAt, ...result });
  } catch (err) {
    console.error("[harvest-ofac] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
