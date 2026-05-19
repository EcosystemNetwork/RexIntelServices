import { Resend } from "resend";
import { eq, and, inArray, notInArray, sql } from "drizzle-orm";
import {
  db,
  campaigns,
  subscribers,
  sends,
  suppressions,
  subscriberTags,
  segments,
  type Campaign,
} from "../db";
import { renderCampaignForRecipient } from "./render";
import { sendCreditEmails } from "./credit-emails";
import { resolveSegment } from "../segments";

// Lazy-initialize so importing this module doesn't throw when RESEND_API_KEY
// is unset (e.g. during the cron route's auth check, or local dev without
// email configured). The error surfaces only when something actually sends.
let _resend: Resend | null = null;
function getResend(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is not set — cannot send. Add it to .env / Vercel env.",
    );
  }
  _resend = new Resend(key);
  return _resend;
}

// Resend free tier: 100 emails/day, 2 req/sec
// Pro tier: 50k/day, 10 req/sec.
// We batch-send and sleep between batches to stay safely under limits.
const BATCH_SIZE = 100; // Resend supports batched send
const DELAY_BETWEEN_BATCHES_MS = 1100; // > 1s to be polite

const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";

/**
 * Build the recipient list for a campaign, excluding:
 * - subscribers not in "active" status
 * - subscribers on the suppression list
 * - subscribers we've already sent this campaign to
 */
async function getRecipients(campaign: Campaign): Promise<string[]> {
  // Already-sent subscriber IDs for this campaign (so re-runs resume correctly)
  const alreadySent = await db
    .select({ id: sends.subscriberId })
    .from(sends)
    .where(eq(sends.campaignId, campaign.id));
  const alreadySentIds = alreadySent.map((r) => r.id);

  // Global suppression list (hard bounces, complaints, manual blocks). Stored
  // by email rather than subscriber id, so we filter in JS after the SQL pass.
  const suppressedRows = await db
    .select({ email: suppressions.email })
    .from(suppressions);
  const suppressedEmails = new Set(suppressedRows.map((r) => r.email.toLowerCase()));

  // Resolve the candidate set. Order of precedence:
  //   1. segmentId set  → live-resolve the saved segment's filter
  //   2. tags set        → tag-union (any of the listed tags) [legacy path]
  //   3. neither         → every active subscriber is a candidate
  let candidateIds: string[] | null = null;
  if (campaign.segmentId) {
    const [seg] = await db
      .select()
      .from(segments)
      .where(eq(segments.id, campaign.segmentId))
      .limit(1);
    if (!seg) {
      throw new Error(
        `Campaign ${campaign.id} references missing segment ${campaign.segmentId}`,
      );
    }
    candidateIds = await resolveSegment(seg.filterJson);
    if (candidateIds.length === 0) return [];
  } else {
    const targetTags = (campaign.targetTagIds ?? []) as string[];
    if (targetTags.length > 0) {
      const rows = await db
        .selectDistinct({ id: subscriberTags.subscriberId })
        .from(subscriberTags)
        .where(inArray(subscriberTags.tagId, targetTags));
      candidateIds = rows.map((r) => r.id);
      if (candidateIds.length === 0) return [];
    }
  }

  // One unified query — applies status, tag-membership (if any), and the
  // already-sent exclusion in SQL; suppression list is filtered in JS below.
  const rows = await db
    .select({ id: subscribers.id, email: subscribers.email })
    .from(subscribers)
    .where(
      and(
        eq(subscribers.status, "active"),
        candidateIds !== null ? inArray(subscribers.id, candidateIds) : sql`true`,
        alreadySentIds.length > 0
          ? notInArray(subscribers.id, alreadySentIds)
          : sql`true`,
      ),
    );

  return rows
    .filter((r) => !suppressedEmails.has(r.email.toLowerCase()))
    .map((r) => r.id);
}

export interface SendCampaignOptions {
  /**
   * Run at most this many batches (each ≤BATCH_SIZE recipients), then return
   * without marking the campaign as `sent`. The remaining recipients stay in
   * the pool for the next worker tick. Used by `/api/cron/continue-sending`
   * to keep individual ticks well inside the 300s Vercel function ceiling.
   *
   * When undefined, the function runs every remaining batch (legacy behavior).
   */
  maxBatches?: number;
}

export interface SendCampaignResult {
  totalQueued: number;
  totalSent: number;
  totalFailed: number;
  /**
   * True when every recipient has been processed in this invocation
   * (so the caller can mark the campaign as `sent`). False when the
   * worker yielded mid-list because maxBatches was hit.
   */
  complete: boolean;
  /** Remaining recipient count after this invocation. */
  remaining: number;
}

/**
 * Send a campaign. Designed to be safely re-runnable AND incrementally
 * resumable: callers can pass `maxBatches` to yield after a chunk, letting a
 * cron-driven worker stream through tens of thousands of recipients across
 * many ticks without ever hitting a serverless timeout.
 *
 * The campaign is marked `sent` only when the full recipient list is drained.
 * Mid-flight invocations leave `status='sending'` so the next worker tick
 * picks it up.
 */
export async function sendCampaign(
  campaignId: string,
  options: SendCampaignOptions = {},
): Promise<SendCampaignResult> {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
  if (campaign.status === "sent") {
    throw new Error("Campaign already sent");
  }

  // Mark as sending + stamp progress-start the first time we touch it.
  // progress_started_at being null means "no worker has claimed this yet".
  // We don't overwrite it on subsequent ticks — stuck-detection in the
  // cron sweeper uses this exact moment.
  await db
    .update(campaigns)
    .set({
      status: "sending",
      progressStartedAt: campaign.progressStartedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campaignId));

  const allRecipientIds = await getRecipients(campaign);

  // Snapshot full audience size on the very first claim. AB or not, this
  // is the denominator for progress / done-detection from here on.
  if ((campaign.recipientCount ?? 0) === 0) {
    // alreadySent is empty on first claim, so allRecipientIds IS the full
    // audience. For continuing ticks, recipientCount is preserved from this
    // initial set so progress math stays consistent across A/B phases.
    await db
      .update(campaigns)
      .set({ recipientCount: allRecipientIds.length })
      .where(eq(campaigns.id, campaignId));
  }

  // ---- A/B phase logic ----
  // SAMPLE → WAIT → FINAL. Each cron tick picks the phase by inspecting
  // sentCount, abSampleSize, and abWinnerPickedAt; the sender stays a pure
  // function from (campaign state, recipient pool) → batch behavior.
  const abEnabled =
    !!campaign.subjectB && (campaign.abSampleSize ?? 0) > 0;
  const sentSoFar = campaign.sentCount ?? 0;
  const sampleSize = abEnabled ? campaign.abSampleSize ?? 0 : 0;

  const inWaitPhase =
    abEnabled && !campaign.abWinnerPickedAt && sentSoFar >= sampleSize;
  if (inWaitPhase) {
    // The sample has been fully sent. The winner-pick worker will fire once
    // the wait window elapses; until then, this campaign sits idle. Return
    // a non-complete result so the cron keeps it in `sending`.
    console.log(
      `[campaign ${campaignId}] A/B sample drained — waiting for winner pick`,
    );
    return {
      totalQueued: allRecipientIds.length,
      totalSent: 0,
      totalFailed: 0,
      complete: false,
      remaining: allRecipientIds.length,
    };
  }

  let recipientIds = allRecipientIds;
  let abAssignments: Map<string, "a" | "b"> | null = null;

  if (abEnabled && !campaign.abWinnerPickedAt) {
    // SAMPLE PHASE: this tick can send up to (sampleSize - sentSoFar) more.
    const remainingSample = Math.max(0, sampleSize - sentSoFar);
    recipientIds = allRecipientIds.slice(0, remainingSample);
    // Deterministic A/B split across the global sample index.
    abAssignments = new Map(
      recipientIds.map((id, idx) => [
        id,
        (sentSoFar + idx) % 2 === 0 ? "a" : "b",
      ]),
    );
  }
  // else: NORMAL or FINAL phase — send `recipientIds` as-is with
  // abWinnerSubject (when present) overriding campaign.subject below.

  console.log(
    `[campaign ${campaignId}] ${recipientIds.length} recipients in this tick` +
      (options.maxBatches ? ` (max ${options.maxBatches} batches)` : "") +
      (abAssignments ? " — A/B sample" : "") +
      (campaign.abWinnerPickedAt ? " — A/B final" : ""),
  );

  let totalSent = 0;
  let totalFailed = 0;
  const maxBatches = options.maxBatches ?? Number.POSITIVE_INFINITY;
  let batchesRun = 0;

  for (let i = 0; i < recipientIds.length; i += BATCH_SIZE) {
    if (batchesRun >= maxBatches) break;
    batchesRun++;
    const batchIds = recipientIds.slice(i, i + BATCH_SIZE);
    const batchSubs = await db
      .select()
      .from(subscribers)
      .where(inArray(subscribers.id, batchIds));

    // Insert "queued" send rows up-front so we can get IDs to embed in tracking links.
    // ON CONFLICT prevents duplicates if the job is re-run.
    const inserted = await db
      .insert(sends)
      .values(
        batchSubs.map((s) => ({
          campaignId,
          subscriberId: s.id,
          status: "queued" as const,
          abVariant: abAssignments?.get(s.id) ?? null,
        })),
      )
      .onConflictDoNothing()
      .returning();

    const sendIdBySubscriber = new Map(
      inserted.map((row) => [row.subscriberId, row.id]),
    );

    // Build the per-recipient payloads
    const payloads = await Promise.all(
      batchSubs
        .filter((s) => sendIdBySubscriber.has(s.id))
        .map(async (sub) => {
          const sendId = sendIdBySubscriber.get(sub.id)!;
          const { html, text } = await renderCampaignForRecipient({
            campaign,
            subscriber: sub,
            sendId,
            baseUrl: BASE_URL,
          });
          // Subject: variant-aware in the sample phase, winner in the rest.
          const variant = abAssignments?.get(sub.id);
          const subjectForRecipient = variant === "b"
            ? campaign.subjectB ?? campaign.subject
            : campaign.abWinnerPickedAt && campaign.abWinnerSubject
              ? campaign.abWinnerSubject
              : campaign.subject;
          return {
            sendId,
            subscriberId: sub.id,
            from: `${campaign.fromName} <${campaign.fromEmail}>`,
            to: [sub.email],
            subject: applyMergeTags(subjectForRecipient, sub),
            html,
            text,
            replyTo: campaign.replyTo ?? undefined,
            headers: {
              // RFC 8058 one-click unsubscribe - critical for Gmail/Yahoo bulk sender rules.
              "List-Unsubscribe": `<${BASE_URL}/api/unsubscribe/${sub.unsubscribeToken}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          };
        }),
    );

    // Send via Resend's batch endpoint (one HTTP call for up to 100 emails).
    try {
      const result = await getResend().batch.send(
        payloads.map(({ sendId, subscriberId, ...p }) => p),
      );

      if (result.error) {
        console.error("[batch send] Resend error:", result.error);
        // Mark all in batch as failed
        for (const p of payloads) {
          await db
            .update(sends)
            .set({
              status: "failed",
              errorMessage: JSON.stringify(result.error),
            })
            .where(eq(sends.id, p.sendId));
          totalFailed++;
        }
      } else {
        const data = (result.data?.data ?? []) as Array<{ id?: string }>;
        for (let j = 0; j < payloads.length; j++) {
          const providerMessageId = data[j]?.id;
          await db
            .update(sends)
            .set({
              status: "sent",
              providerMessageId: providerMessageId ?? null,
              sentAt: new Date(),
            })
            .where(eq(sends.id, payloads[j].sendId));
          totalSent++;
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[batch send] Exception:", msg);
      for (const p of payloads) {
        await db
          .update(sends)
          .set({ status: "failed", errorMessage: msg })
          .where(eq(sends.id, p.sendId));
        totalFailed++;
      }
    }

    // The aggregate sentCount bump happens once at end-of-tick, below.
    // Within a single tick (≤30s for the cron worker, ≤4s for the user-
    // triggered fast path) there is nothing for a poller to observe
    // between batches, so per-batch DB writes are pure overhead.

    if (i + BATCH_SIZE < recipientIds.length && batchesRun < maxBatches) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  // Did this invocation drain every recipient in the full audience? In the
  // A/B sample phase, draining `recipientIds` (the sample slice) is NOT
  // completion — the post-sample winner-final phase still has to ship.
  // So `complete` is judged against allRecipientIds and overridden by the
  // AB phase machine.
  const processed = Math.min(maxBatches * BATCH_SIZE, recipientIds.length);
  const drainedThisTick = processed >= recipientIds.length;
  const stillSampling =
    abEnabled && !campaign.abWinnerPickedAt;
  const remainingFinal = Math.max(
    0,
    allRecipientIds.length - (sentSoFar + processed),
  );
  const complete = drainedThisTick && !stillSampling && remainingFinal === 0;
  const remaining = stillSampling
    ? allRecipientIds.length - (sentSoFar + processed)
    : remainingFinal;
  const now = new Date();

  // Aggregate counters across ticks. sentCount is sum-of-progress; the
  // per-tick `totalSent` is added to whatever was already on the row.
  await db
    .update(campaigns)
    .set({
      sentCount: sql`COALESCE(${campaigns.sentCount}, 0) + ${totalSent}`,
      updatedAt: now,
    })
    .where(eq(campaigns.id, campaignId));

  let finalStatus: "sending" | "sent" | "failed" = "sending";
  if (complete) {
    // Read post-update aggregates to know whether the whole campaign failed.
    const [row] = await db
      .select({
        sentCount: campaigns.sentCount,
        recipientCount: campaigns.recipientCount,
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    const totalEverSent = row?.sentCount ?? 0;
    const everRecipients = row?.recipientCount ?? 0;
    finalStatus = totalEverSent === 0 && everRecipients > 0 ? "failed" : "sent";

    await db
      .update(campaigns)
      .set({
        status: finalStatus,
        sentAt: now,
        updatedAt: now,
      })
      .where(eq(campaigns.id, campaignId));

    // Submitter-credit emails — only when the campaign actually went out.
    if (finalStatus === "sent") {
      try {
        const sentCampaign = { ...campaign, sentAt: now, status: "sent" as const };
        const credit = await sendCreditEmails(sentCampaign);
        console.log(
          `[campaign ${campaignId}] credit emails: ${credit.sent}/${credit.attempted} sent, ${credit.failed} failed`,
        );
      } catch (err) {
        console.error(`[campaign ${campaignId}] credit-email hook failed:`, err);
      }
    }
  }

  return {
    totalQueued: recipientIds.length,
    totalSent,
    totalFailed,
    complete,
    remaining,
  };
}

function applyMergeTags(s: string, sub: { firstName: string | null }): string {
  return s.replace(/\{\{\s*firstName\s*\}\}/g, sub.firstName ?? "there");
}
