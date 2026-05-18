import { NextResponse } from "next/server";
import { runProgramImageBackfill } from "@/lib/backfill-program-images";

/**
 * GET /api/cron/backfill-program-images
 *
 * Triggered daily by Vercel Cron (see vercel.json). Scans every approved
 * program-lane row (event, hackathon, accelerator, fellowship, grant,
 * capital, residency, perks, popup_city, job) whose payload.imageUrl is
 * empty, scrapes og:image / schema.org image from the row's most-relevant
 * URL, and writes the result back.
 *
 * Auth: Bearer ${CRON_SECRET} — same pattern as harvest-luma.
 *
 * Cap: 80 rows per run. The fetcher uses concurrency=4 with a 6s per-URL
 * timeout, so a full-cap run takes well under 60s. Vercel's hobby tier
 * caps function duration at 60s; pro caps at 300s. 80 keeps us safe under
 * either. The luma + ETHGlobal harvesters write ~10–30 new program rows
 * per day, so an 80-cap nightly run trivially keeps the queue empty.
 *
 * Idempotency: the SQL filter only matches rows with no imageUrl, so
 * re-runs are no-ops for everything that's already covered.
 */
export const maxDuration = 300;

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on server" },
      { status: 500 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await runProgramImageBackfill({
    limit: 80,
    concurrency: 4,
    log: (line) => console.log(`[backfill-program-images] ${line}`),
  });

  console.log(
    `[backfill-program-images] done in ${summary.durationMs}ms — ${summary.scraped} scraped, ${summary.failed} failed, ${summary.skipped} skipped`,
  );

  return NextResponse.json({
    ok: true,
    durationMs: summary.durationMs,
    considered: summary.considered,
    scraped: summary.scraped,
    failed: summary.failed,
    skipped: summary.skipped,
    samples: summary.samples,
  });
}
