import { Resend } from "resend";
import { welcome as welcomeTemplate } from "./templates/welcome";

/**
 * Lightweight transactional automations for the newsletter pipeline.
 *
 * Scope: a single canonical event — `subscriber.created` → send the
 * Welcome template immediately. Fire-and-forget so /api/subscribe never
 * blocks on a downstream Resend latency spike; the worst case is a missed
 * welcome email, never a failed signup.
 *
 * Future: this will grow into a full automation engine (drip sequences,
 * tag-added triggers, wait steps). For now it lives as one function so
 * the responsibility is obvious and the scope is honest.
 */

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

const FROM_NAME = "Rex Intel Services";
const FROM_EMAIL = process.env.WELCOME_FROM_EMAIL ?? "intel@rexintelservices.com";

// Replace merge tags in the canned welcome body. This is a non-tracked send
// (no per-recipient send-id, no click-rewrite) so we lean on the simpler
// substitution path rather than running through the campaign render layer.
function applyMergeTags(
  template: string,
  sub: { firstName: string | null; lastName: string | null; email: string },
): string {
  return template
    .replace(/\{\{\s*firstName\s*\}\}/g, escapeHtml(sub.firstName ?? "there"))
    .replace(/\{\{\s*lastName\s*\}\}/g, escapeHtml(sub.lastName ?? ""))
    .replace(/\{\{\s*email\s*\}\}/g, escapeHtml(sub.email));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function fireSubscriberCreated(subscriber: {
  email: string;
  firstName: string | null;
  lastName: string | null;
}): Promise<void> {
  if (process.env.WELCOME_AUTOMATION_ENABLED !== "true") return;
  const resend = getResend();
  if (!resend) return;

  try {
    const html = applyMergeTags(welcomeTemplate.htmlBody, subscriber);
    const subject = applyMergeTags(welcomeTemplate.subject, subscriber);
    await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [subscriber.email],
      subject,
      html,
    });
  } catch (err) {
    // Welcome failures must never bubble up to the signup response. Log
    // and move on — the subscriber is still on the list, they just don't
    // get the welcome.
    console.error("[welcome automation] send failed:", err);
  }
}
