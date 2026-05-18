import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createHash } from "node:crypto";
import { and, eq, isNull, gt, sql } from "drizzle-orm";
import {
  db,
  voteTokens,
  subscribers,
  intelVotes,
  submissions,
  submitters,
} from "@/lib/db";
import type { IntelPayload } from "@/lib/db/schema";
import { detailHref } from "@/lib/slug";
import { absoluteUrl } from "@/lib/site-url";
import {
  VOTER_COOKIE_NAME,
  VOTER_COOKIE_MAX_AGE_SEC,
  buildVoterCookie,
} from "@/lib/voter-cookie";
import { SUBMISSIONS_TAG } from "@/lib/cache";

/**
 * GET /api/intel/vote/confirm/[token]
 *
 * Consumes a one-time vote token: marks it used (atomically, so concurrent
 * clicks can't double-consume), upserts the subscriber (creating one if
 * needed with source="vote"), inserts the intel_votes row, sets a signed
 * voter cookie so this browser doesn't need to re-magic-link for 30 days,
 * then 302s to the intel detail page with a status query.
 *
 * Token is single-use AND single-claim: the CLAIM is the atomic UPDATE
 * with RETURNING — two simultaneous clicks race on the UPDATE and only
 * one wins. The token in the URL is hashed (sha256) and compared against
 * the stored hash, so a DB leak doesn't yield live voting power.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: { token: string } },
) {
  const tokenStr = ctx.params.token;
  if (!tokenStr || tokenStr.length < 16 || tokenStr.length > 128) {
    return redirectToHome("invalid");
  }

  const tokenHash = sha256(tokenStr);
  const now = new Date();

  // Atomic single-step claim: flip used_at to NOW only for an unclaimed,
  // unexpired token matching the hash. RETURNING gives us the row we
  // claimed — concurrent clicks lose the race and get an empty result.
  const [claimed] = await db
    .update(voteTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(voteTokens.tokenHash, tokenHash),
        isNull(voteTokens.usedAt),
        gt(voteTokens.expiresAt, now),
      ),
    )
    .returning({
      id: voteTokens.id,
      email: voteTokens.email,
      submissionId: voteTokens.submissionId,
    });

  if (!claimed) {
    return redirectToHome("invalid");
  }

  // Look up the intel — token claim doesn't validate intel status, so we
  // recheck here. If the intel was un-approved between vote-start and
  // confirm, we leave the token marked used (deliberately — replay would
  // hit the same wall) and bounce the user.
  const [intel] = await db
    .select({
      id: submissions.id,
      publicId: submissions.publicId,
      payload: submissions.payload,
      status: submissions.status,
      submitterEmail: submissions.submitterEmail,
    })
    .from(submissions)
    .where(eq(submissions.id, claimed.submissionId))
    .limit(1);

  if (!intel || intel.status !== "approved") {
    return redirectToHome("invalid");
  }

  // Self-voting block — same as /vote/cast. Compare on lower-cased email.
  if (
    intel.submitterEmail &&
    intel.submitterEmail.toLowerCase() === claimed.email.toLowerCase()
  ) {
    return redirectToHome("invalid");
  }

  // Ban gate — if the email belongs to a bounty-banned submitter, refuse
  // to record the vote. The token is already consumed, by design.
  const [bannedSubmitter] = await db
    .select({ bannedAt: submitters.bountyBannedAt })
    .from(submitters)
    .where(sql`lower(${submitters.email}) = lower(${claimed.email})`)
    .limit(1);
  if (bannedSubmitter?.bannedAt) {
    return redirectToHome("invalid");
  }

  // Upsert subscriber. We deliberately set status="active" on the new row —
  // the vote is implicit consent to receive briefings. Same model as
  // newsletter signup; users can unsubscribe later from any digest.
  const [existing] = await db
    .select({ id: subscribers.id, status: subscribers.status })
    .from(subscribers)
    .where(eq(subscribers.email, claimed.email))
    .limit(1);

  let subscriberId: string;
  if (existing) {
    subscriberId = existing.id;
    if (existing.status === "unsubscribed") {
      await db
        .update(subscribers)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(subscribers.id, existing.id));
    }
  } else {
    const [created] = await db
      .insert(subscribers)
      .values({
        email: claimed.email,
        source: "vote",
        status: "active",
      })
      .returning({ id: subscribers.id });
    subscriberId = created.id;
  }

  // Insert the vote. onConflictDoNothing handles the case where the same
  // subscriber confirms two tokens for the same intel — the second is a
  // no-op, no error.
  await db
    .insert(intelVotes)
    .values({
      submissionId: claimed.submissionId,
      subscriberId,
    })
    .onConflictDoNothing();

  // Bust the cached intel listing so the new count is visible next time the
  // page revalidates. Safe — submissions tag is the same one /api/submit busts.
  try {
    revalidateTag(SUBMISSIONS_TAG);
  } catch {
    // revalidateTag throws if called outside a request context, but a route
    // handler is one. The catch is paranoia.
  }

  const headline = (intel.payload as IntelPayload).headline ?? "intel";
  const target = absoluteUrl(
    `${detailHref("/intel", intel.publicId, headline)}?voted=1`,
  );

  const cookie = buildVoterCookie(subscriberId);
  const res = NextResponse.redirect(target, 302);
  if (cookie) {
    res.cookies.set(VOTER_COOKIE_NAME, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      // strict: this cookie auths the /vote/cast endpoint which moves real
      // money. We don't want third-party sites to be able to trigger a
      // POST that carries this cookie under any flow.
      sameSite: "strict",
      path: "/",
      maxAge: VOTER_COOKIE_MAX_AGE_SEC,
    });
  }
  return res;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function redirectToHome(status: string): NextResponse {
  return NextResponse.redirect(absoluteUrl(`/intel?vote=${status}`), 302);
}
