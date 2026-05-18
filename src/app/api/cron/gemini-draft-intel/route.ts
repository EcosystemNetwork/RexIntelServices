import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { runGeminiEditor } from "@/lib/harvesters/gemini-editor";

/**
 * GET /api/cron/gemini-draft-intel
 *
 * Daily 14:00 UTC. Reads the DefiLlama hacks feed, picks up to 5 fresh
 * high-amount events the corpus hasn't already covered, and asks Gemini Pro
 * to draft an editorial-grade incident body. Drafts land in `submissions`
 * as `status='pending'` — curators approve before publish.
 *
 * Auth: standard Vercel cron bearer-token gate via CRON_SECRET.
 *
 * Distinct from /api/cron/import-defillama-hacks (Sunday 23:00, auto-
 * publishes templated stubs ≥$500k) — this runs daily, drafts narratives
 * for events ≥$1M, and requires editorial sign-off.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Each Gemini Pro call ~10-20s; up to 5 drafts per run → ~60-100s. Cap at
// 300s to give headroom for an upstream DefiLlama timeout.
export const maxDuration = 300;

export async function GET(req: Request) {
  const fail = verifyCronSecret(req);
  if (fail) return NextResponse.json(fail.body, { status: fail.status });

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "GEMINI_API_KEY not configured" },
      { status: 500 },
    );
  }

  try {
    const result = await runGeminiEditor();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { ok: false, error: reason },
      { status: 500 },
    );
  }
}
