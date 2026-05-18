import type { BountyStatus } from "./db";

/**
 * Bounty statuses that surface on the public listing. draft/funded are
 * private (victim hasn't yet attested) and refunded/expired drop off so
 * the public page doesn't carry stale-offer noise. Imported by both the
 * /api/bounties list route and the /api/bounties/[publicId] detail route.
 *
 * Lives in lib/ because Next.js App Router route files can only export
 * specific names (GET/POST/etc + config consts). A previous version
 * exported these from /api/bounties/route.ts and broke the prod build.
 */
export const DEFAULT_VISIBLE_STATUSES: BountyStatus[] = [
  "open",
  "adjudicating",
  "paid",
];

export function isPubliclyVisible(status: BountyStatus): boolean {
  return DEFAULT_VISIBLE_STATUSES.includes(status);
}
