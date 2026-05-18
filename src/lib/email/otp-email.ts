import { Resend } from "resend";

/**
 * Transactional one-time-passcode email for the Magic Link sign-in
 * flow. Sent by /api/auth/email/request-otp. Plain-text + minimal HTML
 * — no marketing chrome, no images. Code is shown in the subject line
 * too so the user can see it from the inbox preview without opening
 * (matches GitHub / Notion / Linear conventions).
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
  code: string; // 6-digit code, plain
  expiresInMinutes: number;
};

export async function sendOtpEmail({
  to,
  code,
  expiresInMinutes,
}: Args): Promise<{ sent: boolean; reason?: string }> {
  const resend = getResend();
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }
  if (!FROM_EMAIL) {
    return { sent: false, reason: "DIGEST_FROM_EMAIL not configured" };
  }

  const subject = `${code} — your Rex Intel sign-in code`;
  const text = [
    `Your Rex Intel sign-in code is: ${code}`,
    "",
    `It expires in ${expiresInMinutes} minutes. If you didn't request this, ignore this email.`,
    "",
    "— Rex Intel Services",
  ].join("\n");

  // Minimal HTML — code in a large monospace block for one-glance reading,
  // no header image / no CTA button. Anything that could trip a phishing
  // filter is stripped on purpose.
  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;max-width:480px;margin:0 auto;padding:24px;">
  <p style="font-size:14px;color:#555;margin:0 0 16px;">Your Rex Intel sign-in code:</p>
  <p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:36px;font-weight:600;letter-spacing:6px;background:#f4f4f5;padding:16px;border-radius:6px;text-align:center;margin:0 0 16px;">${code}</p>
  <p style="font-size:13px;color:#666;margin:0 0 8px;">Expires in ${expiresInMinutes} minutes.</p>
  <p style="font-size:13px;color:#666;margin:0;">If you didn't request this, ignore this email — your account is safe.</p>
</body></html>`;

  try {
    await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to,
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      reason: err instanceof Error ? err.message : "unknown resend error",
    };
  }
}
