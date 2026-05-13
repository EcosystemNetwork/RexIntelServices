import { Resend } from "resend";
import { absoluteUrl } from "@/lib/site-url";

/**
 * Transactional "here's your edit link" email. Sent once on submission for
 * non-anonymous submitters who provided an email. Lets them return later to
 * fix typos / update details without bothering the admin.
 *
 * Failures don't block the submission flow — the email is best-effort and
 * callers should fire-and-forget. If RESEND_API_KEY isn't set (local dev),
 * we no-op and log; the edit link is also returned by /api/submit's JSON
 * response so the submitter can copy it from there.
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
  submissionType: string; // "event", "grant", etc — used in subject + copy
  payloadName: string; // headline/name from the payload
  editUrl: string; // absolute URL to /submit/edit/<token>
};

export async function sendEditLinkEmail({
  to,
  submissionType,
  payloadName,
  editUrl,
}: Args): Promise<{ sent: boolean; reason?: string }> {
  const resend = getResend();
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }
  if (!FROM_EMAIL) {
    return { sent: false, reason: "DIGEST_FROM_EMAIL not configured" };
  }

  const surfaceLabel = SURFACE_LABEL[submissionType] ?? "submission";
  const subject = `Your ${surfaceLabel} on RexIntel — edit link inside`;

  try {
    await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html: renderHtml({ surfaceLabel, payloadName, editUrl }),
      text: renderText({ surfaceLabel, payloadName, editUrl }),
    });
    return { sent: true };
  } catch (e) {
    console.warn("[edit-link-email] send failed:", e);
    return {
      sent: false,
      reason: e instanceof Error ? e.message : "unknown error",
    };
  }
}

const SURFACE_LABEL: Record<string, string> = {
  event: "event",
  popup_city: "pop-up city",
  hackathon: "hackathon",
  grant: "grant program",
  accelerator: "accelerator",
  job: "job posting",
  intel: "intel submission",
};

function renderHtml({
  surfaceLabel,
  payloadName,
  editUrl,
}: {
  surfaceLabel: string;
  payloadName: string;
  editUrl: string;
}): string {
  const briefingRoom = absoluteUrl("/");
  return `
<div style="background:#0a0a0f;padding:32px 16px;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:540px;margin:0 auto;background:#111118;border:1px solid #1e1e28;border-radius:6px;">
    <tr>
      <td style="padding:28px 28px 20px;border-bottom:1px solid #1e1e28;">
        <div style="font:600 10px/1 ui-monospace,monospace;letter-spacing:0.22em;text-transform:uppercase;color:#5fb91f;">● Transmission Receipt</div>
        <div style="font:600 22px/1.2 ui-sans-serif,system-ui,sans-serif;color:#fff;margin:10px 0 4px;">We received your ${escape(surfaceLabel)}.</div>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px;">
        <p style="font:400 14px/1.6 ui-sans-serif,system-ui,sans-serif;color:#c8c8d0;margin:0 0 16px;">
          Thanks for the drop. Your ${escape(surfaceLabel)} <strong style="color:#fff;">${escape(payloadName)}</strong> is in our system.
        </p>
        <p style="font:400 14px/1.6 ui-sans-serif,system-ui,sans-serif;color:#c8c8d0;margin:0 0 20px;">
          Notice a typo or want to update a detail? Use the secure link below to edit the submission without bothering our analysts. Don&apos;t share it — anyone with the link can edit this entry.
        </p>
        <div style="margin:0 0 24px;">
          <a href="${escape(editUrl)}" style="display:inline-block;background:#5fb91f;color:#0a0a0f;font:600 12px/1 ui-monospace,monospace;letter-spacing:0.12em;text-transform:uppercase;padding:12px 18px;border-radius:4px;text-decoration:none;">
            Edit submission ▸
          </a>
        </div>
        <p style="font:400 11px/1.55 ui-monospace,monospace;color:#55556a;word-break:break-all;margin:0 0 20px;">
          ${escape(editUrl)}
        </p>
        <p style="font:400 12px/1.55 ui-sans-serif,system-ui,sans-serif;color:#8888a0;margin:0;">
          — Rex Intel Services<br/>
          <a href="${briefingRoom}" style="color:#5fb91f;text-decoration:none;">${briefingRoom}</a>
        </p>
      </td>
    </tr>
  </table>
</div>
`.trim();
}

function renderText({
  surfaceLabel,
  payloadName,
  editUrl,
}: {
  surfaceLabel: string;
  payloadName: string;
  editUrl: string;
}): string {
  return [
    "Transmission receipt",
    "===================",
    "",
    `We received your ${surfaceLabel}: ${payloadName}.`,
    "",
    "Notice a typo or want to update a detail? Use this secure link to edit your submission directly — anyone with the link can edit this entry, so don't share it:",
    "",
    editUrl,
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
