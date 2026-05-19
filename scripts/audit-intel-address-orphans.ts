/**
 * READ-ONLY audit: how many approved intel pieces are orphaned from the
 * address graph (zero rows in intel_addresses), and how many would gain
 * rows if we ran autoExtractAndLinkIntelAddresses on their payloads.
 *
 * Run: `npx tsx scripts/audit-intel-address-orphans.ts`
 *
 * No writes. Safe to run anytime.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { IntelPayload } from "@/lib/db/schema";
import { extractAddressesFromIntel } from "@/lib/intel-address-extraction";

async function main() {
  const all = await db
    .select({
      id: submissions.id,
      publicId: submissions.publicId,
      payload: submissions.payload,
      publishedAt: submissions.publishedAt,
      linkCount: sql<number>`(select count(*)::int from intel_addresses where submission_id = ${submissions.id})`,
    })
    .from(submissions)
    .where(
      and(eq(submissions.type, "intel"), eq(submissions.status, "approved")),
    );

  const byKind: Record<string, number> = { incident: 0, original: 0, tip: 0, null: 0 };
  const orphansByKind: Record<string, number> = { incident: 0, original: 0, tip: 0, null: 0 };
  const recoverableByKind: Record<string, number> = { incident: 0, original: 0, tip: 0, null: 0 };
  const orphanRows: Array<{
    publicId: string;
    headline: string;
    kind: string;
    publishedAt: string;
    extractedCount: number;
    extracted: ReturnType<typeof extractAddressesFromIntel>;
  }> = [];

  for (const row of all) {
    const payload = row.payload as IntelPayload;
    const kind = payload.kind ?? "null";
    byKind[kind] = (byKind[kind] ?? 0) + 1;

    if (row.linkCount === 0) {
      orphansByKind[kind] = (orphansByKind[kind] ?? 0) + 1;
      const extracted = extractAddressesFromIntel(payload);
      if (extracted.length > 0) {
        recoverableByKind[kind] = (recoverableByKind[kind] ?? 0) + 1;
      }
      orphanRows.push({
        publicId: row.publicId,
        headline: payload.headline,
        kind,
        publishedAt: row.publishedAt?.toISOString() ?? "—",
        extractedCount: extracted.length,
        extracted,
      });
    }
  }

  console.log("=== APPROVED INTEL — TOTALS BY KIND ===");
  console.log(JSON.stringify(byKind, null, 2));
  console.log("\n=== ORPHANS (zero intel_addresses rows) BY KIND ===");
  console.log(JSON.stringify(orphansByKind, null, 2));
  console.log("\n=== RECOVERABLE ORPHANS (extractor finds ≥1 address) ===");
  console.log(JSON.stringify(recoverableByKind, null, 2));

  const totalOrphans = orphanRows.length;
  const totalRecoverable = orphanRows.filter((r) => r.extractedCount > 0).length;
  console.log(
    `\nSummary: ${all.length} approved intel · ${totalOrphans} orphaned · ${totalRecoverable} recoverable via extractor.`,
  );

  console.log("\n=== ORPHANS (top 30 by extractable count desc) ===");
  const sorted = [...orphanRows].sort(
    (a, b) => b.extractedCount - a.extractedCount,
  );
  for (const r of sorted.slice(0, 30)) {
    console.log(
      `  [${String(r.extractedCount).padStart(2)} would-link] ${r.kind.padEnd(8)} ${r.publishedAt.slice(0, 10)} ${r.publicId}`,
    );
    console.log(`    "${r.headline.slice(0, 90)}"`);
    for (const e of r.extracted.slice(0, 3)) {
      console.log(`    → ${e.chain}:${e.address}`);
    }
    if (r.extracted.length > 3) {
      console.log(`    → … +${r.extracted.length - 3} more`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[audit] fatal:", err);
  process.exit(1);
});
