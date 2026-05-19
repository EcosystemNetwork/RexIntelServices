import type { IntelPayload } from "@/lib/db/schema";
import { geminiText } from "@/lib/gemini";

/**
 * Expand a thin intel body into a full editorial draft via Gemini Pro.
 *
 * The auto-harvesters (DefiLlama / REKT) historically wrote 4–6 line stubs
 * and published them directly. Rex Deus flagged 2026-05-19: every story
 * must be a full article, not a sentence or two. This helper sits between
 * the harvester's structured-fact extraction and the DB insert — it takes
 * the harvester's draft payload and returns one with a properly-written
 * body (~200 words) and `bodyFormat = "plain"`.
 *
 * Failure mode: if Gemini errors or the key is missing, returns the input
 * payload unchanged so the harvester can decide between (a) publishing the
 * stub anyway, or (b) dropping/queueing the row. Callers should check
 * `result.expanded` to know which happened.
 */

const EDITOR_SYSTEM = `You are a senior crypto-investigations editor at RexIntel. You receive a thin draft of an on-chain incident report and rewrite it into a publishable article. Constraints:
- Open with the incident in one sentence: who, how much, when, on what chain, what mechanism.
- Second paragraph: the technical mechanism in plain English. Only use details present in the structured input — never invent attacker handles, attribution, or post-incident developments not in the source material.
- Third paragraph: the recovery / response IF the input mentions returned funds, arrests, freezes, attribution; otherwise replace with one paragraph on the broader pattern (other incidents in the same category, what this class of attack typically looks like).
- Close with a one-sentence "what to watch" — forward-looking only, no speculation about culprits.
- Target 180-220 words total. No headers, no bullet lists, no markdown — paragraphs separated by a blank line. Plain prose for the body field.
- Never fabricate source URLs or attacker addresses. Sources stay in the structured 'sources' array, handled downstream.`;

export const MIN_ARTICLE_BODY_CHARS = 600;

export function needsEnrichment(payload: IntelPayload): boolean {
  const body = payload.body ?? "";
  return body.trim().length < MIN_ARTICLE_BODY_CHARS;
}

export type EnrichmentResult = {
  payload: IntelPayload;
  expanded: boolean;
  reason?: string;
};

/**
 * Rewrites `payload.body` to a 180-220 word article when it's below the
 * minimum length floor. Idempotent on already-long rows. Preserves every
 * other payload field (sources, links, addresses, hero, etc.).
 */
export async function enrichIntelArticle(
  payload: IntelPayload,
): Promise<EnrichmentResult> {
  if (!needsEnrichment(payload)) {
    return { payload, expanded: false, reason: "already-full-length" };
  }

  if (!process.env.GEMINI_API_KEY) {
    return { payload, expanded: false, reason: "no-gemini-key" };
  }

  const prompt = buildPrompt(payload);
  try {
    const expanded = await geminiText(prompt, {
      model: "pro",
      systemInstruction: EDITOR_SYSTEM,
    });
    const cleaned = expanded.trim();
    if (cleaned.length < MIN_ARTICLE_BODY_CHARS) {
      // Gemini returned something even shorter — keep the original rather
      // than ship a worse version.
      return { payload, expanded: false, reason: "gemini-output-too-short" };
    }
    return {
      payload: {
        ...payload,
        body: cleaned,
        bodyFormat: "plain",
      },
      expanded: true,
    };
  } catch (err) {
    return {
      payload,
      expanded: false,
      reason: `gemini-error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function buildPrompt(payload: IntelPayload): string {
  const lines: string[] = [];
  lines.push(`Headline: ${payload.headline}`);
  if (payload.dek) lines.push(`Standfirst: ${payload.dek}`);
  if (payload.category) lines.push(`Category: ${payload.category}`);
  if (payload.kind) lines.push(`Kind: ${payload.kind}`);
  if (payload.severity) lines.push(`Severity: ${payload.severity}`);
  if (payload.sources?.length)
    lines.push(`Sources (for fact-checking only — do NOT cite inline):`);
  for (const s of payload.sources ?? []) lines.push(`  - ${s}`);
  if (payload.links?.length) lines.push(`Referenced links:`);
  for (const l of payload.links ?? []) lines.push(`  - ${l}`);
  lines.push("");
  lines.push("Existing thin draft:");
  lines.push("---");
  lines.push(payload.body ?? "");
  lines.push("---");
  lines.push("");
  lines.push(
    "Rewrite the draft into the article body per the system instructions. Output the body only — no headline, no preamble, no closing signature.",
  );
  return lines.join("\n");
}
