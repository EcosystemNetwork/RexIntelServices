/**
 * Run with: npx tsx scripts/seed-intel-rexintel-email-suspended.ts
 *
 * Inserts the RexIntel editorial-inbox suspension notice as a featured
 * incident-class intel row at the top of /intel. Idempotent — matches on
 * the headline, so re-running updates the body without changing publicId
 * or breaking inbound links.
 *
 * Anonymous source by design (RexIntel publishes anonymously). The byline
 * renders as "Anonymous source" in the UI and "Rex Intel Services
 * (Anonymous source)" in the article JSON-LD.
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { IntelPayload } from "../src/lib/db/schema";

const HEADLINE =
  "Google has suspended RexIntel's editorial inbox without stating a cause";

const body = [
  "On 2026-05-18, Google suspended the Google account that RexIntel's investigations desk uses as its editorial inbox. No cause has been disclosed to the publication. No prior warning was issued. An appeal was filed the same day; Google has confirmed receipt and stated the review window is \"most requests take 2 business days,\" though some take longer.",
  "",
  "We are publishing this as a fact-of-record, not as an accusation. We do not at this time assert that any specific party caused the suspension, that it was retaliatory, or that it relates to any specific story RexIntel has published or is preparing. We do not have that evidence. What we have is an account in good standing one day and locked out the next, no stated reason, and an investigations desk currently mid-publication on multiple pieces involving named corporate entities.",
  "",
  "Google's appeal-confirmation email, received at 1:03 AM PT on 2026-05-18, is reproduced verbatim below.",
  "",
  "## Google's appeal-confirmation message (verbatim)",
  "",
  "> **From:** notify-noreply@google.com",
  "> **Sent:** Mon, May 18, 2026 at 1:03 AM",
  "> **Subject:** Appeal received",
  ">",
  "> Google Accounts",
  ">",
  "> Thank you for contacting us about restoring access to your Google Account.",
  ">",
  "> Google will review your appeal as soon as possible. Most requests take 2 business days to review, but some might take longer.",
  ">",
  "> You may be able to download your data from some Google services. To get started, sign in to your account. If your account is eligible, you'll see a link to download your data.",
  ">",
  "> Thanks for your patience.",
  ">",
  "> *You received this message because someone provided this as the contact email address for an appeal. If you didn't submit an appeal, you may disregard this message.*",
  ">",
  "> © 2025 Google Inc., 1600 Amphitheatre Parkway, Mountain View, CA 94043, USA",
  "",
  "## What this means operationally",
  "",
  "RexIntel's tip line, source-protection channels, and pre-publication correspondence with named subjects all routed through the suspended inbox at various points. Any source who has emailed that address in the last 72 hours should assume the message was not received, and is invited to re-send through the channels listed below.",
  "",
  "Pending Google's review, all editorial correspondence is being routed to alternative infrastructure outside the Google Workspace stack. The investigations desk remains fully operational. The publication schedule is unaffected.",
  "",
  "## Why we are putting this on the record",
  "",
  "Independent investigative outlets that publish without institutional backing depend on consumer-grade platforms — email, hosting, DNS, payment — that can be withdrawn unilaterally, at any time, with no obligation to state a reason. That dependency is a load-bearing weakness of the model, and one that publications operating at our scale rarely document publicly when it happens to them. We are documenting it here because doing so is consistent with what we ask of the entities we investigate: explain yourself on the record, on the timeline of the events, with the receipts attached.",
  "",
  "If Google's review restores access, we will update this article. If it does not, we will update it with whatever Google states as the cause, and we will continue publishing through alternative channels. Either way, the inbox suspension is now part of the public record of RexIntel's operating environment in May 2026.",
  "",
  "## If you have seen this pattern",
  "",
  "If you operate or have operated an independent investigative outlet, a whistleblower-receiving channel, or an OSINT publication that has had a consumer email account suspended without disclosed cause in 2025 or 2026 — particularly while pursuing a story involving a named corporate or state-affiliated entity — we want to compare notes. Anonymous tip lane: see /submit. Signal and Matrix contacts are being stood up and will be linked from /about within the week.",
  "",
  "— RexIntel Investigations Desk",
  "2026-05-18",
].join("\n");

const payload: IntelPayload = {
  headline: HEADLINE,
  kind: "incident",
  category: "Press freedom",
  severity: "high",
  anonymous: true,
  bodyFormat: "markdown",
  body,
  sourceGrade: "primary",
  sources: [
    "https://support.google.com/accounts/answer/40695",
  ],
};

async function main() {
  const now = new Date();
  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(
      sql`${submissions.type} = 'intel' AND ${submissions.payload}->>'headline' = ${HEADLINE}`,
    )
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    await db
      .update(submissions)
      .set({
        payload,
        status: "approved",
        featured: true,
        publishedAt: now,
        updatedAt: now,
        submitterHandle: "RexIntel",
      })
      .where(eq(submissions.id, row.id));
    console.log(`Updated existing notice row (id=${row.id}, publicId=${row.publicId})`);
    console.log(`  /intel/${row.publicId}`);
  } else {
    const [inserted] = await db
      .insert(submissions)
      .values({
        type: "intel",
        status: "approved",
        payload,
        submitterHandle: "RexIntel",
        publishedAt: now,
        featured: true,
      })
      .returning({ id: submissions.id, publicId: submissions.publicId });
    console.log(`Inserted notice (id=${inserted.id}, publicId=${inserted.publicId})`);
    console.log(`  /intel/${inserted.publicId}`);
  }

  console.log(`\nFeatured at the top of /intel signals lane.`);
  console.log(`Body length: ${body.length} chars`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
