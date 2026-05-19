import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { harvestOfac } from "@/lib/harvesters/ofac";
import { sendOpsAlert } from "@/lib/email/admin-alert-email";

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
  const fail = verifyCronSecret(req);
  if (fail) return NextResponse.json(fail.body, { status: fail.status });

  const startedAt = Date.now();
  try {
    const result = await harvestOfac();
    console.log(
      `[harvest-ofac] done in ${Date.now() - startedAt}ms — ${result.rowsWritten} attributions, ${result.addressesTouched} addresses`,
    );
    return NextResponse.json({ ok: true, durationMs: Date.now() - startedAt, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[harvest-ofac] failed:", err);
    await sendOpsAlert({
      key: "harvest-ofac:errored",
      subject: "[Ops] OFAC harvester failed",
      message: `OFAC SDN harvest threw after ${Date.now() - startedAt}ms.\n\n${message}`,
    });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
