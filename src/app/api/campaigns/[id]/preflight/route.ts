import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, sql } from "drizzle-orm";
import {
  db,
  campaigns,
  subscribers,
  subscriberTags,
  suppressions,
  sends,
} from "@/lib/db";
import { requireOperator } from "@/lib/auth";

/**
 * GET /api/campaigns/[id]/preflight
 *
 * Production pre-send checklist. At 6k+ recipients, blasting without these
 * checks is how senders end up in Gmail's spam folder permanently. Run this
 * from the composer before showing the Send button.
 *
 * Each result has severity: 'ok' | 'warn' | 'block'. A single 'block' is
 * enough to disable the Send button; the UI surfaces 'warn' as visible
 * yellow flags but doesn't gate sending.
 */

export type PreflightSeverity = "ok" | "warn" | "block";
export interface PreflightCheck {
  id: string;
  label: string;
  severity: PreflightSeverity;
  message: string;
}

// Conservative spam-trigger word list. Not exhaustive — the goal is to
// catch obvious red flags ("FREE!!", "$$$"), not score every subject the
// way Spamassassin would.
const SPAM_TRIGGER_PATTERNS = [
  /\bfree\s*!{2,}/i,
  /\$\${2,}/,
  /\bclick\s+here\s+now\b/i,
  /\b(buy|order)\s+now\s*!{2,}/i,
  /\bguarantee(d)?\b.*\b(money|cash)\b/i,
  /\b100%\s+free\b/i,
  /\bact\s+now\b.*!{2,}/i,
];

const ROLE_ACCOUNT_PREFIXES = [
  "postmaster",
  "abuse",
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "admin",
  "root",
  "webmaster",
  "support",
];

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, params.id))
    .limit(1);
  if (!campaign) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const checks: PreflightCheck[] = [];

  // ---- 1. Sender domain verified ----
  const fromDomain = (campaign.fromEmail.split("@")[1] ?? "").toLowerCase();
  const verifiedRaw = process.env.RESEND_VERIFIED_DOMAINS ?? "";
  const verifiedSet = new Set(
    verifiedRaw
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!fromDomain) {
    checks.push({
      id: "from_domain",
      label: "From email",
      severity: "block",
      message: "From email is missing or malformed.",
    });
  } else if (verifiedSet.size === 0) {
    checks.push({
      id: "from_domain",
      label: "Sender domain",
      severity: "warn",
      message: `RESEND_VERIFIED_DOMAINS not set — can't confirm ${fromDomain} is authorized. Configure SPF/DKIM/DMARC in Resend, then add to env.`,
    });
  } else if (!verifiedSet.has(fromDomain)) {
    checks.push({
      id: "from_domain",
      label: "Sender domain",
      severity: "block",
      message: `${fromDomain} is not in RESEND_VERIFIED_DOMAINS. Send will be rejected or land in spam. Verify the domain in Resend first.`,
    });
  } else {
    checks.push({
      id: "from_domain",
      label: "Sender domain",
      severity: "ok",
      message: `${fromDomain} verified.`,
    });
  }

  // ---- 2. Subject hygiene ----
  if (!campaign.subject?.trim()) {
    checks.push({
      id: "subject",
      label: "Subject line",
      severity: "block",
      message: "Subject is empty.",
    });
  } else {
    const triggered = SPAM_TRIGGER_PATTERNS.filter((re) =>
      re.test(campaign.subject),
    );
    if (triggered.length > 0) {
      checks.push({
        id: "subject",
        label: "Subject line",
        severity: "warn",
        message: `Subject contains spam-trigger patterns. Rewrite to avoid all-caps + exclamation stacks.`,
      });
    } else if (campaign.subject.length > 100) {
      checks.push({
        id: "subject",
        label: "Subject line",
        severity: "warn",
        message: `Subject is ${campaign.subject.length} chars — Gmail truncates around 70.`,
      });
    } else {
      checks.push({
        id: "subject",
        label: "Subject line",
        severity: "ok",
        message: "Subject looks clean.",
      });
    }
  }

  // ---- 3. Preview text ----
  if (!campaign.previewText?.trim()) {
    checks.push({
      id: "preview_text",
      label: "Inbox preview text",
      severity: "warn",
      message:
        "Preview text is empty. Inbox preview will show the first line of body — usually a clipped greeting.",
    });
  } else {
    checks.push({
      id: "preview_text",
      label: "Inbox preview text",
      severity: "ok",
      message: "Preview text set.",
    });
  }

  // ---- 4. Body has content + no merge-tag in suspicious places ----
  if (!campaign.htmlBody?.trim()) {
    checks.push({
      id: "body",
      label: "Email body",
      severity: "block",
      message: "Body is empty.",
    });
  } else {
    checks.push({
      id: "body",
      label: "Email body",
      severity: "ok",
      message: `${Math.round(campaign.htmlBody.length / 1024)}KB. Unsubscribe + tracking pixel are injected at send time.`,
    });
  }

  // ---- 5. Recipient set + list hygiene ----
  const targetTags = (campaign.targetTagIds ?? []) as string[];

  let recipientEmails: string[] = [];
  let alreadySentCount = 0;
  let suppressedCount = 0;
  if (targetTags.length > 0) {
    const rows = await db
      .selectDistinct({ id: subscriberTags.subscriberId })
      .from(subscriberTags)
      .where(sql`${subscriberTags.tagId} = ANY(${targetTags})`);
    const candidateIds = rows.map((r) => r.id);
    if (candidateIds.length > 0) {
      const subs = await db
        .select({ id: subscribers.id, email: subscribers.email })
        .from(subscribers)
        .where(
          and(
            eq(subscribers.status, "active"),
            sql`${subscribers.id} = ANY(${candidateIds})`,
          ),
        );
      recipientEmails = subs.map((s) => s.email);
    }
  } else {
    const subs = await db
      .select({ email: subscribers.email })
      .from(subscribers)
      .where(eq(subscribers.status, "active"));
    recipientEmails = subs.map((s) => s.email);
  }

  // Drop suppressed + already-sent for accurate count
  const suppressedRows = await db.select({ email: suppressions.email }).from(suppressions);
  const suppressedSet = new Set(
    suppressedRows.map((r) => r.email.toLowerCase()),
  );
  const beforeSuppression = recipientEmails.length;
  recipientEmails = recipientEmails.filter(
    (e) => !suppressedSet.has(e.toLowerCase()),
  );
  suppressedCount = beforeSuppression - recipientEmails.length;

  const alreadySentRows = await db
    .select({ id: sends.subscriberId })
    .from(sends)
    .where(eq(sends.campaignId, params.id));
  alreadySentCount = alreadySentRows.length;

  const finalRecipientCount = Math.max(0, recipientEmails.length - alreadySentCount);

  if (finalRecipientCount === 0) {
    checks.push({
      id: "recipients",
      label: "Audience",
      severity: "block",
      message:
        "No deliverable recipients. Either the list is empty, fully suppressed, or already sent this campaign.",
    });
  } else {
    checks.push({
      id: "recipients",
      label: "Audience",
      severity: "ok",
      message: `${finalRecipientCount.toLocaleString()} will receive. ${suppressedCount.toLocaleString()} suppressed${alreadySentCount > 0 ? `, ${alreadySentCount.toLocaleString()} already sent` : ""}.`,
    });
  }

  // ---- 6. Role accounts ----
  const roleHits = recipientEmails.filter((e) => {
    const local = e.split("@")[0]?.toLowerCase() ?? "";
    return ROLE_ACCOUNT_PREFIXES.some(
      (p) => local === p || local.startsWith(`${p}+`) || local.startsWith(`${p}.`),
    );
  });
  if (roleHits.length > 0) {
    checks.push({
      id: "role_accounts",
      label: "Role accounts",
      severity: "warn",
      message: `${roleHits.length} role-account address${roleHits.length === 1 ? "" : "es"} in audience (postmaster@, abuse@, etc.). These are deliverability traps — consider excluding.`,
    });
  } else {
    checks.push({
      id: "role_accounts",
      label: "Role accounts",
      severity: "ok",
      message: "No role accounts in audience.",
    });
  }

  // ---- 7. Cold list / sudden volume spike ----
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentImports = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(subscribers)
    .where(
      and(
        eq(subscribers.status, "active"),
        gt(subscribers.createdAt, dayAgo),
      ),
    );
  const recentCount = recentImports[0]?.count ?? 0;
  if (recentCount > 100 && recentCount > finalRecipientCount * 0.5) {
    checks.push({
      id: "cold_list",
      label: "List warm-up",
      severity: "warn",
      message: `${recentCount.toLocaleString()} subscribers were added in the last 24h — this is a cold list. Slow-ramp recommended to protect sender reputation.`,
    });
  } else {
    checks.push({
      id: "cold_list",
      label: "List warm-up",
      severity: "ok",
      message: "List has settled history.",
    });
  }

  // ---- 8. Webhook secret configured ----
  const hasWebhook = !!process.env.RESEND_WEBHOOK_SECRET;
  checks.push({
    id: "webhook",
    label: "Resend webhook",
    severity: hasWebhook ? "ok" : "warn",
    message: hasWebhook
      ? "Bounce + complaint auto-suppression wired."
      : "RESEND_WEBHOOK_SECRET is not set — hard bounces and complaints won't auto-suppress. Reputation risk at scale.",
  });

  const hasBlocker = checks.some((c) => c.severity === "block");

  return NextResponse.json({
    ok: !hasBlocker,
    checks,
    recipientCount: finalRecipientCount,
  });
}
