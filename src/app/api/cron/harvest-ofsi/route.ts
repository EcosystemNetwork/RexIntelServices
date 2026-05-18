import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { harvestOpenSanctions } from "@/lib/harvesters/opensanctions";

/**
 * GET /api/cron/harvest-ofsi
 *
 * Pulls UK OFSI consolidated sanctions list via OpenSanctions (dataset
 * `gb_hmt_sanctions`). Idempotent.
 *
 * Auth: Bearer ${CRON_SECRET}.
 */
export const maxDuration = 300;

export async function GET(req: Request) {
  const fail = verifyCronSecret(req);
  if (fail) return NextResponse.json(fail.body, { status: fail.status });

  const startedAt = Date.now();
  try {
    const result = await harvestOpenSanctions({
      datasetSlug: "gb_hmt_sanctions",
      source: "ofsi",
      sourceUrlBuilder: (id) =>
        `https://www.opensanctions.org/entities/${id}/`,
    });
    console.log(
      `[harvest-ofsi] done in ${Date.now() - startedAt}ms — ${result.rowsWritten} attributions, ${result.addressesTouched} addresses`,
    );
    return NextResponse.json({ ok: true, durationMs: Date.now() - startedAt, ...result });
  } catch (err) {
    console.error("[harvest-ofsi] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
