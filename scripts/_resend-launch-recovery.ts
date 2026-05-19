/**
 * One-shot recovery for the inaugural newsletter send (campaign id
 * bd289052-0cba-4ffe-9935-22d95e736404). The first run hit Resend's free-tier
 * daily quota after 132 deliveries; the remaining 3,500 recipients have rows
 * in `sends` with status='failed' and the campaign is marked status='sent'.
 *
 * Steps:
 *   1. Delete the failed sends rows so getRecipients() picks them back up
 *   2. Flip the campaign status back to 'draft' (sender throws on 'sent')
 *   3. Re-run sendCampaign(id) to drain the remaining recipients
 *
 * The 132 successfully delivered rows (status in sent/opened/clicked) stay
 * intact, so they won't be re-emailed — same campaign id keeps the analytics
 * stacked on one dashboard.
 */
import "./_load-env";

import { and, eq } from "drizzle-orm";
import { db, campaigns, sends } from "../src/lib/db";
import { sendCampaign } from "../src/lib/email/sender";

const CAMPAIGN_ID = "bd289052-0cba-4ffe-9935-22d95e736404";

async function main() {
  console.log("=".repeat(60));
  console.log("Launch recovery — campaign", CAMPAIGN_ID);
  console.log("=".repeat(60));

  const deleted = await db
    .delete(sends)
    .where(and(eq(sends.campaignId, CAMPAIGN_ID), eq(sends.status, "failed")))
    .returning({ id: sends.id });
  console.log(`Cleared ${deleted.length} failed sends rows.`);

  await db
    .update(campaigns)
    .set({ status: "draft", sentAt: null, updatedAt: new Date() })
    .where(eq(campaigns.id, CAMPAIGN_ID));
  console.log("Reset campaign status: sent → draft");
  console.log("");

  console.log("Re-firing sendCampaign() — already-delivered rows stay skipped.");
  console.log("(50k/day Pro tier should drain ~3.5k in ~40s)");
  console.log("");

  const t0 = Date.now();
  const result = await sendCampaign(CAMPAIGN_ID);
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);

  await db
    .update(campaigns)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(eq(campaigns.id, CAMPAIGN_ID));

  console.log("=".repeat(60));
  console.log("RECOVERY COMPLETE");
  console.log("=".repeat(60));
  console.log(`elapsed:   ${elapsedSec}s`);
  console.log(`queued:    ${result.totalQueued}`);
  console.log(`sent:      ${result.totalSent}`);
  console.log(`failed:    ${result.totalFailed}`);
  console.log(`remaining: ${result.remaining}`);
  console.log(`complete:  ${result.complete}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
