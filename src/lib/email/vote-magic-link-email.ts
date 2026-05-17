import { Resend } from "resend";
import { absoluteUrl } from "@/lib/site-url";

/**
 * Transactional magic-link email for confirming a vote on community intel.
 *
 * Sent once per vote attempt. The link contains a one-time token; clicking
 * it records the vote in intel_votes and sets a signed voter cookie so the
 * same browser doesn't need to re-magic-link for 30 days.
 *
 * Failures don't block the API response — the user sees "check your email";
 * if the email never lands, they retry. Calling code should fire-and-forget.
 */

const FROM_NAME = process.env.DIGEST_FROM_NAME ?? "Rex Intel Services";
const FROM_EMAIL = process.env.DIGEST_FROM_EMAIL;

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

type Args = {
  to: string;
  intelHeadline: string;
  confirmUrl: string;
};

export async function sendVoteMagicLinkEmail({
  to,
  intelHeadline,
  confirmUrl,
}: Args): Promise<{ sent: boolean; reason?: string }> {
  const resend = getResend();
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }
  if (!FROM_EMAIL) {
    return { sent: false, reason: "DIGEST_FROM_EMAIL not configured" };
  }

  const subject = `Confirm your vote on RexIntel`;

  try {
    await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html: renderHtml({ intelHeadline, confirmUrl }),
      text: renderText({ intelHeadline, confirmUrl }),
    });
    return { sent: true };
  } catch (e) {
    console.warn("[vote-magic-link-email] send failed:", e);
    return {
      sent: false,
      reason: e instanceof Error ? e.message : "unknown error",
    };
  }
}

function renderHtml({
  intelHeadline,
  confirmUrl,
}: {
  intelHeadline: string;
  confirmUrl: string;
}): string {
  const home = absoluteUrl("/");
  return `
<div style="background:#0a0a0f;padding:32px 16px;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:540px;margin:0 auto;background:#111118;border:1px solid #1e1e28;border-radius:6px;">
    <tr>
      <td style="padding:28px 28px 20px;border-bottom:1px solid #1e1e28;">
        <div style="font:600 10px/1 ui-monospace,monospace;letter-spacing:0.22em;text-transform:uppercase;color:#5fb91f;">● Vote · Confirmation</div>
        <div style="font:600 22px/1.2 ui-sans-serif,system-ui,sans-serif;color:#fff;margin:10px 0 4px;">Confirm your vote</div>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px;">
        <p style="font:400 14px/1.6 ui-sans-serif,system-ui,sans-serif;color:#c8c8d0;margin:0 0 12px;">
          You're voting for:
        </p>
        <p style="font:600 16px/1.4 ui-sans-serif,system-ui,sans-serif;color:#fff;margin:0 0 20px;padding:12px 14px;background:#18181f;border:1px solid #1e1e28;border-radius:4px;">
          ${escape(intelHeadline)}
        </p>
        <p style="font:400 14px/1.6 ui-sans-serif,system-ui,sans-serif;color:#c8c8d0;margin:0 0 18px;">
          Click below to confirm. Your vote counts toward this month's community prize pool — winners are paid out from a community-funded wallet at month end.
        </p>
        <div style="margin:0 0 24px;">
          <a href="${escape(confirmUrl)}" style="display:inline-block;background:#5fb91f;color:#0a0a0f;font:600 12px/1 ui-monospace,monospace;letter-spacing:0.12em;text-transform:uppercase;padding:12px 18px;border-radius:4px;text-decoration:none;">
            Confirm vote ▸
          </a>
        </div>
        <p style="font:400 11px/1.55 ui-monospace,monospace;color:#55556a;word-break:break-all;margin:0 0 18px;">
          ${escape(confirmUrl)}
        </p>
        <p style="font:400 12px/1.55 ui-sans-serif,system-ui,sans-serif;color:#8888a0;margin:0;">
          Didn't request this? Ignore it — no vote is recorded without the click. Link expires in 24h.
        </p>
        <p style="font:400 12px/1.55 ui-sans-serif,system-ui,sans-serif;color:#8888a0;margin:18px 0 0;">
          — Rex Intel Services<br/>
          <a href="${home}" style="color:#5fb91f;text-decoration:none;">${home}</a>
        </p>
      </td>
    </tr>
  </table>
</div>
`.trim();
}

function renderText({
  intelHeadline,
  confirmUrl,
}: {
  intelHeadline: string;
  confirmUrl: string;
}): string {
  return [
    "Confirm your vote on RexIntel",
    "=============================",
    "",
    `You're voting for: ${intelHeadline}`,
    "",
    "Click to confirm — your vote counts toward this month's community prize pool:",
    "",
    confirmUrl,
    "",
    "Didn't request this? Ignore it — no vote is recorded without the click. Link expires in 24h.",
    "",
    "— Rex Intel Services",
    absoluteUrl("/"),
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
