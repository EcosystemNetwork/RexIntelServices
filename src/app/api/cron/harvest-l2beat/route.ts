import { NextResponse } from "next/server";
import { harvestL2Beat } from "@/lib/harvesters/l2beat";

/**
 * GET /api/cron/harvest-l2beat
 *
 * Pulls L2Beat project metadata and persists L1 bridge/escrow addresses
 * as bridge-category attributions. Idempotent.
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
    const result = await harvestL2Beat();
    console.log(
      `[harvest-l2beat] done in ${Date.now() - startedAt}ms — ${result.rowsWritten} attributions, ${result.addressesTouched} addresses`,
    );
    return NextResponse.json({ ok: true, durationMs: Date.now() - startedAt, ...result });
  } catch (err) {
    console.error("[harvest-l2beat] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
