import {
  GoogleGenerativeAI,
  SchemaType,
  type Tool,
  type FunctionCall,
  type FunctionResponse,
  type Part,
} from "@google/generative-ai";
import { eq } from "drizzle-orm";
import { db, forensicCases } from "@/lib/db";
import type { ForensicReport, ForensicTranscriptStep } from "@/lib/db/schema";
import { TOOL_EXECUTORS, type ToolName } from "./tools";

const MODEL_ID = "gemini-2.5-pro";

const SYSTEM_INSTRUCTION = `You are RexIntel ForensicAgent — an autonomous AI incident-response analyst for crypto and on-chain attribution. You investigate wallets, addresses, scam URLs, and incident references and produce a structured forensic report grounded in evidence from RexIntel's public attribution graph + intel corpus + victim-trace runner.

OPERATING RULES
1. Think like a senior IR analyst. Sequence your tool calls deliberately. If you are about to repeat a call, stop and reason from what you already have.
2. Every claim in the final report MUST be backed by a citation — either a RexIntel record (intel publicId, attribution source, trace publicId) returned by a tool, or an external URL declared via cite_external. No uncited claims.
3. If the tools return nothing useful, say so. "Inconclusive" with low confidence is correct; fabricated attribution is not.
4. Use trace_outbound sparingly — it costs Etherscan budget and ~20–40s wall time. Call it at most twice per case, and only on a wallet that you have reason to believe was drained or laundered.
5. Self-correct: if a tool result contradicts an earlier assumption, revise. Mention the revision in your final summary.
6. When you have enough evidence, emit ONE final function call to submit_report. Do not keep calling tools after that.

ANALYTICAL FRAME
- "verdict": pick from malicious | suspicious | clean | inconclusive.
- "confidence": a 0..1 number reflecting how much the evidence supports the verdict. < 0.4 = inconclusive; 0.4–0.7 = suspicious; 0.7+ = malicious or clean.
- "attributedTo": a real-world cluster name when known (e.g. "Lazarus Group", "Pink Drainer", "Tornado Cash router") or null.
- "fundsFlow": ordered hops; small array is fine; only include hops you can defend.
- "timeline": chronological events with ISO dates when you have them.
- "recommendedActions": concrete next steps a defender can take (revoke approval at X, contact exchange Y, file SAR via FinCEN, etc.).

You are the entire write-up; the case page renders your report and your full transcript publicly.`;

// =====================================================================
// Gemini function-call schemas — keep these tight so the model produces
// well-typed arguments. Schema docs:
// https://ai.google.dev/gemini-api/docs/function-calling
// =====================================================================
const TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "lookup_address",
        description:
          "Look up RexIntel's full context for one address: attributions, owner, category, balance estimate, linked incidents.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            chain: {
              type: SchemaType.STRING,
              description: "Lowercase chain name. Default 'ethereum'.",
            },
            address: {
              type: SchemaType.STRING,
              description: "0x-prefixed 40-char hex address.",
            },
          },
          required: ["address"],
        },
      },
      {
        name: "search_intel",
        description:
          "Keyword-search RexIntel's approved intel corpus (incidents, originals, tips). Returns headlines, deks, and publicIds.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: {
              type: SchemaType.STRING,
              description: "2+ char keyword(s).",
            },
            limit: { type: SchemaType.NUMBER },
          },
          required: ["query"],
        },
      },
      {
        name: "fetch_neighborhood",
        description:
          "Fetch a slice of RexIntel's attribution graph (nodes + edges) so you can see the wider cluster context.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            windowDays: { type: SchemaType.NUMBER },
            view: {
              type: SchemaType.STRING,
              description: "incidents | institutional | combined",
            },
            category: { type: SchemaType.STRING },
            minConfidence: { type: SchemaType.NUMBER },
          },
        },
      },
      {
        name: "trace_outbound",
        description:
          "Run RexIntel's victim-trace runner on a wallet — walks outbound transfers up to 3 hops, terminates at known-attributed addresses. ~20–40s. Use sparingly.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            chain: { type: SchemaType.STRING },
            address: { type: SchemaType.STRING },
            maxHops: { type: SchemaType.NUMBER },
          },
          required: ["address"],
        },
      },
      {
        name: "cite_external",
        description:
          "Declare an external citation (e.g. Etherscan label page, news article URL) you intend to use as evidence.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            url: { type: SchemaType.STRING },
            claim: { type: SchemaType.STRING },
          },
          required: ["url", "claim"],
        },
      },
      {
        name: "submit_report",
        description:
          "Emit the final structured forensic report. Call this exactly once at the end.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            summary: { type: SchemaType.STRING },
            verdict: {
              type: SchemaType.STRING,
              description: "malicious | suspicious | clean | inconclusive",
            },
            confidence: { type: SchemaType.NUMBER },
            attributedTo: { type: SchemaType.STRING },
            fundsFlow: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  from: { type: SchemaType.STRING },
                  to: { type: SchemaType.STRING },
                  amountUsd: { type: SchemaType.NUMBER },
                  via: { type: SchemaType.STRING },
                  note: { type: SchemaType.STRING },
                },
              },
            },
            citations: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  kind: { type: SchemaType.STRING },
                  ref: { type: SchemaType.STRING },
                  claim: { type: SchemaType.STRING },
                },
              },
            },
            timeline: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  at: { type: SchemaType.STRING },
                  event: { type: SchemaType.STRING },
                },
              },
            },
            recommendedActions: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
            },
          },
          required: ["summary", "verdict", "confidence"],
        },
      },
    ],
  },
];

function getClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey and add it to .env.local.",
    );
  }
  return new GoogleGenerativeAI(key);
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildUserPrompt(targetKind: string, target: string, chain: string | null): string {
  const lines = [
    `# Case intake`,
    `target_kind: ${targetKind}`,
    `target: ${target}`,
  ];
  if (chain) lines.push(`chain: ${chain}`);
  lines.push("");
  lines.push("Investigate this target. Use the tools to gather evidence from RexIntel's graph and intel corpus before forming a verdict. Submit_report when done.");
  return lines.join("\n");
}

export type RunAgentOptions = {
  caseId: string;
};

export async function runForensicAgent({ caseId }: RunAgentOptions): Promise<void> {
  const [row] = await db
    .select()
    .from(forensicCases)
    .where(eq(forensicCases.id, caseId))
    .limit(1);
  if (!row) throw new Error(`forensic case ${caseId} not found`);

  const transcript: ForensicTranscriptStep[] = [];
  const prompt = buildUserPrompt(row.targetKind, row.target, row.chain);
  transcript.push({ kind: "user_prompt", text: prompt, at: nowIso() });

  await db
    .update(forensicCases)
    .set({
      status: "running",
      startedAt: new Date(),
      modelId: MODEL_ID,
      transcript,
      updatedAt: new Date(),
    })
    .where(eq(forensicCases.id, caseId));

  const client = getClient();
  const model = client.getGenerativeModel({
    model: MODEL_ID,
    systemInstruction: SYSTEM_INSTRUCTION,
    tools: TOOLS,
  });
  const chat = model.startChat();

  let finalReport: ForensicReport | null = null;
  let iterations = 0;
  let toolCalls = 0;
  const maxIterations = row.maxIterations ?? 12;
  let nextMessage: string | Part[] = prompt;
  let failureReason: string | null = null;

  try {
    while (iterations < maxIterations) {
      iterations++;
      const result = await chat.sendMessage(nextMessage);
      const calls: FunctionCall[] = result.response.functionCalls() ?? [];

      // Text-only turn — capture as thought and ask for the report.
      if (calls.length === 0) {
        const text = result.response.text();
        if (text) {
          transcript.push({ kind: "thought", text, at: nowIso() });
        }
        // Nudge: if it stops without submit_report, prompt once for it.
        if (iterations < maxIterations) {
          nextMessage =
            "You did not call any function. If you have enough evidence, call submit_report now. Otherwise call one more investigative tool.";
          continue;
        }
        break;
      }

      const responseParts: Part[] = [];
      let submittedThisTurn = false;

      for (const call of calls) {
        const name = call.name;
        const args = (call.args ?? {}) as Record<string, unknown>;

        if (name === "submit_report") {
          finalReport = normalizeReport(args);
          submittedThisTurn = true;
          transcript.push({
            kind: "tool_call",
            name,
            args,
            result: { ok: true, accepted: true },
            at: nowIso(),
          });
          continue;
        }

        const executor = TOOL_EXECUTORS[name as ToolName];
        if (!executor) {
          const error = `unknown tool: ${name}`;
          transcript.push({ kind: "tool_call", name, args, error, at: nowIso() });
          responseParts.push({
            functionResponse: {
              name,
              response: { error },
            } satisfies FunctionResponse,
          });
          continue;
        }

        const t0 = Date.now();
        let toolResult: unknown;
        let toolError: string | undefined;
        try {
          toolResult = await executor(args);
        } catch (e) {
          toolError = e instanceof Error ? e.message : "unknown tool error";
          toolResult = { ok: false, error: toolError };
        }
        const ms = Date.now() - t0;
        toolCalls++;

        transcript.push({
          kind: "tool_call",
          name,
          args,
          result: toolResult,
          ms,
          error: toolError,
          at: nowIso(),
        });

        responseParts.push({
          functionResponse: {
            name,
            response: toolResult as Record<string, unknown>,
          } satisfies FunctionResponse,
        });

        // Persist mid-flight so /forensic/[caseId] can show partial progress.
        await db
          .update(forensicCases)
          .set({
            transcript,
            iterationsUsed: iterations,
            toolCallCount: toolCalls,
            updatedAt: new Date(),
          })
          .where(eq(forensicCases.id, caseId));
      }

      if (submittedThisTurn) {
        transcript.push({ kind: "final", at: nowIso() });
        break;
      }
      nextMessage = responseParts;
    }
  } catch (e) {
    failureReason = e instanceof Error ? e.message : "unknown agent error";
  }

  const finalStatus: "complete" | "failed" = failureReason
    ? "failed"
    : finalReport
      ? "complete"
      : "failed";
  if (!finalReport && !failureReason) {
    failureReason = "agent exited without submitting a report (iteration cap reached)";
  }

  await db
    .update(forensicCases)
    .set({
      status: finalStatus,
      failureReason,
      report: finalReport,
      transcript,
      iterationsUsed: iterations,
      toolCallCount: toolCalls,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(forensicCases.id, caseId));
}

// =====================================================================
// Normalize the model's submit_report args into a ForensicReport.
// Gemini's schema enforcement is best-effort, so we coerce defensively.
// =====================================================================
function normalizeReport(args: Record<string, unknown>): ForensicReport {
  const verdictRaw = String(args.verdict ?? "inconclusive").toLowerCase();
  const verdict: ForensicReport["verdict"] = (
    ["malicious", "suspicious", "clean", "inconclusive"] as const
  ).includes(verdictRaw as ForensicReport["verdict"])
    ? (verdictRaw as ForensicReport["verdict"])
    : "inconclusive";

  let confidence = Number(args.confidence ?? 0);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    summary: String(args.summary ?? "").slice(0, 4000),
    verdict,
    confidence,
    attributedTo:
      typeof args.attributedTo === "string" && args.attributedTo.length > 0
        ? args.attributedTo
        : null,
    fundsFlow: Array.isArray(args.fundsFlow)
      ? (args.fundsFlow as ForensicReport["fundsFlow"])
      : [],
    citations: Array.isArray(args.citations)
      ? (args.citations as ForensicReport["citations"])
      : [],
    timeline: Array.isArray(args.timeline)
      ? (args.timeline as ForensicReport["timeline"])
      : [],
    recommendedActions: Array.isArray(args.recommendedActions)
      ? (args.recommendedActions as string[])
      : [],
  };
}
