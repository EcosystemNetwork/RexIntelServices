import { NextRequest, NextResponse } from "next/server";
import { lookupAddressContext } from "@/lib/expo-context";
import { geminiText } from "@/lib/gemini";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/expo/brief
 *
 * Demo endpoint for the AI & Big Data Expo NA submission (Track 4 — Data &
 * Intelligence). Pulls every attribution we have for a crypto address out of
 * the RexIntel graph (sanctions lists, curated, community, incident-derived)
 * and asks Gemini to synthesize an investigator brief.
 *
 * Body: { chain?: string ("ethereum"), address: string }
 * Returns: { found: boolean, brief: string, context: AddressContext, meta }
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const limit = await rateLimit(`expo-brief:${ip}`, 20, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many briefs. Try again in an hour." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  type Body = { chain?: string; address?: string };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const chain = (body.chain ?? "ethereum").toLowerCase().trim();
  const address = (body.address ?? "").trim();
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  const context = await lookupAddressContext(chain, address);

  const t0 = Date.now();
  let brief: string;
  try {
    brief = await geminiText(buildBriefPrompt(context), {
      model: "flash",
      systemInstruction: BRIEF_SYSTEM,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Gemini call failed";
    return NextResponse.json({ error: reason }, { status: 500 });
  }
  const latencyMs = Date.now() - t0;

  return NextResponse.json({
    found: context.found,
    brief,
    context,
    meta: {
      model: "gemini-2.5-flash",
      latencyMs,
      generatedAt: new Date().toISOString(),
    },
  });
}

const BRIEF_SYSTEM = `You are an investigator on the RexIntel desk — a crypto-intelligence service that tracks sanctioned wallets, hacks, and lost funds across chains. Write tight, factual briefs an analyst can paste into a case file.

Rules:
- Lead with the verdict in one line ("HIGH-RISK · OFAC-sanctioned Lazarus address" / "Curated exchange wallet · Coinbase Prime"). No greeting, no preamble.
- Cite every claim against a source label from the context (e.g. "OFAC SDN list", "L2Beat", "RexIntel curated", "community victim trace"). Never invent sources.
- If the address is unknown to the graph, say so explicitly and stop. Do not speculate.
- When community-class sources (victim-trace, community-loss-report, bounty-claim) are the only attribution, flag the confidence gap.
- Output sections: VERDICT · ATTRIBUTION · LINKED INCIDENTS · NEXT STEPS. Max ~180 words.`;

function buildBriefPrompt(ctx: ReturnType<typeof lookupAddressContext> extends Promise<infer T> ? T : never): string {
  if (!ctx.found) {
    return `Address: ${ctx.chain}:${ctx.address}\n\nThe RexIntel address graph has no record of this address. Write a one-paragraph "unknown address" brief noting that no attributions exist in the graph (sanctions, curated, incidents, or community), and recommend the next investigative step (e.g. on-chain trace, OSINT search).`;
  }

  const balanceLine =
    ctx.balanceEstimateUsd != null
      ? `Balance: ~$${ctx.balanceEstimateUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} USD${ctx.nativeAmount != null && ctx.nativeSymbol ? ` (${ctx.nativeAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${ctx.nativeSymbol})` : ""}`
      : ctx.nativeAmount != null && ctx.nativeSymbol
        ? `Native balance: ${ctx.nativeAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${ctx.nativeSymbol}`
        : "Balance: unknown";

  const attribLines = ctx.attributions.length
    ? ctx.attributions
        .map(
          (a) =>
            `- [${a.source}] ${a.label ?? a.ownerName ?? "(no label)"}${a.confidence != null ? ` · confidence ${a.confidence}` : ""}${a.notes ? ` — ${a.notes}` : ""}${a.sourceUrl ? ` (${a.sourceUrl})` : ""}`,
        )
        .join("\n")
    : "(no attributions on record)";

  const incidentLines = ctx.incidents.length
    ? ctx.incidents
        .map(
          (i) =>
            `- [${i.publicId}] ${i.headline}${i.dek ? ` — ${i.dek}` : ""} · kind=${i.kind ?? "?"} · severity=${i.severity ?? "?"} · role=${i.role}`,
        )
        .join("\n")
    : "(no linked incidents on record)";

  return [
    `Address: ${ctx.chain}:${ctx.address}`,
    `Primary label: ${ctx.label ?? "(none)"}`,
    `Primary owner: ${ctx.ownerName ?? "(none)"} (${ctx.ownerKind ?? "?"})`,
    `Primary category: ${ctx.category ?? "(none)"}`,
    `Primary source: ${ctx.primarySource ?? "(none)"} · confidence ${ctx.confidence ?? "?"}`,
    balanceLine,
    "",
    "ATTRIBUTIONS:",
    attribLines,
    "",
    "LINKED INCIDENTS:",
    incidentLines,
  ].join("\n");
}
