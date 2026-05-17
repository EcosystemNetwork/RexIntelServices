/**
 * Cache tags used to invalidate Next.js Data Cache entries that depend on
 * submission data. Listing pages wrap their Drizzle calls in `unstable_cache`
 * with these tags; any admin/submitter write path that mutates a row visible
 * to the public must call `revalidateTag(SUBMISSIONS_TAG)` to flush them.
 *
 * Keep the tag set small on purpose — a single SUBMISSIONS_TAG means every
 * approval/edit/feature toggle revalidates every listing, which is exactly
 * what we want for a low-write-volume directory. If write volume ever grows
 * enough that this becomes wasteful, split into per-type tags.
 */
export const SUBMISSIONS_TAG = "submissions";

/**
 * Default TTL for cached listing queries. Acts as a backstop in case a tag
 * invalidation is somehow missed — caches refresh on their own within this
 * window even without an explicit revalidate.
 */
export const LISTING_REVALIDATE_SEC = 300;
