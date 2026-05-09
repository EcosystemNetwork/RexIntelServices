import { Resend } from "resend";
import { eq, and, inArray, notInArray, sql } from "drizzle-orm";
import {
  db,
  campaigns,
  subscribers,
  sends,
  suppressions,
  subscriberTags,
  type Campaign,
} from "../db";
import { renderCampaignForRecipient } from "./render";
import { sendCreditEmails } from "./credit-emails";

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

  // Resolve the candidate set by tag intersection (or "all active" if no tags).
  // null means "no tag filter — every active subscriber is a candidate".
  const targetTags = (campaign.targetTagIds ?? []) as string[];
  let candidateIds: string[] | null = null;
  if (targetTags.length > 0) {
    const rows = await db
      .selectDistinct({ id: subscriberTags.subscriberId })
      .from(subscriberTags)
      .where(inArray(subscriberTags.tagId, targetTags));
    candidateIds = rows.map((r) => r.id);
    if (candidateIds.length === 0) return [];
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

/**
 * Send a campaign. Designed to be safely re-runnable: if it crashes halfway,
 * calling it again will only send to remaining recipients.
 *
 * For a real production system, you'd run this from a background worker
 * (e.g. a long-running Node process, Inngest, Trigger.dev, or BullMQ).
 * For 5-50k subscribers this is totally fine to invoke from an API route
 * if your hosting allows long requests, but Vercel serverless caps at 60s
 * on Hobby and 300s on Pro - so consider self-hosting or a worker.
 */
export async function sendCampaign(campaignId: string): Promise<{
  totalQueued: number;
  totalSent: number;
  totalFailed: number;
}> {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
  if (campaign.status === "sent") {
    throw new Error("Campaign already sent");
  }

  // Mark as sending
  await db
    .update(campaigns)
    .set({ status: "sending", updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));

  const recipientIds = await getRecipients(campaign);
  console.log(
    `[campaign ${campaignId}] sending to ${recipientIds.length} recipients`,
  );

  await db
    .update(campaigns)
    .set({ recipientCount: recipientIds.length })
    .where(eq(campaigns.id, campaignId));

  let totalSent = 0;
  let totalFailed = 0;

  for (let i = 0; i < recipientIds.length; i += BATCH_SIZE) {
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
          return {
            sendId,
            subscriberId: sub.id,
            from: `${campaign.fromName} <${campaign.fromEmail}>`,
            to: [sub.email],
            subject: applyMergeTags(campaign.subject, sub),
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

    // Update running totals on the campaign row
    await db
      .update(campaigns)
      .set({
        sentCount: totalSent,
      })
      .where(eq(campaigns.id, campaignId));

    if (i + BATCH_SIZE < recipientIds.length) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  const finalStatus = totalFailed === recipientIds.length ? "failed" : "sent";
  const sentAt = new Date();
  await db
    .update(campaigns)
    .set({
      status: finalStatus,
      sentAt,
      sentCount: totalSent,
      updatedAt: sentAt,
    })
    .where(eq(campaigns.id, campaignId));

  // Submitter-credit emails — only when the campaign actually went out.
  // Wrapped so a transactional-email failure can never fail the campaign
  // result we return to the caller (worst case: a creditable submitter
  // doesn't get their thank-you email; the briefing itself still shipped).
  if (finalStatus === "sent") {
    try {
      const sentCampaign = { ...campaign, sentAt, status: "sent" as const };
      const credit = await sendCreditEmails(sentCampaign);
      console.log(
        `[campaign ${campaignId}] credit emails: ${credit.sent}/${credit.attempted} sent, ${credit.failed} failed`,
      );
    } catch (err) {
      console.error(`[campaign ${campaignId}] credit-email hook failed:`, err);
    }
  }

  return {
    totalQueued: recipientIds.length,
    totalSent,
    totalFailed,
  };
}

function applyMergeTags(s: string, sub: { firstName: string | null }): string {
  return s.replace(/\{\{\s*firstName\s*\}\}/g, sub.firstName ?? "there");
}
