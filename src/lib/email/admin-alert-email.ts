import { Resend } from "resend";
import { absoluteUrl } from "@/lib/site-url";

/**
 * "New submission in the queue" notification to the admin. Fired once per
 * pending submission so the moderator knows to check the queue without
 * having to poll the dashboard.
 *
 * Configuration:
 *   ADMIN_ALERT_EMAIL  — recipient (skip the send entirely if unset)
 *   RESEND_API_KEY     — send transport
 *   DIGEST_FROM_EMAIL  — From address (reused; we don't want a second sender)
 *
 * Best-effort: failures log + return without throwing. Callers should
 * fire-and-forget so submission flow isn't gated on SMTP.
 */

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

type Args = {
  submissionId: string;
  submissionType: string;
  payloadName: string;
  submitterEmail: string | null;
  submitterHandle: string | null;
};

const SURFACE_LABEL: Record<string, string> = {
  event: "event",
  popup_city: "pop-up city",
  hackathon: "hackathon",
  grant: "grant program",
  accelerator: "accelerator",
  job: "job posting",
  intel: "intel item",
};

export async function sendAdminAlertEmail(
  args: Args,
): Promise<{ sent: boolean; reason?: string }> {
  const recipient = process.env.ADMIN_ALERT_EMAIL;
  if (!recipient) {
    return { sent: false, reason: "ADMIN_ALERT_EMAIL not configured" };
  }
  const resend = getResend();
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }
  const fromEmail = process.env.DIGEST_FROM_EMAIL;
  if (!fromEmail) {
    return { sent: false, reason: "DIGEST_FROM_EMAIL not configured" };
  }

  const surface = SURFACE_LABEL[args.submissionType] ?? "submission";
  const queueUrl = absoluteUrl("/submissions");
  const statusLine = "Sitting in the moderation queue, waiting for review.";
  const submitterLine = args.submitterEmail
    ? `${args.submitterEmail}${args.submitterHandle ? ` (@${args.submitterHandle})` : ""}`
    : args.submitterHandle
      ? `@${args.submitterHandle}`
      : "anonymous";

  try {
    await resend.emails.send({
      from: `RexIntel Ops <${fromEmail}>`,
      to: [recipient],
      subject: `[Queue] New ${surface}: ${args.payloadName}`,
      html: renderHtml({
        surface,
        payloadName: args.payloadName,
        statusLine,
        submitterLine,
        queueUrl,
      }),
      text: renderText({
        surface,
        payloadName: args.payloadName,
        statusLine,
        submitterLine,
        queueUrl,
      }),
    });
    return { sent: true };
  } catch (e) {
    console.warn("[admin-alert-email] send failed:", e);
    return {
      sent: false,
      reason: e instanceof Error ? e.message : "unknown error",
    };
  }
}

function renderHtml(args: {
  surface: string;
  payloadName: string;
  statusLine: string;
  submitterLine: string;
  queueUrl: string;
}): string {
  return `
<div style="background:#0a0a0f;padding:24px 16px;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:540px;margin:0 auto;background:#111118;border:1px solid #1e1e28;border-radius:6px;">
    <tr>
      <td style="padding:24px 28px;">
        <div style="font:600 10px/1 ui-monospace,monospace;letter-spacing:0.22em;text-transform:uppercase;color:#5fb91f;margin-bottom:8px;">● Moderation</div>
        <div style="font:600 18px/1.25 ui-sans-serif,system-ui,sans-serif;color:#fff;margin:0 0 10px;">New ${escape(args.surface)}: ${escape(args.payloadName)}</div>
        <div style="font:400 13px/1.55 ui-sans-serif,system-ui,sans-serif;color:#c8c8d0;margin:0 0 6px;">${escape(args.statusLine)}</div>
        <div style="font:400 12px/1.6 ui-monospace,monospace;color:#8888a0;margin:0 0 20px;">From: ${escape(args.submitterLine)}</div>
        <a href="${escape(args.queueUrl)}" style="display:inline-block;background:#5fb91f;color:#0a0a0f;font:600 11px/1 ui-monospace,monospace;letter-spacing:0.12em;text-transform:uppercase;padding:10px 16px;border-radius:4px;text-decoration:none;">
          Open queue ▸
        </a>
      </td>
    </tr>
  </table>
</div>
`.trim();
}

function renderText(args: {
  surface: string;
  payloadName: string;
  statusLine: string;
  submitterLine: string;
  queueUrl: string;
}): string {
  return [
    `New ${args.surface}: ${args.payloadName}`,
    "",
    args.statusLine,
    `From: ${args.submitterLine}`,
    "",
    `Queue: ${args.queueUrl}`,
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

// In-process throttle for ops alerts so a sustained failure (e.g. Resend
// API key revoked, settler key wrong) doesn't self-DoS the admin inbox.
// Per-instance; an N-warm-lambda burst sends at most N alerts per key per
// window. Acceptable for solo operator.
const _opsAlertLastSent = new Map<string, number>();

/**
 * Generic ops alert — fire when a silent-failure surface trips
 * (settle-monthly-prizes errors, OTP/Resend outage, etc.). Best-effort;
 * never throws. Rate-limited per-key so a sustained outage doesn't bury
 * the admin inbox.
 *
 *   await sendOpsAlert({
 *     key: "settle-monthly-prizes:errored",  // de-dup key (1 alert / window)
 *     windowMs: 60 * 60 * 1000,              // default 1 hour
 *     subject: "[Ops] Monthly prize settlement failed",
 *     message: `${ym}: ${errorReason}`,
 *   });
 */
export async function sendOpsAlert(args: {
  key: string;
  windowMs?: number;
  subject: string;
  message: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const windowMs = args.windowMs ?? 60 * 60 * 1000;
  const last = _opsAlertLastSent.get(args.key) ?? 0;
  const now = Date.now();
  if (now - last < windowMs) {
    return { sent: false, reason: "rate_limited" };
  }
  _opsAlertLastSent.set(args.key, now);

  const recipient = process.env.ADMIN_ALERT_EMAIL;
  if (!recipient) {
    return { sent: false, reason: "ADMIN_ALERT_EMAIL not configured" };
  }
  const resend = getResend();
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }
  const fromEmail = process.env.DIGEST_FROM_EMAIL;
  if (!fromEmail) {
    return { sent: false, reason: "DIGEST_FROM_EMAIL not configured" };
  }

  try {
    await resend.emails.send({
      from: `RexIntel Ops <${fromEmail}>`,
      to: [recipient],
      subject: args.subject,
      html: `<pre style="font:13px/1.5 ui-monospace,monospace;color:#c8c8d0;background:#0a0a0f;padding:16px;border-radius:6px;white-space:pre-wrap;word-break:break-word;">${escape(args.message)}</pre>`,
      text: args.message,
    });
    return { sent: true };
  } catch (e) {
    console.warn("[ops-alert] send failed:", e);
    return {
      sent: false,
      reason: e instanceof Error ? e.message : "unknown error",
    };
  }
}
