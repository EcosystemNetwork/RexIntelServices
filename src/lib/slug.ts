/**
 * URL slugging for public detail routes.
 *
 * Route folders stay as `[publicId]` (Next.js doesn't care about the folder
 * name, only the param name), but the segment now accepts either:
 *   - the legacy bare id form: `abc123def456789a` (16 hex chars)
 *   - the slug-prefixed form:  `zuzalu-2026-abc123def456789a`
 *
 * The detail page parses the trailing 16 hex chars as the real publicId and
 * 301-redirects bare/mismatched segments to the canonical slug-prefixed URL
 * so old email/SERP links keep working but eventually settle on the slugged
 * canonical for ranking and CTR.
 *
 * publicId itself is generated as `encode(gen_random_bytes(8), 'hex')` in
 * Postgres — see submissions.publicId default in schema.
 */

const PUBLIC_ID_RE = /^[0-9a-f]{16}$/i;
const TAIL_PUBLIC_ID_RE = /-([0-9a-f]{16})$/i;

/**
 * Convert a free-form title to a URL-safe slug. Strips diacritics, lower-
 * cases, collapses non-alphanumeric runs to single dashes, caps at 80 chars.
 * Returns "" when the input has no slug-worthy characters.
 */
export function slugify(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/**
 * Extract the 16-hex publicId from a URL segment, accepting both legacy and
 * slugged forms. Returns null when the segment doesn't end with a valid id.
 */
export function parsePublicId(segment: string): string | null {
  const trimmed = decodeURIComponent(segment ?? "").trim();
  if (PUBLIC_ID_RE.test(trimmed)) return trimmed.toLowerCase();
  const match = trimmed.match(TAIL_PUBLIC_ID_RE);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Build the canonical segment for a (publicId, title) pair. Falls back to
 * the bare publicId when the title produces no usable slug.
 */
export function detailSegment(
  publicId: string,
  title: string | null | undefined,
): string {
  const slug = slugify(title);
  return slug ? `${slug}-${publicId}` : publicId;
}

/**
 * Build the full path for a detail page. Use this everywhere a detail link
 * is constructed so the slug stays consistent across listings, sitemap, RSS,
 * and outbound emails.
 */
export function detailHref(
  prefix: string,
  publicId: string,
  title: string | null | undefined,
): string {
  const cleanPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return `${cleanPrefix}/${detailSegment(publicId, title)}`;
}
