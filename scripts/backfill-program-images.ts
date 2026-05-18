/**
 * Run with: npx tsx scripts/backfill-program-images.ts [--dry-run] [--type=<type>]
 *
 * One-shot CLI wrapper around the shared backfill logic in
 * src/lib/backfill-program-images.ts. Walks every approved program-lane
 * row whose payload.imageUrl is empty, fetches the most relevant URL on
 * the payload, and scrapes its og:image.
 *
 * The same logic runs nightly via the cron at /api/cron/backfill-program-images
 * so newly-seeded rows pick up heroes automatically. This script exists
 * for one-time backfills and for runs with verbose progress + dry-run.
 *
 * Flags:
 *   --dry-run      Show what would be updated, write nothing
 *   --type=<t>     Limit to one submission type (e.g. --type=hackathon)
 *   --limit=<n>    Cap the number of rows processed
 *   --concurrency  In-flight fetches at a time (default 4)
 */
import "dotenv/config";
import { and, eq, isNull, or, sql, inArray } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import {
  fetchOgImage,
} from "../src/lib/event-parser";
import {
  PROGRAM_TYPES,
  urlsForPayload,
  runProgramImageBackfill,
  type ProgramType,
} from "../src/lib/backfill-program-images";
import type { SubmissionPayload } from "../src/lib/db/schema";

type SubmissionType =
  | "intel"
  | "event"
  | "job"
  | "grant"
  | "accelerator"
  | "popup_city"
  | "hackathon"
  | "capital"
  | "residency"
  | "perks"
  | "fellowship"
  | "loss_report";

function args() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const typeArg = argv.find((a) => a.startsWith("--type="))?.split("=")[1];
  const limitArg = argv.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const concArg = argv
    .find((a) => a.startsWith("--concurrency="))
    ?.split("=")[1];
  const onlyType =
    typeArg && (PROGRAM_TYPES as readonly string[]).includes(typeArg)
      ? (typeArg as ProgramType)
      : null;
  const limit = limitArg ? parseInt(limitArg, 10) : null;
  const concurrency = concArg ? parseInt(concArg, 10) : 4;
  return { dryRun, onlyType, limit, concurrency };
}

async function main() {
  const { dryRun, onlyType, limit, concurrency } = args();

  if (!dryRun) {
    const summary = await runProgramImageBackfill({
      onlyType,
      limit: limit ?? undefined,
      concurrency,
      log: (line) => console.log(`  ${line}`),
    });
    console.log(
      `\n✓ ${summary.scraped} scraped, ${summary.failed} failed, ${summary.skipped} skipped (no candidate URL). Of ${summary.considered} considered in ${summary.durationMs}ms.`,
    );
    process.exit(0);
  }

  // Dry-run path: replicate the SQL filter inline so we can print what
  // WOULD happen without writing — the shared lib always writes.
  const types: readonly ProgramType[] = onlyType
    ? [onlyType]
    : PROGRAM_TYPES;
  const rows = await db
    .select({
      id: submissions.id,
      publicId: submissions.publicId,
      type: submissions.type,
      payload: submissions.payload,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.status, "approved"),
        inArray(
          submissions.type,
          types as readonly SubmissionType[] as SubmissionType[],
        ),
        or(
          isNull(sql`${submissions.payload}->>'imageUrl'`),
          eq(sql<string>`${submissions.payload}->>'imageUrl'`, ""),
        ),
      ),
    )
    .limit(limit ?? 10_000);

  console.log(
    `\n[DRY RUN] Backfilling og:image for ${rows.length} ${onlyType ?? "program"} row${rows.length === 1 ? "" : "s"} with no imageUrl…\n`,
  );

  let scraped = 0;
  let failed = 0;
  let skipped = 0;
  for (let i = 0; i < rows.length; i += concurrency) {
    const slice = rows.slice(i, i + concurrency);
    await Promise.all(
      slice.map(async (row) => {
        const payload = row.payload as SubmissionPayload;
        const candidates = urlsForPayload(
          row.type as ProgramType,
          payload,
        );
        if (candidates.length === 0) {
          skipped++;
          return;
        }
        let imageUrl: string | null = null;
        let sourceUrl: string | null = null;
        for (const u of candidates) {
          const r = await fetchOgImage(u);
          if (r.ok) {
            imageUrl = r.url;
            sourceUrl = u;
            break;
          }
        }
        if (!imageUrl) {
          failed++;
          console.log(
            `  ✕  no og:image found            ${row.type.padEnd(11)} /intel/${row.publicId}`,
          );
          return;
        }
        scraped++;
        console.log(
          `  ~  would write [${row.type}] ${row.publicId} ← ${imageUrl}  (from ${sourceUrl})`,
        );
      }),
    );
  }
  console.log(
    `\n✓ ${scraped} would-scrape, ${failed} failed, ${skipped} skipped (no candidate URL). Of ${rows.length} considered.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
