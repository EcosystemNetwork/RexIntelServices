/**
 * Run with: npx tsx scripts/import-rekt-leaderboard.ts
 *
 * Bulk-imports the REKT.news leaderboard (295+ DeFi/CeFi rekts as of 2026-05)
 * into RexIntel's incident catalog. REKT data is embedded in the leaderboard
 * page's __NEXT_DATA__ script tag — we fetch the HTML, extract the JSON,
 * transform each entry into an IntelPayload, and upsert.
 *
 * Why both DefiLlama + REKT: DefiLlama is broader (523 entries, structured
 * fields) but has no narrative. REKT is narrower (295 entries, curated) but
 * each entry has a real excerpt + tags + slug → article URL. The two sources
 * overlap on the famous incidents (Ronin, Bybit, Wormhole etc.) but each
 * also has long-tail entries the other misses. Running both maximizes
 * coverage.
 *
 * Curation: amount >= MIN_AMOUNT_USD ($500k). Skip-list matches against
 * NAMES_HANDLED (substantively hand-written entries already in seed-intel-
 * incidents.ts) so the imports don't duplicate richer manual content.
 *
 * Idempotent on payload.headline match.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { IntelPayload } from "../src/lib/db/schema";
import type { PersonaSlug } from "../src/lib/personas";

const REKT_URL = "https://rekt.news/leaderboard";
const MIN_AMOUNT_USD = 500_000;

const IMPORT_DEFAULT_PERSONAS: PersonaSlug[] = [
  "compliance",
  "investigator",
  "exchange-risk",
  "gov-le",
  "fund-risk",
];

// Same skip-list as the DefiLlama importer — see scripts/import-defillama-hacks.ts
// for the rationale. Case-insensitive substring against REKT's `title` field
// (typically "{Name} - REKT" or "{Name} - Rekt").
const NAMES_HANDLED = new Set(
  [
    "Bybit",
    "Ronin",
    "Wormhole",
    "Nomad",
    "Euler",
    "Atomic Wallet",
    "Curve",
    "Multichain",
    "Mixin",
    "Poloniex",
    "Munchables",
    "DMM",
    "WazirX",
    "Radiant",
    "Mt. Gox",
    "Mt Gox",
    "Poly Network",
    "FTX",
    "Harmony",
    "BNB Bridge",
    "BSC Token Hub",
    "Beanstalk",
    "Badger",
    "KuCoin",
    "Mango",
    "CoinEx",
    "Stake",
    "Heco",
    "HTX",
    "Penpie",
    "Phemex",
    "Bitfinex",
    "Twitter",
    "Wintermute",
    "Orbit Bridge",
    "Orbit Chain",
    "Vulcan Forged",
    "Kyber",
    "Pancake Bunny",
    "PancakeBunny",
    "Liquid",
    "Platypus",
    "Eterbase",
    "CoinsPaid",
    "Alphapo",
    "Lendf",
    "bZx",
    "Cream",
    "Silk Road",
    "Hydra",
    "Garantex",
    "Tornado",
    "Sinbad",
    "PlusToken",
    "Chaos",
  ].map((s) => s.toLowerCase()),
);

type RektEntry = {
  date: string; // article publish date "M/D/YYYY"
  featured: boolean;
  title: string; // "{Name} - REKT" usually
  rekt: {
    amount: number | null;
    audit?: string | null;
    date?: string | null; // incident date "M/D/YYYY"
  };
  tags?: string[];
  excerpt?: string;
  banner?: string;
  slug?: string;
};

function severityForAmount(usd: number): IntelPayload["severity"] {
  if (usd >= 50_000_000) return "critical";
  if (usd >= 5_000_000) return "high";
  if (usd >= 1_000_000) return "medium";
  return "low";
}

function formatUsd(usd: number): string {
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(2)}B`;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}k`;
  return `$${usd.toFixed(0)}`;
}

/** Parse "M/D/YYYY" → Date (UTC midnight). Returns null on bad input. */
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (isNaN(d.getTime())) return null;
  return d;
}

function formatMonthYear(d: Date | null): string {
  if (!d) return "(date unknown)";
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${month} ${d.getUTCFullYear()}`;
}

/** Strip REKT's trailing " - REKT" / " - Rekt" so the title reads cleanly. */
function cleanTitle(raw: string): string {
  return raw.replace(/\s*[-—–]\s*REKT\s*$/i, "").trim();
}

function categoryForTags(tags: string[] | undefined): string {
  const ts = (tags ?? []).map((t) => t.toLowerCase());
  if (ts.some((t) => t.includes("bridge"))) return "Bridge hack";
  if (ts.some((t) => t.includes("rugpull") || t.includes("rug"))) return "Scam";
  if (ts.some((t) => t.includes("wallet") || t.includes("phish")))
    return "Wallet compromise";
  if (
    ts.some(
      (t) =>
        t.includes("exchange") || t.includes("cex") || t.includes("centralized"),
    )
  )
    return "Exchange hack";
  if (ts.some((t) => t.includes("infrastructure"))) return "Infrastructure breach";
  return "DeFi exploit";
}

function buildHeadline(e: RektEntry, usd: number): string {
  const name = cleanTitle(e.title);
  const incident = parseDate(e.rekt.date) ?? parseDate(e.date);
  return `${name} — ${formatUsd(usd)} — ${formatMonthYear(incident)} (REKT)`;
}

function buildBody(e: RektEntry, usd: number): string {
  const lines: string[] = [];
  const incident = parseDate(e.rekt.date);
  const dateStr = incident ? incident.toISOString().slice(0, 10) : "(date unknown)";
  const name = cleanTitle(e.title);

  lines.push(`On ${dateStr}, **${name}** lost ${formatUsd(usd)}.`);
  lines.push("");
  if (e.excerpt && e.excerpt.trim().length > 0) {
    lines.push(e.excerpt.trim());
  } else {
    lines.push("(no excerpt published on REKT.news for this entry)");
  }

  if (e.tags && e.tags.length > 0) {
    lines.push("");
    lines.push(`**Tags:** ${e.tags.join(", ")}.`);
  }

  if (e.rekt.audit && e.rekt.audit !== "N/A") {
    lines.push("");
    lines.push(`**Pre-incident audit:** ${e.rekt.audit}.`);
  }

  lines.push("");
  lines.push(
    "_Imported from the REKT.news leaderboard. Read the full investigative writeup at the linked source — narrative, attacker addresses, and contract analysis live there. Promote to a hand-curated RexIntel postmortem (with our own primary-source citations + linked address-graph nodes) when the case warrants editorial depth._",
  );
  return lines.join("\n");
}

function isNameHandled(title: string): boolean {
  const lc = cleanTitle(title).toLowerCase();
  for (const handled of NAMES_HANDLED) {
    if (lc.includes(handled)) return true;
  }
  return false;
}

async function upsert(payload: IntelPayload, publishedAt: Date) {
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
        publishedAt,
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, existing[0].id));
    return "updated" as const;
  }
  await db.insert(submissions).values({
    type: "intel",
    status: "approved",
    payload,
    publishedAt,
  });
  return "inserted" as const;
}

async function fetchRektLeaderboard(): Promise<RektEntry[]> {
  const res = await fetch(REKT_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; RexIntel-importer/1.0; +https://rexintel.com)",
    },
  });
  if (!res.ok) {
    throw new Error(`REKT fetch failed: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();

  // REKT embeds the leaderboard data as Next.js __NEXT_DATA__. Match the
  // raw <script id="__NEXT_DATA__" type="application/json">...</script>,
  // tolerating arbitrary attribute ordering and whitespace.
  const m = html.match(/__NEXT_DATA__[^>]*>([\s\S]+?)<\/script>/);
  if (!m) {
    throw new Error("REKT __NEXT_DATA__ script tag not found");
  }
  const json = JSON.parse(m[1]) as {
    props?: { pageProps?: { leaderboard?: RektEntry[] } };
  };
  const lb = json.props?.pageProps?.leaderboard;
  if (!Array.isArray(lb)) {
    throw new Error("REKT leaderboard array missing from __NEXT_DATA__");
  }
  return lb;
}

async function main() {
  console.log(`Fetching ${REKT_URL} ...`);
  const entries = await fetchRektLeaderboard();
  console.log(`  fetched ${entries.length} entries\n`);

  let inserted = 0;
  let updated = 0;
  let skippedAmount = 0;
  let skippedHandled = 0;

  for (const e of entries) {
    const usd = e.rekt?.amount ?? 0;
    if (usd < MIN_AMOUNT_USD) {
      skippedAmount++;
      continue;
    }
    if (isNameHandled(e.title)) {
      skippedHandled++;
      continue;
    }

    const headline = buildHeadline(e, usd);
    const body = buildBody(e, usd);
    const sources: string[] = [];
    if (e.slug) sources.push(`https://rekt.news/${e.slug}/`);
    sources.push("https://rekt.news/leaderboard");

    const payload: IntelPayload = {
      headline,
      kind: "incident",
      category: categoryForTags(e.tags),
      severity: severityForAmount(usd),
      anonymous: true,
      body,
      sources,
      personas: IMPORT_DEFAULT_PERSONAS,
      // REKT amounts are peak-price valuations — kept for the article body
      // but explicitly tagged so the /intel "Hacked crypto tracked" counter
      // excludes them (they'd double-count DefiLlama's realised-loss figures).
      lossUsd: usd,
      sourceHarvester: "rekt",
    };

    // Preserve REKT's incident date as publishedAt where parsable; falls
    // back to article publish date or "now" so the dashboard sort stays sane.
    const publishedAt =
      parseDate(e.rekt.date) ?? parseDate(e.date) ?? new Date();

    const action = await upsert(payload, publishedAt);
    if (action === "inserted") inserted++;
    else updated++;
  }

  console.log(`✓ REKT import complete:`);
  console.log(`    inserted:        ${inserted}`);
  console.log(`    updated:         ${updated}`);
  console.log(`    skipped (<$${MIN_AMOUNT_USD.toLocaleString()}):   ${skippedAmount}`);
  console.log(`    skipped (already curated): ${skippedHandled}`);
  console.log(`    total processed: ${entries.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
