import { eq, sql } from "drizzle-orm";
import { db, intelAddresses, submissions } from "./db";
import { awardContributionPoints } from "./circle-auth";

/**
 * Award `intel_cited` credit when a newly-approved submission references
 * an address that a prior approved submission (by a different submitter)
 * was first to flag. One award per unique prior submitter, not per shared
 * address — capped so a single investigation citing fifty of one tipster's
 * prior addresses doesn't dump 50pts in one go.
 *
 * Idempotency is best-effort: callers should only invoke this on the first
 * pending → approved transition (the review routes already gate on that).
 * If the same submission is somehow re-processed, the same prior submitters
 * will get a second +1 each — acceptable risk given the small per-event
 * value and the existing single-shot guard upstream.
 */
export const MAX_CITATION_AWARDS_PER_SUBMISSION = 5;

export async function awardCitationCredit(args: {
  submissionId: string;
  awardedByUserId?: string;
}): Promise<{ awardedCount: number }> {
  // Resolve current submission's submitter so we never self-cite, then
  // find DISTINCT prior submitterIds that linked to any of this row's
  // addresses. The join chain: intel_addresses (current) ↔ intel_addresses
  // (prior, same addressId, different submission) → submissions (prior).
  const [current] = await db
    .select({ submitterId: submissions.submitterId })
    .from(submissions)
    .where(eq(submissions.id, args.submissionId))
    .limit(1);
  if (!current?.submitterId) {
    // Anonymous or missing — citation is meaningless without an owner to
    // exclude from the prior-author set.
    return { awardedCount: 0 };
  }

  const priorAuthors = await db.execute<{ submitter_id: string }>(sql`
    SELECT DISTINCT s.submitter_id
    FROM ${intelAddresses} cur
    JOIN ${intelAddresses} prior
      ON prior.address_id = cur.address_id
     AND prior.submission_id <> cur.submission_id
    JOIN ${submissions} s ON s.id = prior.submission_id
    WHERE cur.submission_id = ${args.submissionId}
      AND s.status = 'approved'
      AND s.submitter_id IS NOT NULL
      AND s.submitter_id <> ${current.submitterId}
    LIMIT ${MAX_CITATION_AWARDS_PER_SUBMISSION}
  `);

  let awardedCount = 0;
  for (const row of priorAuthors.rows ?? []) {
    const priorSubmitterId = row.submitter_id;
    if (!priorSubmitterId) continue;
    try {
      await awardContributionPoints({
        submitterId: priorSubmitterId,
        kind: "intel_cited",
        submissionId: args.submissionId,
        awardedByUserId: args.awardedByUserId,
        notes: `Cited by submission ${args.submissionId}`,
      });
      awardedCount += 1;
    } catch (err) {
      console.warn(
        `[citation-awards] failed to award citation credit to ${priorSubmitterId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { awardedCount };
}
