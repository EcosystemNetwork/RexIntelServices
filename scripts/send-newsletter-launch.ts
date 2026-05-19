/**
 * One-shot: insert the newsletter-launch template as a real campaign row and
 * fire it through the production send pipeline (src/lib/email/sender.ts).
 *
 * Differences from scripts/test-send-campaign.ts (which is the test-sender):
 *   - No [TEST] subject prefix, no yellow banner
 *   - Renderer injects merge tags, click tracking, open pixel, and
 *     CAN-SPAM-compliant unsubscribe footer per recipient
 *   - Respects the suppression list and skips already-sent recipients
 *   - Status transitions: draft → sending → sent (campaigns row tracked)
 *   - Recipient count / sent count / etc. populate for /campaigns analytics
 *
 * Run:
 *   npx tsx scripts/send-newsletter-launch.ts --dry-run
 *   npx tsx scripts/send-newsletter-launch.ts
 *
 * --dry-run prints what would happen (audience size, subject, sender) and
 * exits WITHOUT inserting the campaign row or sending anything. Pass nothing
 * to actually fire.
 */
import "./_load-env";

import { eq, sql } from "drizzle-orm";
import { db, campaigns, subscribers, suppressions } from "../src/lib/db";
import { newsletterLaunch } from "../src/lib/email/templates/newsletter-launch";
import { sendCampaign } from "../src/lib/email/sender";

const FROM_NAME = process.env.DIGEST_FROM_NAME ?? "Rex Intel Services";
const FROM_EMAIL = process.env.DIGEST_FROM_EMAIL ?? "briefing@rexintelservices.com";
const REPLY_TO = "rexintelservices@proton.me";
const CAMPAIGN_NAME = "Issue 001 — Newsletter launch · ETHConf";

async function preflight() {
  const [active] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(subscribers)
    .where(eq(subscribers.status, "active"));
  const [supp] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(suppressions);
  return { activeCount: Number(active?.n ?? 0), suppressionCount: Number(supp?.n ?? 0) };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("=".repeat(60));
  console.log("Newsletter launch — production send pipeline");
  console.log("=".repeat(60));
  console.log(`from:        ${FROM_NAME} <${FROM_EMAIL}>`);
  console.log(`reply-to:    ${REPLY_TO}`);
  console.log(`subject:     ${newsletterLaunch.subject}`);
  console.log(`preview:     ${newsletterLaunch.previewText}`);
  console.log(`name:        ${CAMPAIGN_NAME}`);
  console.log(`htmlBody:    ${newsletterLaunch.htmlBody.length.toLocaleString()} chars`);

  const counts = await preflight();
  console.log("");
  console.log(`audience:    ${counts.activeCount} active subscribers`);
  console.log(`suppressed:  ${counts.suppressionCount}`);
  console.log("");

  if (dryRun) {
    console.log("DRY RUN — no campaign row inserted, no emails sent.");
    return;
  }

  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY missing. Aborting.");
    process.exit(1);
  }

  console.log("Inserting campaign row…");
  const [inserted] = await db
    .insert(campaigns)
    .values({
      name: CAMPAIGN_NAME,
      subject: newsletterLaunch.subject,
      fromName: FROM_NAME,
      fromEmail: FROM_EMAIL,
      replyTo: REPLY_TO,
      previewText: newsletterLaunch.previewText,
      htmlBody: newsletterLaunch.htmlBody,
      status: "draft",
      targetTagIds: [],
      segmentId: null,
    })
    .returning({ id: campaigns.id });

  if (!inserted) {
    console.error("Insert failed.");
    process.exit(1);
  }
  console.log(`Campaign id: ${inserted.id}`);
  console.log("");
  console.log("Streaming sends through the production worker…");
  console.log("(batches of 100 with 1.1s gaps — ~40s wall time for 3.6k)");
  console.log("");

  const t0 = Date.now();
  const result = await sendCampaign(inserted.id);
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);

  await db
    .update(campaigns)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(eq(campaigns.id, inserted.id));

  console.log("=".repeat(60));
  console.log("SEND COMPLETE");
  console.log("=".repeat(60));
  console.log(`elapsed:     ${elapsedSec}s`);
  console.log(`queued:      ${result.totalQueued}`);
  console.log(`sent:        ${result.totalSent}`);
  console.log(`failed:      ${result.totalFailed}`);
  console.log(`remaining:   ${result.remaining}`);
  console.log(`complete:    ${result.complete}`);
  console.log("");
  console.log(`Analytics:   https://www.rexintelservices.com/campaigns/${inserted.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
