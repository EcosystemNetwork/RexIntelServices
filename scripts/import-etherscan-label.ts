/**
 * Bulk-import a batch of Etherscan-labeled addresses as `rexintel-curated`
 * attributions.
 *
 * Why this exists: Etherscan's labelcloud sits behind Cloudflare + a logged-in
 * Pro session, so a fully automated scraper isn't practical. The next-best
 * leverage is a fast manual flow:
 *
 *   1. Open the Etherscan label page in your browser (you're logged in, you
 *      can see all the addresses).
 *   2. Copy the address column.
 *   3. Paste into a JSON file under `data/etherscan-labels/<slug>.json`.
 *   4. `npx tsx scripts/import-etherscan-label.ts data/etherscan-labels/<slug>.json`
 *
 * That replaces ~20 minutes of hand-edited TypeScript per cluster with ~30
 * seconds. The JSON files are committed alongside code so the import history
 * is auditable.
 *
 * JSON schema (validated at runtime):
 *
 *   {
 *     "label": "Pink Drainer",                  // human-readable cluster name
 *     "ownerName": "Pink Drainer",              // attribution.ownerName
 *     "ownerKind": "criminal-group",            // schema enum
 *     "category": "scam",                       // schema enum
 *     "chain": "ethereum",                      // optional, default "ethereum"
 *     "confidence": 95,                         // optional, default 95
 *     "notes": "...",                           // optional, applies to every entry
 *     "sourceRefPrefix": "etherscan-pink-drainer", // optional, default = slugified label
 *     "sourceUrlTemplate": "https://etherscan.io/address/{address}", // optional
 *     "addresses": [
 *       "0x63605E53D422C4F1ac0e01390AC59aAf84C44A51",
 *       { "address": "0xa5e4...", "subLabel": "0xa5e4", "notes": "secondary" }
 *     ]
 *   }
 *
 * Addresses may be plain hex strings or objects with optional per-entry
 * `subLabel` (appended to the cluster label) and `notes` (overrides the
 * cluster-level note).
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  upsertAttributionsBatch,
  type AttributionClaim,
} from "../src/lib/address-attribution";
import {
  addressCategoryEnum,
  addressOwnerKindEnum,
} from "../src/lib/db/schema";

type AddressEntry =
  | string
  | { address: string; subLabel?: string; notes?: string };

type LabelFile = {
  label: string;
  ownerName: string;
  ownerKind: string;
  category: string;
  chain?: string;
  confidence?: number;
  notes?: string;
  sourceRefPrefix?: string;
  sourceUrlTemplate?: string;
  addresses: AddressEntry[];
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseLabelFile(filePath: string): LabelFile {
  const raw = readFileSync(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Invalid JSON in ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Expected JSON object at top level of ${filePath}`);
  }
  const obj = parsed as Record<string, unknown>;

  const requiredString = (key: string) => {
    const v = obj[key];
    if (typeof v !== "string" || v.trim() === "") {
      throw new Error(`${filePath}: "${key}" must be a non-empty string`);
    }
    return v.trim();
  };

  const label = requiredString("label");
  const ownerName = requiredString("ownerName");
  const ownerKind = requiredString("ownerKind");
  const category = requiredString("category");

  if (!addressOwnerKindEnum.enumValues.includes(ownerKind as never)) {
    throw new Error(
      `${filePath}: ownerKind "${ownerKind}" not in schema enum (${addressOwnerKindEnum.enumValues.join(", ")})`,
    );
  }
  if (!addressCategoryEnum.enumValues.includes(category as never)) {
    throw new Error(
      `${filePath}: category "${category}" not in schema enum`,
    );
  }

  if (!Array.isArray(obj.addresses) || obj.addresses.length === 0) {
    throw new Error(`${filePath}: "addresses" must be a non-empty array`);
  }

  return {
    label,
    ownerName,
    ownerKind,
    category,
    chain: typeof obj.chain === "string" ? obj.chain : "ethereum",
    confidence:
      typeof obj.confidence === "number" ? obj.confidence : 95,
    notes: typeof obj.notes === "string" ? obj.notes : undefined,
    sourceRefPrefix:
      typeof obj.sourceRefPrefix === "string"
        ? obj.sourceRefPrefix
        : `etherscan-${slugify(label)}`,
    sourceUrlTemplate:
      typeof obj.sourceUrlTemplate === "string"
        ? obj.sourceUrlTemplate
        : "https://etherscan.io/address/{address}",
    addresses: obj.addresses as AddressEntry[],
  };
}

function buildClaims(spec: LabelFile): AttributionClaim[] {
  const now = new Date();
  const claims: AttributionClaim[] = [];
  const seen = new Set<string>();

  for (const entry of spec.addresses) {
    const raw = typeof entry === "string" ? entry : entry.address;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const address =
      spec.chain === "ethereum" ? trimmed.toLowerCase() : trimmed;

    if (seen.has(address)) continue;
    seen.add(address);

    const subLabel = typeof entry === "object" ? entry.subLabel : undefined;
    const perEntryNotes =
      typeof entry === "object" ? entry.notes : undefined;
    const shortAddress = address.slice(0, 8);
    const sourceRef = subLabel
      ? `${spec.sourceRefPrefix}-${slugify(subLabel)}`
      : `${spec.sourceRefPrefix}-${shortAddress}`;

    claims.push({
      chain: spec.chain ?? "ethereum",
      address,
      source: "rexintel-curated",
      sourceRef,
      sourceUrl: spec.sourceUrlTemplate?.replace("{address}", address) ?? null,
      category: spec.category as AttributionClaim["category"],
      ownerName: spec.ownerName,
      ownerKind: spec.ownerKind as AttributionClaim["ownerKind"],
      label: subLabel ? `${spec.label}: ${subLabel}` : spec.label,
      notes: perEntryNotes ?? spec.notes ?? null,
      confidence: spec.confidence ?? 95,
      reportedAt: now,
    });
  }

  return claims;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error(
      "Usage: tsx scripts/import-etherscan-label.ts <path-to-label.json> [--dry-run]",
    );
    process.exit(1);
  }
  const resolved = path.resolve(file);
  const spec = parseLabelFile(resolved);
  const claims = buildClaims(spec);

  console.log(
    `[import-etherscan-label] ${spec.label}: ${claims.length} unique addresses on ${spec.chain}${dryRun ? " (DRY RUN)" : ""}…`,
  );

  if (dryRun) {
    for (const c of claims.slice(0, 5)) {
      console.log(`  - ${c.sourceRef} → ${c.address} (${c.label})`);
    }
    if (claims.length > 5) console.log(`  … +${claims.length - 5} more`);
    console.log(`[import-etherscan-label] dry-run complete, no writes.`);
    return;
  }

  const { addressIds, rows } = await upsertAttributionsBatch(claims);
  console.log(
    `[import-etherscan-label] done. addresses touched=${addressIds.length}, attribution rows=${rows}`,
  );
}

main().catch((err) => {
  console.error("[import-etherscan-label] failed:", err);
  process.exit(1);
});
