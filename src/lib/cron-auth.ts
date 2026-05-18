import { timingSafeEqual } from "crypto";

/**
 * Bearer-token verification for Vercel cron routes. Use this everywhere
 * instead of inline `!==` comparisons — the inline pattern shipped across
 * 11 non-bounty crons before the pre-mainnet audit and is timing-leaky.
 *
 * Returns null when authorized; otherwise a 401-shape error object the
 * caller can return verbatim:
 *
 *   const fail = verifyCronSecret(req);
 *   if (fail) return NextResponse.json(fail.body, { status: fail.status });
 */
export type CronAuthFailure = {
  status: 401 | 500;
  body: { ok: false; error: string };
};

export function verifyCronSecret(req: Request): CronAuthFailure | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return {
      status: 500,
      body: { ok: false, error: "CRON_SECRET not configured" },
    };
  }
  const expectedHeader = `Bearer ${expected}`;
  const presented = req.headers.get("authorization") ?? "";
  // timingSafeEqual requires equal lengths — short-circuit unequal lengths
  // to a dummy compare against the expected header so the failure latency
  // doesn't reveal a length match.
  const expectedBuf = Buffer.from(expectedHeader);
  const presentedBuf = Buffer.from(
    presented.length === expectedHeader.length ? presented : expectedHeader,
  );
  const lenOk = presented.length === expectedHeader.length;
  const bytesOk = timingSafeEqual(expectedBuf, presentedBuf);
  if (!lenOk || !bytesOk) {
    return { status: 401, body: { ok: false, error: "unauthorized" } };
  }
  return null;
}
