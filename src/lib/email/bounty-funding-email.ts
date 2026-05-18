import { Resend } from "resend";
import { siteUrl } from "../site-url";

/**
 * Funding-instructions email sent after a draft bounty is created.
 * Carries the one-shot access link + (eventually) the per-bounty escrow
 * deposit address. Custody rail is currently paused (Circle was ripped
 * 2026-05-18; replacement TBD), so `depositAddress` is always null and
 * the email surfaces a "rail being rebuilt" notice instead — kept wired
 * so we don't have to re-thread the email pipeline when the new rail
 * lands.
 *
 * Resend-only — silently no-ops if RESEND_API_KEY isn't configured so
 * dev environments don't fail bounty creation.
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
  bountyPublicId: string;
  accessUrl: string; // absolute URL with ?token=
  /** USDC amount the victim needs to send. Null for kind=recovery (no fixed amount). */
  fundingAmountUsdc: number | null;
  /** Per-bounty escrow deposit address. Currently always null (custody rail paused). */
  depositAddress: string | null;
  /** "BASE" or "BASE-SEPOLIA" — drives the human-readable network name + faucet URL note. */
  blockchain: string;
  victimVerified: boolean;
};

function networkLabel(blockchain: string): string {
  return blockchain === "BASE-SEPOLIA"
    ? "Base Sepolia (testnet)"
    : blockchain === "BASE"
      ? "Base"
      : blockchain;
}

export async function sendBountyFundingEmail({
  to,
  bountyPublicId,
  accessUrl,
  fundingAmountUsdc,
  depositAddress,
  blockchain,
  victimVerified,
}: Args): Promise<{ sent: boolean; reason?: string }> {
  const resend = getResend();
  if (!resend) return { sent: false, reason: "RESEND_API_KEY not configured" };
  if (!FROM_EMAIL)
    return { sent: false, reason: "DIGEST_FROM_EMAIL not configured" };

  const network = networkLabel(blockchain);
  const amountLine =
    fundingAmountUsdc != null
      ? `Send ${fundingAmountUsdc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC on ${network}`
      : `Send any amount of USDC on ${network} to fund the recovery share`;
  const depositLine = depositAddress
    ? `Deposit address: ${depositAddress}`
    : `Deposit address: (not yet provisioned — contact support)`;

  const subject = `Funding instructions — your RexIntel bounty ${bountyPublicId}`;
  const verifyLine = victimVerified
    ? "Your email is already verified — once funds arrive the bounty publishes automatically."
    : "Click the access link below and complete the one-time email verification. Until verified, your bounty stays private even after funding.";

  const text = [
    `Your draft bounty is ready to fund.`,
    ``,
    amountLine + ".",
    depositLine,
    ``,
    `Access link (save this — it's the only way back to your draft):`,
    accessUrl,
    ``,
    verifyLine,
    ``,
    `Once verified AND funded, your bounty becomes visible to trusted-tier white-hat researchers who can submit sealed evidence packages. A curator and you adjudicate any claim before payout.`,
    ``,
    `— Rex Intel Services`,
  ].join("\n");

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;line-height:1.5;">
  <p style="font-size:14px;color:#555;margin:0 0 8px;">Your draft bounty <code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${bountyPublicId}</code> is ready to fund.</p>

  <div style="background:#f4f4f5;padding:14px;border-radius:6px;margin:16px 0;">
    <p style="font-size:13px;color:#555;margin:0 0 4px;text-transform:uppercase;letter-spacing:1px;">${amountLine}</p>
    <p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;word-break:break-all;color:#111;margin:0;">${depositLine}</p>
  </div>

  <p style="font-size:13px;color:#555;margin:0 0 6px;">Access link <span style="color:#888;">(save this — it's the only way back to your draft):</span></p>
  <p style="margin:0 0 16px;"><a href="${accessUrl}" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;word-break:break-all;color:#2563eb;">${accessUrl}</a></p>

  <p style="font-size:13px;color:#555;margin:0 0 16px;">${verifyLine}</p>

  <p style="font-size:12px;color:#888;margin:24px 0 0;border-top:1px solid #eee;padding-top:12px;">Once verified AND funded, your bounty becomes visible to trusted-tier white-hat researchers. A curator and you adjudicate any claim before payout.</p>
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

/**
 * Build the canonical absolute access URL (bounty page + ?token=).
 */
export function bountyAccessUrl(
  bountyPublicId: string,
  rawToken: string,
): string {
  return `${siteUrl()}/bounties/${bountyPublicId}?token=${encodeURIComponent(rawToken)}`;
}
