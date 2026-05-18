/**
 * Run with:
 *   npx tsx scripts/harvest-luma.ts            # live run, writes to DB
 *   npx tsx scripts/harvest-luma.ts --dry-run  # parse + score, no DB writes
 *   npx tsx scripts/harvest-luma.ts --only=ethglobal,ef
 *
 * Pulls upcoming events from the curator calendar allowlist in
 * src/lib/luma-harvest.ts, filters to founder-grade only, and inserts
 * survivors as `event` submissions (status=approved for auto-trust
 * calendars, status=pending for moderate-tier discover pages).
 *
 * Idempotent: dedupes against existing submissions by payload.url.
 */
import "dotenv/config";
import { LUMA_CURATOR_CALENDARS, runLumaHarvest } from "../src/lib/luma-harvest";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run") || args.includes("-n");
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const calendars = onlyArg
    ? (() => {
        const slugs = new Set(onlyArg.slice("--only=".length).split(",").map((s) => s.trim()));
        const filtered = LUMA_CURATOR_CALENDARS.filter((c) => slugs.has(c.slug));
        if (filtered.length === 0) {
          console.error(`No calendars matched --only=${[...slugs].join(",")}`);
          process.exit(1);
        }
        return filtered;
      })()
    : LUMA_CURATOR_CALENDARS;

  console.log(
    `Harvesting ${calendars.length} lu.ma calendar${calendars.length === 1 ? "" : "s"}${dryRun ? " (dry-run)" : ""}…\n`,
  );

  const summary = await runLumaHarvest({ calendars, dryRun });

  console.log("");
  console.log(`Calendars: ${summary.calendarsProcessed} ok, ${summary.calendarsFailed} failed`);
  console.log(`Candidates: ${summary.totalCandidates}`);
  console.log(`  already known:  ${summary.alreadyKnown}`);
  console.log(`  rejected:       ${summary.rejected}`);
  console.log(
    `  inserted:       ${summary.inserted.approved} approved, ${summary.inserted.pending} pending`,
  );

  if (summary.errors.length) {
    console.log("\nCalendar errors:");
    for (const e of summary.errors) console.log(`  ${e.slug.padEnd(20)} ${e.error}`);
  }

  if (summary.inserts.length) {
    console.log("\nInserted:");
    for (const ins of summary.inserts) {
      const flag = ins.status === "approved" ? "  ✓ approved" : "  • pending ";
      console.log(`${flag}  [${ins.calendar.padEnd(18)}]  ${ins.name}`);
    }
  }

  if (summary.rejections.length && (dryRun || process.env.HARVEST_VERBOSE)) {
    console.log("\nRejected (sample):");
    for (const r of summary.rejections.slice(0, 20)) {
      console.log(`  ✗ ${r.name}  —  ${r.reason}`);
    }
    if (summary.rejections.length > 20) {
      console.log(`  …and ${summary.rejections.length - 20} more`);
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
