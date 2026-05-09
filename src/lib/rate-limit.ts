/**
 * Tiny in-memory rate limiter, keyed by an arbitrary string (e.g. IP address).
 *
 * This is intentionally simple — it lives in the process memory of whichever
 * serverless instance handled the request. That means in a horizontally-scaled
 * deployment one attacker could still get N×instances requests through. For a
 * public landing-page signup endpoint that's an acceptable trade-off; for
 * anything more sensitive, swap in Upstash Redis / Vercel KV.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Periodic cleanup so the map doesn't grow unbounded under sustained traffic.
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt < now) buckets.delete(key);
  }
}

export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  if (bucket.count >= max) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count++;
  return { ok: true, retryAfterSec: 0 };
}

/**
 * Pull the best-effort client IP from a Next.js request. Falls back to a
 * sentinel so unidentifiable requests still share a bucket and can't bypass
 * limits by stripping headers.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
