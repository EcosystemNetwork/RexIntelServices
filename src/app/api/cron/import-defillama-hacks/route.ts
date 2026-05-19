import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { IntelPayload } from "@/lib/db/schema";
import type { PersonaSlug } from "@/lib/personas";
import { sendOpsAlert } from "@/lib/email/admin-alert-email";
import { autoExtractAndLinkIntelAddresses } from "@/lib/intel-address-extraction";

/**
 * GET /api/cron/import-defillama-hacks
 *
 * Weekly refresh of the DefiLlama hacks catalog (api.llama.fi/hacks). New
 * entries that appear in DefiLlama get inserted as intel submissions; entries
 * matching previously-curated names are skipped to preserve hand-written
 * postmortems.
 *
 * This is the cron'd equivalent of running `scripts/import-defillama-hacks.ts`
 * locally — same filtering rules, same body templates, same upsert
 * semantics. The script remains as the manual one-off path.
 *
 * Auth: standard Vercel cron bearer-token gate via CRON_SECRET (matches the
 * other /api/cron/* routes — see middleware.ts PUBLIC_ROUTES carve-out).
 *
 * Schedule: Sundays at 23:00 UTC (one hour after draft-digest at 22:00) —
 * so the importer's new entries land before but-not-during the digest's
 * editorial-bar guard window.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFILLAMA_HACKS_URL = "https://api.llama.fi/hacks";
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
  date: number;
  name: string;
  classification: string | null;
  technique: string | null;
  amount: number | null;
  chain: string[] | null;
  bridgeHack: boolean | null;
  targetType: string | null;
  source: string | null;
  returnedFunds: number | null;
  defillamaId: number | null;
  language: string | null;
};

function severityForAmount(usd: number): IntelPayload["severity"] {
  if (usd >= 50_000_000) return "critical";
  if (usd >= 5_000_000) return "high";
  if (usd >= 1_000_000) return "medium";
  return "low";
}

function categoryForTarget(
  target: string | null,
  classification: string | null,
): string {
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
  const chain = (h.chain ?? []).join(" · ") || "Multi-chain";
  const tech = h.technique || h.classification || "exploit";
  return `${h.name} ${formatUsd(usd)} — ${formatMonthYear(h.date)} — ${tech} on ${chain}`;
}

function buildBody(h: LlamaHack, usd: number): string {
  const lines: string[] = [];
  const date = new Date(h.date * 1000).toISOString().slice(0, 10);
  const chain = (h.chain ?? []).join(", ") || "(chain unspecified)";
  lines.push(`On ${date}, ${h.name} lost ${formatUsd(usd)} on ${chain}.`);
  const parts: string[] = [];
  if (h.targetType) parts.push(`target: **${h.targetType}**`);
  if (h.classification) parts.push(`classification: **${h.classification}**`);
  if (h.technique) parts.push(`technique: **${h.technique}**`);
  if (parts.length > 0) {
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

export async function GET(req: Request) {
  const fail = verifyCronSecret(req);
  if (fail) return NextResponse.json(fail.body, { status: fail.status });

  const res = await fetch(DEFILLAMA_HACKS_URL);
  if (!res.ok) {
    await sendOpsAlert({
      key: "import-defillama-hacks:fetch_failed",
      subject: "[Ops] DefiLlama hacks import failed",
      message: `Fetch failed: HTTP ${res.status} from ${DEFILLAMA_HACKS_URL}`,
    });
    return NextResponse.json(
      {
        ok: false,
        error: "defillama_fetch_failed",
        status: res.status,
      },
      { status: 502 },
    );
  }
  const raw = (await res.json()) as LlamaHack[];

  let inserted = 0;
  let updated = 0;
  let skippedAmount = 0;
  let skippedHandled = 0;

  const rowErrors: Array<{ name: string; error: string }> = [];
  for (const h of raw) {
    try {
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
      sourceHarvester: "defillama",
    };

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
      // Curator-overwrite guard: only re-stamp rows we know came from this
      // harvester. A row whose headline happens to match a curator-edited
      // postmortem would otherwise be clobbered on every Sunday tick.
      const prev = existing[0].payload as IntelPayload;
      if (prev.sourceHarvester !== "defillama") {
        skippedHandled++;
        continue;
      }
      await db
        .update(submissions)
        .set({
          payload,
          status: "approved",
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(submissions.id, existing[0].id));
      updated++;
      // Re-run extraction so updated bodies (curators may add addresses to
      // a harvested postmortem) feed the graph. Idempotent — see notes in
      // intel-address-extraction.ts.
      try {
        await autoExtractAndLinkIntelAddresses(existing[0].id, payload);
      } catch (err) {
        rowErrors.push({
          name: h.name ?? "unknown",
          error:
            "address auto-extract: " +
            (err instanceof Error ? err.message : String(err)),
        });
      }
    } else {
      const [created] = await db
        .insert(submissions)
        .values({
          type: "intel",
          status: "approved",
          payload,
          publishedAt: new Date(),
        })
        .returning({ id: submissions.id });
      inserted++;
      if (created) {
        try {
          await autoExtractAndLinkIntelAddresses(created.id, payload);
        } catch (err) {
          rowErrors.push({
            name: h.name ?? "unknown",
            error:
              "address auto-extract: " +
              (err instanceof Error ? err.message : String(err)),
          });
        }
      }
    }
    } catch (err) {
      // Per-row safety net: a single bad upstream entry shouldn't abort the
      // whole batch and silently drop the remainder. Log and continue.
      rowErrors.push({
        name: h.name ?? "unknown",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    totalFetched: raw.length,
    inserted,
    updated,
    skippedAmount,
    skippedHandled,
    rowErrors: rowErrors.slice(0, 20),
  });
}
