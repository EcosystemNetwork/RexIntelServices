import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { harvestOpenSanctions } from "@/lib/harvesters/opensanctions";
import { sendOpsAlert } from "@/lib/email/admin-alert-email";

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
    const message = err instanceof Error ? err.message : String(err);
    console.error("[harvest-ofsi] failed:", err);
    await sendOpsAlert({
      key: "harvest-ofsi:errored",
      subject: "[Ops] UK OFSI harvester failed",
      message: `OFSI (OpenSanctions gb_hmt_sanctions) harvest threw after ${Date.now() - startedAt}ms.\n\n${message}`,
    });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
