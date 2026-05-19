import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { harvestOpenSanctions } from "@/lib/harvesters/opensanctions";
import { sendOpsAlert } from "@/lib/email/admin-alert-email";

/**
 * GET /api/cron/harvest-eu-sanctions
 *
 * Pulls EU Financial Sanctions Files via OpenSanctions (dataset `eu_fsf`).
 * Idempotent.
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
      datasetSlug: "eu_fsf",
      source: "eu-sanctions",
      sourceUrlBuilder: (id) =>
        `https://www.opensanctions.org/entities/${id}/`,
    });
    console.log(
      `[harvest-eu] done in ${Date.now() - startedAt}ms — ${result.rowsWritten} attributions, ${result.addressesTouched} addresses`,
    );
    return NextResponse.json({ ok: true, durationMs: Date.now() - startedAt, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[harvest-eu] failed:", err);
    await sendOpsAlert({
      key: "harvest-eu:errored",
      subject: "[Ops] EU sanctions harvester failed",
      message: `EU sanctions (OpenSanctions eu_fsf) harvest threw after ${Date.now() - startedAt}ms.\n\n${message}`,
    });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
