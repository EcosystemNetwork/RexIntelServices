/**
 * CLI test-sender. Two modes:
 *
 *   1. Campaign mode (mirrors POST /api/campaigns/[id]/test-send) — reads a
 *      draft row from the DB and renders its htmlBody.
 *   2. Template mode (--template) — renders a code-defined template from
 *      src/lib/email/templates/ directly, no DB row required.
 *
 * Both modes prepend the TEST SEND banner, prefix `[TEST]` on the subject,
 * apply placeholder merge tags, and skip tracking. They never touch
 * campaigns / sends / suppressions.
 *
 * Run:
 *   npx tsx scripts/test-send-campaign.ts --list
 *   npx tsx scripts/test-send-campaign.ts --list-templates
 *   npx tsx scripts/test-send-campaign.ts <campaignId> ericnans@gmail.com
 *   npx tsx scripts/test-send-campaign.ts latest ericnans@gmail.com,me@x.com
 *   npx tsx scripts/test-send-campaign.ts --template newsletter-launch ericnans@gmail.com
 *   npx tsx scripts/test-send-campaign.ts --template newsletter-launch ericnans@gmail.com --name Rex
 *
 * `latest` resolves to the most recently updated draft. Up to 5 recipients,
 * comma-separated. Requires RESEND_API_KEY + DATABASE_URL in .env.
 *
 * Sender defaults to "Rex Intel <intel@rexintelservices.com>" (matches the
 * verified Resend domain used by automations.ts). Override with --from / --from-name.
 */
import "dotenv/config";
import { desc, eq } from "drizzle-orm";
import { Resend } from "resend";
import { db, campaigns } from "../src/lib/db";
import { TEMPLATES, getTemplate } from "../src/lib/email/templates";

const DEFAULT_FROM_EMAIL = "intel@rexintelservices.com";
const DEFAULT_FROM_NAME = "Rex Intel";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Args = {
  list: boolean;
  listTemplates: boolean;
  templateId: string | null;
  campaignId: string | null;
  recipients: string[];
  previewName: string;
  fromEmail: string;
  fromName: string;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const positional: string[] = [];
  let previewName = "Alex";
  let list = false;
  let listTemplates = false;
  let templateId: string | null = null;
  let fromEmail = DEFAULT_FROM_EMAIL;
  let fromName = DEFAULT_FROM_NAME;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") list = true;
    else if (a === "--list-templates") listTemplates = true;
    else if (a === "--template") templateId = argv[++i] ?? null;
    else if (a === "--name") previewName = argv[++i] ?? previewName;
    else if (a === "--from") fromEmail = argv[++i] ?? fromEmail;
    else if (a === "--from-name") fromName = argv[++i] ?? fromName;
    else positional.push(a);
  }
  // In template mode, the first positional is the recipient list (no campaignId).
  // In campaign mode, first positional is the campaignId, second is recipients.
  const campaignId = templateId ? null : positional[0] ?? null;
  const recipientArg = templateId ? positional[0] : positional[1];
  const recipients = (recipientArg ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 5);
  return {
    list,
    listTemplates,
    templateId,
    campaignId,
    recipients,
    previewName,
    fromEmail,
    fromName,
  };
}

async function listDrafts() {
  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      subject: campaigns.subject,
      status: campaigns.status,
      updatedAt: campaigns.updatedAt,
    })
    .from(campaigns)
    .orderBy(desc(campaigns.updatedAt))
    .limit(20);
  if (rows.length === 0) {
    console.log("no campaigns found");
    return;
  }
  console.log("recent campaigns:");
  for (const r of rows) {
    console.log(
      `  ${r.id}  [${r.status}]  ${r.name}  — "${r.subject}"  (${r.updatedAt.toISOString()})`,
    );
  }
}

async function resolveCampaignId(idArg: string): Promise<string | null> {
  if (idArg !== "latest") return idArg;
  const [row] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.status, "draft"))
    .orderBy(desc(campaigns.updatedAt))
    .limit(1);
  return row?.id ?? null;
}

function applyTags(s: string, name: string): string {
  const safeName = name.slice(0, 64);
  return s
    .replace(/\{\{\s*firstName\s*\}\}/g, safeName)
    .replace(/\{\{\s*lastName\s*\}\}/g, "")
    .replace(/\{\{\s*email\s*\}\}/g, "test@example.com");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main() {
  const args = parseArgs();

  if (args.list) {
    await listDrafts();
    return;
  }

  if (args.listTemplates) {
    console.log("templates:");
    for (const t of TEMPLATES) {
      console.log(`  ${t.id}  [${t.category}]  ${t.name}`);
    }
    return;
  }

  if (args.recipients.length === 0 || (!args.campaignId && !args.templateId)) {
    console.error(
      "usage: tsx scripts/test-send-campaign.ts <campaignId|latest> <email[,email...]> [--name First]",
    );
    console.error(
      "       tsx scripts/test-send-campaign.ts --template <id> <email[,email...]> [--name First]",
    );
    console.error("       tsx scripts/test-send-campaign.ts --list");
    console.error("       tsx scripts/test-send-campaign.ts --list-templates");
    process.exit(1);
  }

  for (const e of args.recipients) {
    if (!EMAIL_REGEX.test(e)) {
      console.error(`invalid email: ${e}`);
      process.exit(1);
    }
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("RESEND_API_KEY is not set");
    process.exit(1);
  }

  let subject: string;
  let htmlBody: string;
  let replyTo: string | undefined;
  let label: string;

  if (args.templateId) {
    const tpl = getTemplate(args.templateId);
    if (!tpl) {
      console.error(
        `template "${args.templateId}" not found — try --list-templates`,
      );
      process.exit(1);
    }
    subject = tpl.subject;
    htmlBody = tpl.htmlBody;
    label = `template "${tpl.name}" (${tpl.id})`;
  } else {
    const resolvedId = await resolveCampaignId(args.campaignId!);
    if (!resolvedId) {
      console.error(`no campaign found for "${args.campaignId}"`);
      process.exit(1);
    }
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, resolvedId))
      .limit(1);
    if (!campaign) {
      console.error(`campaign ${resolvedId} not found`);
      process.exit(1);
    }
    subject = campaign.subject;
    htmlBody = campaign.htmlBody;
    replyTo = campaign.replyTo ?? undefined;
    // Campaign-mode overrides sender from the row itself, matching the API endpoint.
    args.fromEmail = campaign.fromEmail;
    args.fromName = campaign.fromName;
    label = `campaign "${campaign.name}" (${campaign.id})`;
  }

  const previewSubject = applyTags(subject, args.previewName);
  const previewHtml =
    `<div style="background:#fef3c7;color:#78350f;padding:12px 16px;font-family:system-ui;font-size:13px;border-bottom:1px solid #fbbf24;">
      <strong>TEST SEND</strong> — ${escapeHtml(label)}. Tracking disabled.
    </div>` + applyTags(htmlBody, args.previewName);

  const resend = new Resend(key);
  const result = await resend.emails.send({
    from: `${args.fromName} <${args.fromEmail}>`,
    to: args.recipients,
    subject: `[TEST] ${previewSubject}`,
    html: previewHtml,
    replyTo,
  });

  if (result.error) {
    console.error(`send failed: ${result.error.message ?? "unknown"}`);
    process.exit(1);
  }

  console.log(`✓ sent ${label}`);
  console.log(`  from: ${args.fromName} <${args.fromEmail}>`);
  console.log(`  to: ${args.recipients.join(", ")}`);
  console.log(`  resend id: ${result.data?.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
