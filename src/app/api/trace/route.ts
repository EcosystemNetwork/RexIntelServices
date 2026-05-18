import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db, hackTraces } from "@/lib/db";
import { runTrace } from "@/lib/tracer";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";

export const runtime = "nodejs";
// Worst-case: 3 hops × ~6 expanded addresses × 3 Etherscan calls @ 4 rps +
// DB writes ≈ 30–50s. Keep within Vercel Pro (60s) by capping max_hops at 3.
export const maxDuration = 60;

/**
 * POST /api/trace
 *
 * Kicks off an outbound-flow trace from a victim-submitted root address.
 * v1 scope: Ethereum mainnet only. Sync — the request blocks until the
 * trace finishes (~20–40s typical) so the result page is ready when we
 * respond. v2 will queue the work so submitters don't have to keep the tab
 * open, but for the soft launch the simpler path is fine and gives clearer
 * error UX (we can return the actual failure reason in-band).
 *
 * Body:
 *   { chain: "ethereum",
 *     rootAddress: string,                // 0x… of the drained wallet
 *     submitterEmail: string,             // gating channel (required v1)
 *     victimLabel?: string,
 *     lossUsd?: number,
 *     lossTokenSymbol?: string,
 *     maxHops?: number }                  // clamped to 1..3 in v1
 *
 * Returns: { publicId, status, resultUrl }
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  // 3 traces per IP per hour. Tracing is API-budget-expensive (Etherscan
  // 100k/day on free tier) so we throttle harder than /submit.
  const limit = await rateLimit(`trace:${ip}`, 3, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many traces. Please try again in an hour." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSec) },
      },
    );
  }

  type Body = {
    chain?: string;
    rootAddress?: string;
    submitterEmail?: string;
    victimLabel?: string;
    lossUsd?: number;
    lossTokenSymbol?: string;
    maxHops?: number;
    turnstileToken?: string;
  };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Turnstile bot-defense — same shape as /submit, /subscribe, /vote/start.
  // /trace is the most Etherscan-budget-expensive endpoint we expose (100k
  // free-tier req/day). A botnet without Turnstile drains the daily quota
  // in an hour; with it, the attacker has to solve a challenge per trace.
  const captcha = await verifyTurnstileToken(body.turnstileToken, ip);
  if (!captcha.ok) {
    return NextResponse.json({ error: captcha.error }, { status: 400 });
  }

  const chain = (body.chain ?? "ethereum").toLowerCase();
  if (chain !== "ethereum") {
    return NextResponse.json(
      { error: "v1 supports ethereum mainnet only." },
      { status: 400 },
    );
  }

  const rootAddress = (body.rootAddress ?? "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(rootAddress)) {
    return NextResponse.json(
      { error: "rootAddress must be a 0x-prefixed 40-char hex string" },
      { status: 400 },
    );
  }

  const email = (body.submitterEmail ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "submitterEmail is required and must look like an email" },
      { status: 400 },
    );
  }

  const maxHops = Math.max(
    1,
    Math.min(3, Math.trunc(Number(body.maxHops ?? 3))),
  );

  const victimLabel = (body.victimLabel ?? "").trim().slice(0, 200) || null;
  const lossTokenSymbol =
    (body.lossTokenSymbol ?? "").trim().toUpperCase().slice(0, 16) || null;
  const lossUsd =
    typeof body.lossUsd === "number" && Number.isFinite(body.lossUsd)
      ? Math.max(0, body.lossUsd)
      : null;

  // 24-hour dedupe on (chain, rootAddress, submitterEmail). Without this,
  // refresh-on-result-page or accidental form-resubmit creates an
  // ever-growing pile of identical traces — each one burns Etherscan budget
  // and clutters the public /trace listing. If we find a recent live trace,
  // return its publicId so the client lands on the same result page.
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [existing] = await db
    .select({ id: hackTraces.id, publicId: hackTraces.publicId })
    .from(hackTraces)
    .where(
      and(
        eq(hackTraces.chain, chain),
        sql`lower(${hackTraces.rootAddress}) = ${rootAddress}`,
        sql`lower(${hackTraces.submitterEmail}) = ${email}`,
        gt(hackTraces.createdAt, dayAgo),
        inArray(hackTraces.status, [
          "pending",
          "running",
          "complete",
        ] as const),
      ),
    )
    .limit(1);
  if (existing) {
    return NextResponse.json({
      ok: true,
      publicId: existing.publicId,
      resultUrl: `/trace/${existing.publicId}`,
      deduped: true,
    });
  }

  // Insert the trace row first so we always have a publicId to return even
  // if the runner blows up. The runner is awaited below; the row gets
  // updated to running → complete/failed before we respond.
  const [inserted] = await db
    .insert(hackTraces)
    .values({
      chain,
      rootAddress,
      victimLabel,
      lossUsd: lossUsd != null ? lossUsd.toFixed(2) : null,
      lossTokenSymbol,
      submitterEmail: email,
      submitterIp: ip,
      maxHops,
    })
    .returning({ id: hackTraces.id, publicId: hackTraces.publicId });

  if (!inserted) {
    return NextResponse.json(
      { error: "Failed to create trace row" },
      { status: 500 },
    );
  }

  try {
    await runTrace(inserted.id);
  } catch (err) {
    // runTrace handles its own DB updates for failure paths; this catch is
    // a final safety net so the HTTP request always returns cleanly.
    const reason =
      err instanceof Error ? err.message : "unknown tracer error";
    await db
      .update(hackTraces)
      .set({
        status: "failed",
        failureReason: reason,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(hackTraces.id, inserted.id));
  }

  return NextResponse.json({
    ok: true,
    publicId: inserted.publicId,
    resultUrl: `/trace/${inserted.publicId}`,
  });
}
