/**
 * Sweep every approved intel row whose body is below the article floor and
 * run it through Gemini Pro to produce a publishable ~200-word body. The
 * hero image fallback handles itself via /intel/[publicId]/hero.svg — this
 * script only touches the text.
 *
 * Run:
 *   npx tsx scripts/backfill-thin-intel.ts --dry-run          # just count
 *   npx tsx scripts/backfill-thin-intel.ts                    # rewrite all
 *   npx tsx scripts/backfill-thin-intel.ts --limit 10         # cap calls
 *   npx tsx scripts/backfill-thin-intel.ts --harvester rekt   # source filter
 *
 * Why a script and not a cron: the call is expensive (Gemini Pro, ~200
 * tokens out) and the corpus is finite. Operator runs this once to clear
 * the backlog; importers handle new rows going forward. Idempotent —
 * already-long rows skip past the floor check inside enrichIntelArticle.
 */
import "dotenv/config";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { IntelPayload } from "../src/lib/db/schema";
import {
  enrichIntelArticle,
  MIN_ARTICLE_BODY_CHARS,
} from "../src/lib/intel-article-enrichment";

type Args = {
  dryRun: boolean;
  limit: number | null;
  harvester: string | null;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const idxLimit = argv.findIndex((a) => a === "--limit");
  const limit =
    idxLimit >= 0 && argv[idxLimit + 1]
      ? Math.max(1, Number(argv[idxLimit + 1]))
      : null;
  const idxHarv = argv.findIndex((a) => a === "--harvester");
  const harvester =
    idxHarv >= 0 && argv[idxHarv + 1] ? argv[idxHarv + 1] : null;
  return { dryRun, limit, harvester };
}

async function main() {
  const args = parseArgs();
  if (!process.env.GEMINI_API_KEY && !args.dryRun) {
    console.error(
      "GEMINI_API_KEY is not set. Either export it or run with --dry-run.",
    );
    process.exit(1);
  }

  const rows = await db
    .select({
      id: submissions.id,
      publicId: submissions.publicId,
      payload: submissions.payload,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "intel"),
        eq(submissions.status, "approved"),
        sql`length(coalesce(${submissions.payload}->>'body', '')) < ${MIN_ARTICLE_BODY_CHARS}`,
      ),
    )
    .orderBy(asc(submissions.createdAt));

  const candidates = rows.filter((r) => {
    if (!args.harvester) return true;
    const p = r.payload as IntelPayload;
    return p.sourceHarvester === args.harvester;
  });

  console.log(
    `Found ${candidates.length} thin row(s) below ${MIN_ARTICLE_BODY_CHARS} chars` +
      (args.harvester ? ` (harvester=${args.harvester})` : "") +
      (args.limit ? `, processing up to ${args.limit}` : ""),
  );

  let expanded = 0;
  let skipped = 0;
  let errored = 0;

  const slice = args.limit ? candidates.slice(0, args.limit) : candidates;
  for (const row of slice) {
    const payload = row.payload as IntelPayload;
    const beforeLen = (payload.body ?? "").length;
    process.stdout.write(
      `  · ${row.publicId} (${beforeLen} chars) "${payload.headline.slice(0, 60)}…" `,
    );

    if (args.dryRun) {
      console.log("[dry-run]");
      continue;
    }

    try {
      const result = await enrichIntelArticle(payload);
      if (!result.expanded) {
        console.log(`[skip ${result.reason}]`);
        skipped++;
        continue;
      }
      await db
        .update(submissions)
        .set({ payload: result.payload, updatedAt: new Date() })
        .where(eq(submissions.id, row.id));
      console.log(`[expanded → ${result.payload.body.length} chars]`);
      expanded++;
    } catch (err) {
      console.log(
        `[error ${err instanceof Error ? err.message : String(err)}]`,
      );
      errored++;
    }
  }

  console.log(
    `\nDone: expanded=${expanded} skipped=${skipped} errored=${errored} dryRun=${args.dryRun}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
