import { NextRequest, NextResponse } from "next/server";
import {
  extractKeywords,
  getGraphSummary,
  lookupIntelSnippets,
} from "@/lib/expo-context";
import { geminiText } from "@/lib/gemini";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/expo/query
 *
 * Natural-language Q&A over the RexIntel intel corpus + address graph
 * stats. Demo surface for the AI & Big Data Expo NA submission.
 *
 * Body: { question: string }
 * Returns: { answer: string, citations: string[], meta }
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const limit = await rateLimit(`expo-query:${ip}`, 30, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many queries. Try again in an hour." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  type Body = { question?: string };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question = (body.question ?? "").trim();
  if (question.length < 4 || question.length > 500) {
    return NextResponse.json(
      { error: "question must be 4–500 chars" },
      { status: 400 },
    );
  }

  const keywords = extractKeywords(question);
  const [snippets, summary] = await Promise.all([
    lookupIntelSnippets(keywords, 25),
    getGraphSummary(),
  ]);

  const t0 = Date.now();
  let answer: string;
  try {
    answer = await geminiText(buildPrompt(question, snippets, summary), {
      model: "flash",
      systemInstruction: QUERY_SYSTEM,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Gemini call failed";
    return NextResponse.json({ error: reason }, { status: 500 });
  }
  const latencyMs = Date.now() - t0;

  const citations = snippets
    .filter((s) => answer.includes(s.publicId))
    .map((s) => s.publicId);

  return NextResponse.json({
    answer,
    citations,
    meta: {
      model: "gemini-2.5-flash",
      latencyMs,
      keywords,
      contextSize: snippets.length,
      generatedAt: new Date().toISOString(),
    },
  });
}

const QUERY_SYSTEM = `You are the RexIntel intelligence desk's research assistant — a crypto-investigations service. Answer the analyst's question using ONLY the intel snippets and graph stats provided. Lead with the direct answer in 1–2 sentences, then supporting detail. Cite every claim with the intel publicId in square brackets like [RX-2026-04-021]. If the snippets don't cover the question, say "Not in the indexed corpus" and stop — do not fall back on outside knowledge. Max ~220 words.`;

function buildPrompt(
  question: string,
  snippets: Awaited<ReturnType<typeof lookupIntelSnippets>>,
  summary: Awaited<ReturnType<typeof getGraphSummary>>,
): string {
  const stats = [
    `Total addresses tracked: ${summary.totalAddresses.toLocaleString()}`,
    `Total approved intel pieces: ${summary.totalIncidents.toLocaleString()}`,
    `Aggregate priced USD across graph: $${summary.totalLostUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
    `Top attribution sources: ${summary.topSources.map((s) => `${s.source} (${s.count})`).join(", ")}`,
    `Top categories: ${summary.topCategories.map((c) => `${c.category} (${c.count})`).join(", ")}`,
  ].join("\n");

  const snippetBlock = snippets.length
    ? snippets
        .map(
          (s) =>
            `--- [${s.publicId}] (${s.kind ?? "?"} · ${s.severity ?? "?"} · ${s.publishedAt?.slice(0, 10) ?? "?"})\nHEADLINE: ${s.headline}${s.dek ? `\nDEK: ${s.dek}` : ""}\nBODY: ${s.bodyExcerpt}`,
        )
        .join("\n\n")
    : "(no intel snippets matched)";

  return [
    "GRAPH STATS:",
    stats,
    "",
    "INTEL CORPUS SNIPPETS:",
    snippetBlock,
    "",
    "QUESTION:",
    question,
  ].join("\n");
}
