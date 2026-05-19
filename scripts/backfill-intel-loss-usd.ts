/**
 * Backfill `payload.lossUsd` on approved intel rows where it isn't already
 * structured — extracts the dollar figure from the headline (and falls back
 * to the dek/body opening) using the conventions our importers and seeders
 * write: "Bybit $1.4B", "$625M Ronin Bridge hack", "lost $325M on ethereum",
 * etc.
 *
 * Why this exists: the /intel "Hacked crypto tracked" counter used to sum
 * the current on-chain balance at hack-source/destination addresses, which
 * trends toward zero as attackers drain. The accurate "stolen value" total
 * lives in the intel rows themselves but wasn't stored structurally — only
 * baked into the headline string. This script lifts it out into
 * payload.lossUsd so the counter can sum it directly.
 *
 * Run:
 *   npx tsx scripts/backfill-intel-loss-usd.ts --dry-run     # preview
 *   npx tsx scripts/backfill-intel-loss-usd.ts               # write
 *   npx tsx scripts/backfill-intel-loss-usd.ts --repopulate  # rewrite even if set
 *
 * Idempotent on payload.lossUsd presence — skips rows that already have it
 * unless --repopulate is passed.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { IntelPayload } from "../src/lib/db/schema";

type Args = {
  dryRun: boolean;
  repopulate: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  return {
    dryRun: argv.includes("--dry-run"),
    repopulate: argv.includes("--repopulate"),
  };
}

// Match "$1.4B", "$625M", "$72 million", "$3.6 billion", "$500k", "$500,000",
// with optional commas and whitespace tolerance. Returns the captured number
// (with the unit-multiplier applied) or null if no figure is found.
//
// Ordering matters: more-specific patterns first so "$1.4B" doesn't get
// shadowed by the bare-dollar fallback.
const PATTERNS: Array<{ re: RegExp; mult: number }> = [
  { re: /\$\s*([\d.,]+)\s*[bB](?:\b|[^a-zA-Z])/, mult: 1_000_000_000 },
  { re: /\$\s*([\d.,]+)\s*[mM](?:\b|[^a-zA-Z])/, mult: 1_000_000 },
  { re: /\$\s*([\d.,]+)\s*[kK](?:\b|[^a-zA-Z])/, mult: 1_000 },
  { re: /\$\s*([\d.,]+)\s*billion\b/i, mult: 1_000_000_000 },
  { re: /\$\s*([\d.,]+)\s*million\b/i, mult: 1_000_000 },
  { re: /\$\s*([\d.,]+)\s*thousand\b/i, mult: 1_000 },
  // Bare-dollar with thousands separators — "$3,600,000" → 3,600,000.
  // Require a comma so we don't catch "$5" (a flair amount, not a loss).
  { re: /\$\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?)/, mult: 1 },
];

export function extractLossUsd(text: string | undefined | null): number | null {
  if (!text) return null;
  // Prefer the first match in the string — headlines convention puts the
  // loss right next to the protocol name, so the first dollar figure is
  // the loss in virtually every importer-generated row.
  let earliest: { idx: number; value: number } | null = null;
  for (const { re, mult } of PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const raw = m[1].replace(/,/g, "");
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    const value = n * mult;
    const idx = m.index;
    if (!earliest || idx < earliest.idx) {
      earliest = { idx, value };
    }
  }
  return earliest?.value ?? null;
}

async function main() {
  const args = parseArgs();
  console.log(`Backfill mode: ${args.dryRun ? "DRY RUN" : "WRITE"}`);
  console.log(`Repopulate: ${args.repopulate}\n`);

  // Pull every approved intel row. We filter to kind=incident in JS rather
  // than SQL so we can also report on non-incident hits (useful telemetry —
  // a tip with a dollar figure attached is worth flagging, even if we don't
  // backfill it).
  const rows = await db
    .select({
      id: submissions.id,
      publicId: submissions.publicId,
      payload: submissions.payload,
    })
    .from(submissions)
    .where(
      and(eq(submissions.type, "intel"), eq(submissions.status, "approved")),
    );

  console.log(`Scanning ${rows.length} approved intel rows...\n`);

  let scanned = 0;
  let alreadySet = 0;
  let extracted = 0;
  let noMatch = 0;
  let writes = 0;

  for (const row of rows) {
    scanned++;
    const payload = row.payload as IntelPayload;
    if (payload.kind !== "incident") continue;

    const hasExisting = typeof payload.lossUsd === "number" && payload.lossUsd > 0;
    if (hasExisting && !args.repopulate) {
      alreadySet++;
      continue;
    }

    // Headline-only extraction. The REKT importer, DefiLlama importer, and
    // every curated incident-seed put the loss figure directly into the
    // headline ("$625M Ronin Bridge hack", "Bybit $1.4B hack", "Name —
    // $X.XM — Date"). Falling through to `dek` or `body` produces false
    // positives — e.g., Garantex's headline doesn't name a loss because
    // it's a sanctions story, and the dek's "$100B lifetime volume"
    // figure would be incorrectly captured as a hack loss.
    const guess = extractLossUsd(payload.headline);

    if (guess == null) {
      noMatch++;
      // In --repopulate mode, clear stale lossUsd values that were written
      // by the old loose-match version of this script. Skip on the
      // first pass (when hasExisting is false) — nothing to clear.
      if (args.repopulate && hasExisting && !args.dryRun) {
        const updatedPayload: IntelPayload = { ...payload };
        delete updatedPayload.lossUsd;
        await db
          .update(submissions)
          .set({ payload: updatedPayload, updatedAt: new Date() })
          .where(eq(submissions.id, row.id));
        writes++;
        console.log(`  ↩ cleared    ← ${payload.headline.slice(0, 80)}`);
      } else if (scanned < 200) {
        console.log(`  ✗ no match: ${payload.headline.slice(0, 80)}`);
      }
      continue;
    }

    extracted++;
    console.log(
      `  ✓ ${formatUsd(guess).padEnd(8)} ← ${payload.headline.slice(0, 80)}`,
    );

    if (!args.dryRun) {
      const updatedPayload: IntelPayload = { ...payload, lossUsd: guess };
      await db
        .update(submissions)
        .set({ payload: updatedPayload, updatedAt: new Date() })
        .where(eq(submissions.id, row.id));
      writes++;
    }
  }

  console.log(`\nSummary:`);
  console.log(`  scanned:        ${scanned}`);
  console.log(`  already set:    ${alreadySet}`);
  console.log(`  extracted:      ${extracted}`);
  console.log(`  no match:       ${noMatch}`);
  console.log(`  writes:         ${args.dryRun ? `(dry run — would have written ${extracted})` : writes}`);
  process.exit(0);
}

function formatUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
