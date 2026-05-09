import { Resend } from "resend";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, submissions, type Campaign } from "@/lib/db";
import type { IntelPayload, EventPayload } from "@/lib/db/schema";

/**
 * Send "your submission ran" credit emails for everyone whose intel/event
 * was bundled into a campaign that just shipped. Best-effort — failures
 * here are logged but never fail the parent campaign send.
 *
 * Anonymous intel rows have submitterEmail=null (enforced server-side at
 * submission time), so they're naturally excluded by the WHERE clause.
 */
export async function sendCreditEmails(campaign: Campaign): Promise<{
  attempted: number;
  sent: number;
  failed: number;
}> {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[credit] RESEND_API_KEY not set — skipping credit emails");
    return { attempted: 0, sent: 0, failed: 0 };
  }

  const featured = await db
    .select({
      type: submissions.type,
      publicId: submissions.publicId,
      payload: submissions.payload,
      submitterEmail: submissions.submitterEmail,
      submitterHandle: submissions.submitterHandle,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.featuredInCampaignId, campaign.id),
        isNotNull(submissions.submitterEmail),
      ),
    );

  if (featured.length === 0) {
    return { attempted: 0, sent: 0, failed: 0 };
  }

  const resend = new Resend(apiKey);
  const issueDate = campaign.sentAt ?? new Date();
  const dateLabel = issueDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const fromAddress = `${campaign.fromName} <${campaign.fromEmail}>`;

  let sent = 0;
  let failed = 0;

  for (const f of featured) {
    if (!f.submitterEmail) continue;

    const isIntel = f.type === "intel";
    const headline = isIntel
      ? (f.payload as IntelPayload).headline
      : (f.payload as EventPayload).name;
    const url = `${baseUrl}/${isIntel ? "intel" : "events"}/${f.publicId}`;

    const greeting = f.submitterHandle ? `Operator @${f.submitterHandle},` : "Operator,";
    const subject = isIntel
      ? `Your intel ran in the ${dateLabel} briefing`
      : `Your event ran in the ${dateLabel} briefing`;

    const html = renderCreditHtml({
      greeting,
      kind: isIntel ? "intel" : "event",
      headline,
      url,
      baseUrl,
    });
    const text = renderCreditText({
      greeting,
      kind: isIntel ? "intel" : "event",
      headline,
      url,
      baseUrl,
    });

    try {
      const result = await resend.emails.send({
        from: fromAddress,
        to: [f.submitterEmail],
        subject,
        html,
        text,
        replyTo: campaign.replyTo ?? undefined,
      });
      if (result.error) {
        console.error(
          `[credit] Resend error for ${f.submitterEmail}:`,
          result.error,
        );
        failed++;
      } else {
        sent++;
      }
    } catch (err) {
      console.error(`[credit] Exception for ${f.submitterEmail}:`, err);
      failed++;
    }
  }

  return { attempted: featured.length, sent, failed };
}

function renderCreditHtml(args: {
  greeting: string;
  kind: "intel" | "event";
  headline: string;
  url: string;
  baseUrl: string;
}): string {
  const { greeting, kind, headline, url, baseUrl } = args;
  return `
<div style="background:#0a0a0f;padding:32px 16px;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#111118;border:1px solid #1e1e28;border-radius:6px;">
    <tr>
      <td style="padding:28px;">
        <div style="font:600 10px/1 ui-monospace,monospace;letter-spacing:0.22em;text-transform:uppercase;color:#5fb91f;margin-bottom:14px;">▸ Source Acknowledged</div>
        <div style="font:400 14px/1.6 ui-sans-serif,system-ui,sans-serif;color:#e8e8ef;margin-bottom:14px;">${escape(greeting)}</div>
        <div style="font:400 14px/1.6 ui-sans-serif,system-ui,sans-serif;color:#8888a0;margin-bottom:18px;">
          Your ${kind} <strong style="color:#fff;">"${escape(headline)}"</strong> shipped in this week's RexIntel briefing.
        </div>
        <div style="margin:22px 0;">
          <a href="${url}" style="display:inline-block;padding:10px 16px;background:#5fb91f;color:#0a0a0f;text-decoration:none;font:600 11px/1 ui-monospace,monospace;letter-spacing:0.14em;text-transform:uppercase;border-radius:3px;">Read it live ▸</a>
        </div>
        <div style="font:400 13px/1.6 ui-sans-serif,system-ui,sans-serif;color:#8888a0;border-top:1px solid #1e1e28;padding-top:18px;margin-top:24px;">
          Keep them coming. The wire is open: <a href="${baseUrl}/submit" style="color:#5fb91f;text-decoration:none;">${baseUrl}/submit</a>
        </div>
      </td>
    </tr>
  </table>
</div>
  `.trim();
}

function renderCreditText(args: {
  greeting: string;
  kind: "intel" | "event";
  headline: string;
  url: string;
  baseUrl: string;
}): string {
  const { greeting, kind, headline, url, baseUrl } = args;
  return [
    "▸ Source Acknowledged",
    "",
    greeting,
    "",
    `Your ${kind} "${headline}" shipped in this week's RexIntel briefing.`,
    "",
    `Read it live: ${url}`,
    "",
    `Keep them coming. The wire is open: ${baseUrl}/submit`,
    "",
  ].join("\n");
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
