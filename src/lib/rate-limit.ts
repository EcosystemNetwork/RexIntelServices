import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiter with two backends:
 *
 *   1. Upstash Redis — used when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *      (or Vercel's KV_REST_API_URL + KV_REST_API_TOKEN) are set. Shared across
 *      every serverless instance, which is the only way IP-based limits actually
 *      hold under Vercel's horizontal scaling.
 *
 *   2. In-process Map — used otherwise. Fine for local dev and acceptable for
 *      low-volume public endpoints, but bypassable in production at scale because
 *      each lambda instance has its own bucket.
 *
 * The public API is async in both cases so callers can `await` regardless of
 * which backend is wired up.
 */

type Result = { ok: boolean; retryAfterSec: number };

// ─── Upstash backend ─────────────────────────────────────────────────

function readUpstashEnv(): { url: string; token: string } | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ??
    process.env.KV_REST_API_URL ??
    null;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    process.env.KV_REST_API_TOKEN ??
    null;
  if (!url || !token) return null;
  return { url, token };
}

// Cache the Ratelimit instances by (max, windowMs) — Upstash recommends a
// single client per limiter to keep round-trips warm.
const upstashCache = new Map<string, Ratelimit>();

function getUpstashLimiter(max: number, windowMs: number): Ratelimit | null {
  const env = readUpstashEnv();
  if (!env) return null;

  const cacheKey = `${max}:${windowMs}`;
  const cached = upstashCache.get(cacheKey);
  if (cached) return cached;

  // Sliding-window approximation. More accurate than fixed-window when
  // requests cluster around the boundary, costs the same one Redis op.
  const limiter = new Ratelimit({
    redis: new Redis({ url: env.url, token: env.token }),
    limiter: Ratelimit.slidingWindow(max, `${windowMs} ms`),
    analytics: false,
    prefix: "rex:rl",
  });
  upstashCache.set(cacheKey, limiter);
  return limiter;
}

async function upstashLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<Result | null> {
  const limiter = getUpstashLimiter(max, windowMs);
  if (!limiter) return null;
  const r = await limiter.limit(key);
  if (r.success) return { ok: true, retryAfterSec: 0 };
  const retryAfterSec = Math.max(
    1,
    Math.ceil((r.reset - Date.now()) / 1000),
  );
  return { ok: false, retryAfterSec };
}

// ─── In-memory fallback ──────────────────────────────────────────────

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt < now) buckets.delete(key);
  }
}

function inMemoryLimit(key: string, max: number, windowMs: number): Result {
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

// ─── Public API ──────────────────────────────────────────────────────

export async function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<Result> {
  // Try Upstash first. If it errors (network blip, transient 5xx) fall back
  // to in-memory rather than 500'ing the legit request — limits being soft
  // for a moment is preferable to blocking real users.
  try {
    const r = await upstashLimit(key, max, windowMs);
    if (r) return r;
  } catch (e) {
    console.warn("[rate-limit] Upstash error, falling back to in-memory:", e);
  }
  return inMemoryLimit(key, max, windowMs);
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
