import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { IntelPayload } from "@/lib/db/schema";
import type { PersonaSlug } from "@/lib/personas";
import { sendOpsAlert } from "@/lib/email/admin-alert-email";
import { enrichIntelArticle } from "@/lib/intel-article-enrichment";

/**
 * GET /api/cron/import-rekt-leaderboard
 *
 * Weekly refresh of the REKT.news leaderboard. Same logic as
 * scripts/import-rekt-leaderboard.ts — fetches the leaderboard HTML,
 * extracts the embedded __NEXT_DATA__ JSON, transforms each entry into an
 * IntelPayload, upserts via the standard submissions table.
 *
 * Why a separate cron from DefiLlama: REKT publishes their leaderboard at
 * a different cadence and serves it from a different source (HTML scrape
 * vs. JSON API). Decoupling the two means a failure in one source doesn't
 * block the other.
 *
 * Schedule: Mondays 02:00 UTC — well separated from the Sunday cron
 * cluster (draft-digest 22:00 Sun, DefiLlama import 23:00 Sun, OFAC
 * harvester 04:00 Mon).
 *
 * Auth: CRON_SECRET bearer token, same convention as other crons.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const REKT_URL = "https://rekt.news/leaderboard";
const MIN_AMOUNT_USD = 500_000;

const IMPORT_DEFAULT_PERSONAS: PersonaSlug[] = [
  "compliance",
  "investigator",
  "exchange-risk",
  "gov-le",
  "fund-risk",
];

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
  date: string;
  featured: boolean;
  title: string;
  rekt: { amount: number | null; audit?: string | null; date?: string | null };
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
  if (ts.some((t) => t.includes("infrastructure")))
    return "Infrastructure breach";
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
  const dateStr = incident
    ? incident.toISOString().slice(0, 10)
    : "(date unknown)";
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

export async function GET(req: Request) {
  const fail = verifyCronSecret(req);
  if (fail) return NextResponse.json(fail.body, { status: fail.status });

  let entries: RektEntry[];
  try {
    const res = await fetch(REKT_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; RexIntel-importer/1.0; +https://rexintelservices.com)",
      },
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: "rekt_fetch_failed", status: res.status },
        { status: 502 },
      );
    }
    const html = await res.text();
    const m = html.match(/__NEXT_DATA__[^>]*>([\s\S]+?)<\/script>/);
    if (!m) {
      return NextResponse.json(
        { ok: false, error: "rekt_next_data_missing" },
        { status: 502 },
      );
    }
    const json = JSON.parse(m[1]) as {
      props?: { pageProps?: { leaderboard?: RektEntry[] } };
    };
    const lb = json.props?.pageProps?.leaderboard;
    if (!Array.isArray(lb)) {
      return NextResponse.json(
        { ok: false, error: "rekt_leaderboard_shape_invalid" },
        { status: 502 },
      );
    }
    entries = lb;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sendOpsAlert({
      key: "import-rekt-leaderboard:fetch_threw",
      subject: "[Ops] REKT leaderboard import failed",
      message: `Fetch / parse threw before processing entries.\n\n${message}`,
    });
    return NextResponse.json(
      {
        ok: false,
        error: "rekt_fetch_threw",
        message,
      },
      { status: 502 },
    );
  }

  let inserted = 0;
  let updated = 0;
  let skippedAmount = 0;
  let skippedHandled = 0;

  const rowErrors: Array<{ name: string; error: string }> = [];
  for (const e of entries) {
    try {
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

    const stubPayload: IntelPayload = {
      headline,
      kind: "incident",
      category: categoryForTags(e.tags),
      severity: severityForAmount(usd),
      anonymous: true,
      body,
      sources,
      personas: IMPORT_DEFAULT_PERSONAS,
      sourceHarvester: "rekt",
    };

    // Rex Deus 2026-05-19: every story is a full article, not a stub. Route
    // the harvester's excerpt-paragraph through Gemini Pro for a ~200-word
    // editorial body. Soft-fail to the stub when Gemini is unavailable.
    const enrichment = await enrichIntelArticle(stubPayload);
    const payload = enrichment.payload;

    const publishedAt =
      parseDate(e.rekt.date) ?? parseDate(e.date) ?? new Date();

    const existing = await db
      .select({ id: submissions.id, payload: submissions.payload })
      .from(submissions)
      .where(
        and(
          eq(submissions.type, "intel"),
          sql`${submissions.payload}->>'headline' = ${headline}`,
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      // Curator-overwrite guard: skip if this row wasn't last touched by
      // the rekt harvester. Hand-edited postmortems whose headline matches
      // the cron's generated headline would otherwise get clobbered.
      const prev = existing[0].payload as IntelPayload;
      if (prev.sourceHarvester !== "rekt") {
        skippedHandled++;
        continue;
      }
      await db
        .update(submissions)
        .set({
          payload,
          status: "approved",
          publishedAt,
          updatedAt: new Date(),
        })
        .where(eq(submissions.id, existing[0].id));
      updated++;
    } else {
      await db.insert(submissions).values({
        type: "intel",
        status: "approved",
        payload,
        publishedAt,
      });
      inserted++;
    }
    } catch (err) {
      // Per-row safety net for malformed entries (missing names, NaN dates).
      rowErrors.push({
        name: e.title ?? "unknown",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    totalFetched: entries.length,
    inserted,
    updated,
    skippedAmount,
    skippedHandled,
    rowErrors: rowErrors.slice(0, 20),
  });
}
