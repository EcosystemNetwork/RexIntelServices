import { cookies } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { db, intelVotes } from "@/lib/db";
import { VOTER_COOKIE_NAME, verifyVoterCookie } from "@/lib/voter-cookie";
import { VoteButton } from "@/components/vote-button";
import { PrizePoolBanner } from "@/app/intel/_lanes/signals";

/**
 * Server component that renders the prize-pool context + vote button stack
 * for any community submission detail page. The intel page composes the
 * banner and button directly (it has more surrounding conversion stack); the
 * other 8 lane detail pages render this single block at the bottom of the
 * article so the monthly prize pool is reachable from every submission type.
 *
 * Loads the submission's vote count and the viewer's already-voted state in
 * one round trip. Caller passes the submission row id and publicId so we
 * don't re-query submissions — the detail page already has them in hand.
 */
export async function SubmissionVoteStack({
  submissionId,
  publicId,
}: {
  submissionId: string;
  publicId: string;
}) {
  const voterCookieRaw = cookies().get(VOTER_COOKIE_NAME)?.value;
  const voterSubscriberId = verifyVoterCookie(voterCookieRaw);

  const [[voteRow], existingVote] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(intelVotes)
      .where(eq(intelVotes.submissionId, submissionId)),
    voterSubscriberId
      ? db
          .select({ submissionId: intelVotes.submissionId })
          .from(intelVotes)
          .where(
            and(
              eq(intelVotes.submissionId, submissionId),
              eq(intelVotes.subscriberId, voterSubscriberId),
            ),
          )
          .limit(1)
      : Promise.resolve([] as { submissionId: string }[]),
  ]);

  const voteCount = voteRow?.count ?? 0;
  const alreadyVoted = existingVote.length > 0;

  return (
    <div className="mt-8 space-y-6">
      <PrizePoolBanner />
      <VoteButton
        publicId={publicId}
        initialCount={voteCount}
        initialVoted={alreadyVoted}
      />
    </div>
  );
}
