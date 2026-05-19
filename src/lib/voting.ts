import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, intelVotes } from "@/lib/db";

// One subscriber can vote at most this many times per UTC month, across
// every approved intel. Cap is enforced in both /vote/cast (cookie path)
// and /vote/confirm (magic-link path) so neither route is a bypass.
export const MONTHLY_VOTE_CAP = 3;

// Returns [startOfMonth, startOfNextMonth) in UTC for the given instant.
// Month windows are UTC so the cap doesn't reset based on user timezone.
export function monthBoundsUtc(at: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const start = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return { start, end };
}

export async function countMonthlyVotes(
  subscriberId: string,
  at: Date = new Date(),
): Promise<number> {
  const { start, end } = monthBoundsUtc(at);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(intelVotes)
    .where(
      and(
        eq(intelVotes.subscriberId, subscriberId),
        gte(intelVotes.votedAt, start),
        lt(intelVotes.votedAt, end),
      ),
    );
  return row?.n ?? 0;
}
