/**
 * Run with: npx tsx scripts/import-defillama-hacks.ts
 *
 * Bulk-imports the DefiLlama hacks dataset (api.llama.fi/hacks — 523+ entries
 * as of 2026-05) into the address-graph incident catalog. Each DefiLlama entry
 * becomes an intel submission with kind="incident", with body text templated
 * from the structured fields (name, date, amount, chain, classification,
 * technique, returned funds, language).
 *
 * Tradeoffs vs hand-curated entries:
 *   - Pro: 10-100x faster than WebSearch-per-incident verification.
 *   - Pro: covers the long tail of $1M+ DeFi exploits we'd never hand-write.
 *   - Con: no attacker addresses (DefiLlama doesn't include them).
 *   - Con: body text is templated, less narrative depth than hand-written.
 *
 * Curation choices baked in here:
 *   - Threshold: amount >= MIN_AMOUNT_USD ($500k). Below that is mostly
 *     rugpull noise that crowds the lane without adding intelligence value.
 *   - Skip-list: NAMES_HANDLED already exist as substantively-written seeds
 *     and should NOT be duplicated by the template-generated version.
 *   - Severity: amount-banded (critical >= $50M, high >= $5M, medium >= $1M,
 *     low otherwise).
 *
 * Idempotent on payload.headline match — re-running refreshes content
 * but preserves publicId.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { IntelPayload } from "../src/lib/db/schema";
import type { PersonaSlug } from "../src/lib/personas";

const DEFILLAMA_HACKS_URL = "https://api.llama.fi/hacks";
const MIN_AMOUNT_USD = 500_000;

// Default audience for imported incident pieces — same set as
// hand-curated incidents (see seed-intel-incidents.ts).
const IMPORT_DEFAULT_PERSONAS: PersonaSlug[] = [
  "compliance",
  "investigator",
  "exchange-risk",
  "gov-le",
  "fund-risk",
];

// Names that already exist in the hand-curated seeds. We skip these to avoid
// publishing a templated duplicate alongside the rich hand-written version.
// Case-insensitive substring match against the DefiLlama "name" field.
const NAMES_HANDLED = new Set(
  [
    "Bybit",
    "Ronin",
    "Wormhole",
    "Nomad Bridge",
    "Euler Finance",
    "Atomic Wallet",
    "Curve Finance",
    "Multichain",
    "Mixin",
    "Poloniex",
    "Munchables",
    "DMM Bitcoin",
    "WazirX",
    "Radiant Capital",
    "Mt. Gox",
    "Poly Network",
    "FTX",
    "Harmony Horizon",
    "Harmony",
    "BNB Bridge",
    "BSC Token Hub",
    "Beanstalk",
    "BadgerDAO",
    "KuCoin",
    "Mango Markets",
    "CoinEx",
    "Stake.com",
    "Stake",
    "Heco Bridge",
    "HTX",
    "Penpie",
    "Phemex",
    "Bitfinex",
    "Twitter",
    "Wintermute",
    "Orbit Bridge",
    "Orbit Chain",
    "Vulcan Forged",
    "KyberSwap",
    "Pancake Bunny",
    "PancakeBunny",
    "Liquid Global",
    "Liquid",
    "Platypus",
    "Eterbase",
    "CoinsPaid",
    "Alphapo",
    "Lendf",
    "bZx",
    "Cream Finance",
    "C.R.E.A.M.",
    "Cream",
    "Silk Road",
    "Hydra",
    "Garantex",
    "Tornado Cash",
    "Sinbad",
    "PlusToken",
    "Sim Hyon Sop",
    "Chaos",
  ].map((s) => s.toLowerCase()),
);

type LlamaHack = {
  date: number; // unix seconds
  name: string;
  classification: string | null;
  technique: string | null;
  amount: number | null; // USD nominal at time of hack
  chain: string[] | null;
  bridgeHack: boolean | null;
  targetType: string | null;
  source: string | null;
  returnedFunds: number | null;
  defillamaId: number | null;
  parentProtocolId?: string | null;
  language: string | null;
};

function severityForAmount(usd: number): IntelPayload["severity"] {
  if (usd >= 50_000_000) return "critical";
  if (usd >= 5_000_000) return "high";
  if (usd >= 1_000_000) return "medium";
  return "low";
}

function categoryForTarget(target: string | null, classification: string | null): string {
  // Map DefiLlama's target/classification taxonomy into the IntelPayload.category
  // free-text field used by the dashboard filter chips.
  const t = (target ?? "").toLowerCase();
  const c = (classification ?? "").toLowerCase();
  if (c === "rugpull") return "Scam";
  if (t.includes("bridge")) return "Bridge hack";
  if (t.includes("wallet")) return "Wallet compromise";
  if (t.includes("cex") || t.includes("exchange")) return "Exchange hack";
  if (t.includes("gaming")) return "DeFi exploit";
  if (t === "defi protocol" || t.includes("defi")) return "DeFi exploit";
  if (c.includes("infrastructure")) return "Infrastructure breach";
  if (c.includes("ecosystem")) return "Ecosystem compromise";
  return "DeFi exploit";
}

function formatUsd(usd: number): string {
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(2)}B`;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}k`;
  return `$${usd.toFixed(0)}`;
}

function formatMonthYear(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${month} ${d.getUTCFullYear()}`;
}

function buildHeadline(h: LlamaHack, usd: number): string {
  // Format: "{Name} {$amount} {classification} — {Mon YYYY} — {chain(s)}"
  // Suffix with "(via DefiLlama import)" so it's visually distinct from
  // hand-curated headlines and the rare collision is easy to spot.
  const chain = (h.chain ?? []).join(" · ") || "Multi-chain";
  const tech = h.technique || h.classification || "exploit";
  return `${h.name} ${formatUsd(usd)} — ${formatMonthYear(h.date)} — ${tech} on ${chain}`;
}

function buildBody(h: LlamaHack, usd: number): string {
  const lines: string[] = [];
  const date = new Date(h.date * 1000).toISOString().slice(0, 10);
  const chain = (h.chain ?? []).join(", ") || "(chain unspecified)";
  lines.push(
    `On ${date}, ${h.name} lost ${formatUsd(usd)} on ${chain}.`,
  );
  if (h.classification || h.technique || h.targetType) {
    const parts: string[] = [];
    if (h.targetType) parts.push(`target: **${h.targetType}**`);
    if (h.classification) parts.push(`classification: **${h.classification}**`);
    if (h.technique) parts.push(`technique: **${h.technique}**`);
    lines.push("");
    lines.push(parts.join(" · ") + ".");
  }
  if (h.language) {
    lines.push("");
    lines.push(`Contract language: ${h.language}.`);
  }
  if (h.bridgeHack) {
    lines.push("");
    lines.push("Flagged as a **cross-chain bridge** incident by DefiLlama.");
  }
  if (h.returnedFunds && h.returnedFunds > 0) {
    const pct = Math.round((h.returnedFunds / usd) * 100);
    lines.push("");
    lines.push(
      `Funds returned: ${formatUsd(h.returnedFunds)} (~${pct}% of stolen amount).`,
    );
  }
  lines.push("");
  lines.push(
    "_Imported from the DefiLlama hacks dataset. Attacker addresses, root-cause narrative, and forensic links are not included in the DefiLlama feed — this entry is a structured stub. Promote to a full hand-written postmortem (with primary-source citations + Etherscan-tagged addresses) when the case warrants editorial depth._",
  );
  return lines.join("\n");
}

function isNameHandled(name: string): boolean {
  const lc = name.toLowerCase();
  for (const handled of NAMES_HANDLED) {
    if (lc.includes(handled)) return true;
  }
  return false;
}

async function upsert(payload: IntelPayload) {
  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "intel"),
        sql`${submissions.payload}->>'headline' = ${payload.headline}`,
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(submissions)
      .set({
        payload,
        status: "approved",
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, existing[0].id));
    return "updated" as const;
  }
  await db.insert(submissions).values({
    type: "intel",
    status: "approved",
    payload,
    publishedAt: new Date(payload.headline.length > 0 ? Date.now() : Date.now()),
  });
  return "inserted" as const;
}

async function main() {
  console.log(`Fetching ${DEFILLAMA_HACKS_URL} ...`);
  const res = await fetch(DEFILLAMA_HACKS_URL);
  if (!res.ok) {
    throw new Error(`DefiLlama fetch failed: ${res.status} ${res.statusText}`);
  }
  const raw = (await res.json()) as LlamaHack[];
  console.log(`  fetched ${raw.length} entries\n`);

  let inserted = 0;
  let updated = 0;
  let skippedAmount = 0;
  let skippedHandled = 0;

  for (const h of raw) {
    const usd = h.amount ?? 0;
    if (usd < MIN_AMOUNT_USD) {
      skippedAmount++;
      continue;
    }
    if (isNameHandled(h.name)) {
      skippedHandled++;
      continue;
    }

    const headline = buildHeadline(h, usd);
    const body = buildBody(h, usd);
    const sources: string[] = [];
    if (h.defillamaId != null) {
      sources.push(`https://defillama.com/protocol/${h.defillamaId}`);
    }
    // Fallback source — the DefiLlama hacks dashboard itself, always valid.
    sources.push("https://defillama.com/hacks");

    const payload: IntelPayload = {
      headline,
      kind: "incident",
      category: categoryForTarget(h.targetType, h.classification),
      severity: severityForAmount(usd),
      anonymous: true,
      body,
      sources,
      personas: IMPORT_DEFAULT_PERSONAS,
    };

    const action = await upsert(payload);
    if (action === "inserted") inserted++;
    else updated++;
  }

  console.log(`✓ DefiLlama import complete:`);
  console.log(`    inserted:        ${inserted}`);
  console.log(`    updated:         ${updated}`);
  console.log(`    skipped (<$${MIN_AMOUNT_USD.toLocaleString()}):   ${skippedAmount}`);
  console.log(`    skipped (already curated): ${skippedHandled}`);
  console.log(`    total processed: ${raw.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
