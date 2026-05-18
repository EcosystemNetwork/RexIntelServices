/**
 * Canonical absolute site URL. Used everywhere we need to emit fully
 * qualified URLs to external consumers (sitemap, RSS, OG tags, JSON-LD).
 * Override via NEXT_PUBLIC_SITE_URL; falls back to the rexintelservices.com
 * apex (matches the bot UA in event-parser.ts and the actual deployment).
 *
 * Always returns a value without a trailing slash so callers can safely
 * concatenate with paths.
 */
export function siteUrl(): string {
  // In production NEXT_PUBLIC_SITE_URL must be set. Falling back to
  // VERCEL_URL silently rebases the canonical origin onto a per-deploy
  // hostname, which breaks isSameOrigin's allowlist (CSRF guard rejects
  // legitimate same-origin POSTs) AND lands magic-link OTP URLs in
  // emails pointing at a URL that 404s after the next deploy. Fail loud.
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.NEXT_PUBLIC_SITE_URL
  ) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must be set in production. Set it to the canonical apex (https://rexintelservices.com).",
    );
  }
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_URL ??
    "https://rexintelservices.com";
  const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

/**
 * Build an absolute URL for a given path. Path may start with "/" or not;
 * the result is always a single absolute URL with no double slashes.
 */
export function absoluteUrl(path: string): string {
  const base = siteUrl();
  if (!path) return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
