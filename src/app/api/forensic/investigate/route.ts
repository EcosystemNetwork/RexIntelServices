import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, forensicCases } from "@/lib/db";
import { runForensicAgent } from "@/lib/forensic/agent";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
// Worst case: 12 iterations × (Gemini Pro turn ~3–6s) + one optional
// trace_outbound (~30s) ≈ 60–110s. Cap at 300s (Vercel Pro max) so we
// never time out mid-investigation.
export const maxDuration = 300;

/**
 * POST /api/forensic/investigate
 *
 * Spawns the RexIntel ForensicAgent against a target (wallet address,
 * incident URL, intel publicId, or free-text question). Runs synchronously
 * until the agent calls submit_report (or hits the iteration cap), then
 * returns the case's publicId so the client can navigate to
 * /forensic/[publicId].
 *
 * Body:
 *   { targetKind: 'address' | 'url' | 'intel' | 'question',
 *     target: string,
 *     chain?: string,          // for targetKind='address'; default ethereum
 *     submitterEmail?: string }
 *
 * Returns: { ok, publicId, resultUrl, status }
 */
const ADDRESS_RX = /^0x[a-f0-9]{40}$/i;

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  // Gemini Pro is expensive (function-calling, 12 iterations possible).
  // Throttle harder than /trace: 5 per IP per hour.
  const limit = await rateLimit(`forensic:${ip}`, 5, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many investigations. Try again in an hour." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  type Body = {
    targetKind?: "address" | "url" | "intel" | "question";
    target?: string;
    chain?: string;
    submitterEmail?: string;
  };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const targetKind = body.targetKind ?? "address";
  if (!["address", "url", "intel", "question"].includes(targetKind)) {
    return NextResponse.json(
      { error: "targetKind must be address | url | intel | question" },
      { status: 400 },
    );
  }
  const target = (body.target ?? "").trim();
  if (!target || target.length > 500) {
    return NextResponse.json(
      { error: "target is required (≤500 chars)" },
      { status: 400 },
    );
  }

  let chain: string | null = null;
  if (targetKind === "address") {
    chain = (body.chain ?? "ethereum").toLowerCase();
    if (chain !== "ethereum") {
      return NextResponse.json(
        { error: "v1 supports ethereum mainnet only" },
        { status: 400 },
      );
    }
    if (!ADDRESS_RX.test(target)) {
      return NextResponse.json(
        { error: "address must be a 0x-prefixed 40-char hex string" },
        { status: 400 },
      );
    }
  } else if (targetKind === "url") {
    if (!/^https?:\/\//.test(target)) {
      return NextResponse.json(
        { error: "url must be http(s)://" },
        { status: 400 },
      );
    }
  }

  // 1-hour dedupe on (targetKind, target). If the same wallet was
  // investigated in the last hour, return that case's publicId.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [existing] = await db
    .select({ id: forensicCases.id, publicId: forensicCases.publicId, status: forensicCases.status })
    .from(forensicCases)
    .where(
      and(
        eq(forensicCases.targetKind, targetKind),
        sql`lower(${forensicCases.target}) = ${target.toLowerCase()}`,
        gt(forensicCases.createdAt, hourAgo),
      ),
    )
    .limit(1);
  if (existing) {
    return NextResponse.json({
      ok: true,
      publicId: existing.publicId,
      resultUrl: `/forensic/${existing.publicId}`,
      status: existing.status,
      deduped: true,
    });
  }

  const submitterEmail = (body.submitterEmail ?? "").trim().toLowerCase() || null;

  const [inserted] = await db
    .insert(forensicCases)
    .values({
      targetKind,
      target,
      chain,
      submitterEmail,
      submitterIp: ip,
    })
    .returning({ id: forensicCases.id, publicId: forensicCases.publicId });
  if (!inserted) {
    return NextResponse.json(
      { error: "Failed to create case row" },
      { status: 500 },
    );
  }

  try {
    await runForensicAgent({ caseId: inserted.id });
  } catch (err) {
    // runForensicAgent handles its own DB updates for failure paths;
    // this catch is a final safety net so the HTTP response always
    // returns cleanly even if the agent throws above its catch.
    const reason = err instanceof Error ? err.message : "unknown agent error";
    await db
      .update(forensicCases)
      .set({
        status: "failed",
        failureReason: reason,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(forensicCases.id, inserted.id));
  }

  const [final] = await db
    .select({ status: forensicCases.status })
    .from(forensicCases)
    .where(eq(forensicCases.id, inserted.id))
    .limit(1);

  return NextResponse.json({
    ok: true,
    publicId: inserted.publicId,
    resultUrl: `/forensic/${inserted.publicId}`,
    status: final?.status ?? "unknown",
  });
}
