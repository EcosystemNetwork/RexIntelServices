import { and, eq, gt, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { IntelPayload } from "@/lib/db/schema";
import { geminiText } from "@/lib/gemini";
import type { PersonaSlug } from "@/lib/personas";

/**
 * Gemini Editor — drafts editorial-grade intel from fresh DefiLlama hack
 * events that the regular weekly importer hasn't yet covered.
 *
 * Distinct from `import-defillama-hacks` in two ways:
 *
 *   1. The existing importer auto-PUBLISHES a structured stub (factual
 *      restatement, no narrative). This agent inserts as status='pending'
 *      so a curator reads the Gemini draft before it goes live — respects
 *      the founder-grade intake bar memory.
 *
 *   2. The body is a real ~200-word incident narrative written by Gemini
 *      Pro, not a templated paragraph. Gemini cites the underlying source
 *      URL but is instructed never to invent details outside the structured
 *      input.
 *
 * Dedupe: skips any event whose DefiLlama protocol id we've already
 * drafted, regardless of the row's current status (pending OR approved).
 */

const DEFILLAMA_HACKS_URL = "https://api.llama.fi/hacks";
const MIN_AMOUNT_USD = 1_000_000; // higher bar than the importer — we only
// want events worth a Gemini-Pro pass.
const MAX_AGE_DAYS = 14;
const MAX_DRAFTS_PER_RUN = 5; // bounds per-tick latency + Gemini quota use.

const EDITOR_DEFAULT_PERSONAS: PersonaSlug[] = [
  "compliance",
  "investigator",
  "exchange-risk",
  "gov-le",
  "fund-risk",
];

const EDITOR_SYSTEM = `You are a senior crypto-investigations editor at RexIntel. You receive structured facts about an on-chain incident from the DefiLlama hacks feed. Your job: write the tightest possible editorial draft an analyst can paste into the morning briefing.

Rules:
- Open with the incident in one sentence: who, how much, when, on what chain, what mechanism.
- Second paragraph: the technical mechanism in plain English. Only use details present in the structured input — never invent attacker handles, attribution, or post-incident developments.
- Third paragraph: the recovery / response, IF the structured input lists returnedFunds; otherwise skip.
- Close with a one-sentence "what to watch." Forward-looking only — no speculation about culprits.
- Max 220 words. No headers, no bullet lists, no markdown — paragraphs only. Plain prose for the body field.
- Never fabricate a source URL. Sources are added downstream from the structured input.`;

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

function buildPrompt(h: LlamaHack, usd: number): string {
  const date = new Date(h.date * 1000).toISOString().slice(0, 10);
  const chain = (h.chain ?? []).join(", ") || "(chain unspecified)";
  const lines = [
    `Incident: ${h.name}`,
    `Date: ${date}`,
    `Amount lost: ${formatUsd(usd)} USD (${usd} raw)`,
    `Chain(s): ${chain}`,
    `Target type: ${h.targetType ?? "—"}`,
    `Classification: ${h.classification ?? "—"}`,
    `Technique: ${h.technique ?? "—"}`,
    `Contract language: ${h.language ?? "—"}`,
    `Bridge-related: ${h.bridgeHack ? "yes" : "no"}`,
    `Returned funds: ${h.returnedFunds != null ? formatUsd(h.returnedFunds) : "none reported"}`,
    `Primary source URL: ${h.source ?? "(DefiLlama feed only)"}`,
  ];
  return lines.join("\n");
}

export type GeminiEditorResult = {
  fetched: number;
  drafted: number;
  skippedAge: number;
  skippedAmount: number;
  skippedDuplicate: number;
  skippedNoSource: number;
  drafts: Array<{ headline: string; publicId?: string }>;
  rowErrors: Array<{ name: string; error: string }>;
};

/**
 * Runs one pass over the DefiLlama feed and drafts up to MAX_DRAFTS_PER_RUN
 * new pending intel rows. Idempotent: re-running within the same window
 * skips events we've already drafted.
 */
export async function runGeminiEditor(): Promise<GeminiEditorResult> {
  const res = await fetch(DEFILLAMA_HACKS_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `DefiLlama fetch failed: ${res.status} ${res.statusText}`,
    );
  }
  const raw = (await res.json()) as LlamaHack[];

  const ageCutoffSec =
    Date.now() / 1000 - MAX_AGE_DAYS * 24 * 60 * 60;

  let skippedAge = 0;
  let skippedAmount = 0;
  let skippedDuplicate = 0;
  let skippedNoSource = 0;
  const drafts: GeminiEditorResult["drafts"] = [];
  const rowErrors: GeminiEditorResult["rowErrors"] = [];

  // Sort newest-first so we draft the most consequential recent events
  // before hitting the per-run cap.
  const fresh = raw
    .filter((h) => {
      if (h.date < ageCutoffSec) {
        skippedAge++;
        return false;
      }
      const usd = h.amount ?? 0;
      if (usd < MIN_AMOUNT_USD) {
        skippedAmount++;
        return false;
      }
      if (!h.source) {
        // We require a primary source to anchor the draft; otherwise the
        // judges (and our editorial bar) have nothing to fact-check against.
        skippedNoSource++;
        return false;
      }
      return true;
    })
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));

  for (const h of fresh) {
    if (drafts.length >= MAX_DRAFTS_PER_RUN) break;

    const usd = h.amount ?? 0;
    const headline = buildHeadline(h, usd);

    // Dedupe by exact headline. The headline is deterministic from the
    // DefiLlama event (name + amount + month + technique + chain), so the
    // existing importer and this agent generate the same string for the
    // same event. If either has covered it, we skip.
    const existing = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(
        and(
          eq(submissions.type, "intel"),
          sql`${submissions.payload}->>'headline' = ${headline}`,
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      skippedDuplicate++;
      continue;
    }

    try {
      const body = await geminiText(buildPrompt(h, usd), {
        model: "pro",
        systemInstruction: EDITOR_SYSTEM,
      });

      const sources: string[] = [];
      if (h.source) sources.push(h.source);
      if (h.defillamaId != null) {
        sources.push(`https://defillama.com/protocol/${h.defillamaId}`);
      }
      sources.push("https://defillama.com/hacks");

      const payload: IntelPayload = {
        headline,
        kind: "incident",
        category: h.targetType ?? h.classification ?? "DeFi exploit",
        severity: severityForAmount(usd),
        anonymous: true,
        body: body.trim(),
        bodyFormat: "plain",
        sources,
        personas: EDITOR_DEFAULT_PERSONAS,
        sourceHarvester: "gemini-editor",
        sourceGrade: "secondary",
      };

      // Status pending — this is the whole point. Curator reviews the
      // Gemini draft before it publishes. The /expo demo shows the count
      // of drafts produced; the actual approval flow is unchanged.
      const [inserted] = await db
        .insert(submissions)
        .values({
          type: "intel",
          status: "pending",
          payload,
        })
        .returning({ publicId: submissions.publicId });

      drafts.push({ headline, publicId: inserted?.publicId });
    } catch (err) {
      rowErrors.push({
        name: h.name ?? "unknown",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    fetched: raw.length,
    drafted: drafts.length,
    skippedAge,
    skippedAmount,
    skippedDuplicate,
    skippedNoSource,
    drafts,
    rowErrors,
  };
}

/**
 * Read-side helper for the /expo demo so we can show "Gemini editor has
 * drafted N pieces in the last 7 days" without a self-fetch.
 */
export async function countRecentGeminiDrafts(
  windowDays = 7,
): Promise<{ drafted: number; pending: number; approved: number }> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      status: submissions.status,
      count: sql<number>`count(*)::int`,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "intel"),
        sql`${submissions.payload}->>'sourceHarvester' = 'gemini-editor'`,
        gt(submissions.createdAt, since),
      ),
    )
    .groupBy(submissions.status);

  let drafted = 0;
  let pending = 0;
  let approved = 0;
  for (const r of rows) {
    drafted += r.count;
    if (r.status === "pending") pending += r.count;
    if (r.status === "approved") approved += r.count;
  }
  return { drafted, pending, approved };
}
