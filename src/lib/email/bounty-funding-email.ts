import { Resend } from "resend";
import { siteUrl } from "../site-url";

/**
 * Funding-instructions email sent after a draft bounty is created.
 *
 * As of 2026-05-18 the custody rail is the on-chain BountyEscrow contract
 * on Base. Funding is a two-step user action:
 *   1. approve(escrowAddress, amount) on the USDC token contract
 *   2. fundBounty(bountyKey, amount) on the BountyEscrow contract
 * The email surfaces both contract addresses + the bountyKey so victims
 * can fund via any web3 wallet, Etherscan write-contract UI, or the
 * /bounties/[publicId]/fund page on the site.
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
  /** BountyEscrow contract address on the target chain. Null when the on-chain
   *  rail is not yet configured (BOUNTY_ESCROW_ADDRESS unset) — the email
   *  surfaces a "rail not yet provisioned" notice instead. */
  escrowAddress: string | null;
  /** USDC ERC-20 contract address the victim approves. Required when
   *  escrowAddress is set. */
  usdcAddress: string | null;
  /** bytes32 bountyKey to pass to fundBounty(). Derived from the bounty UUID. */
  bountyKey: string | null;
  /** "BASE" or "BASE-SEPOLIA" — drives the human-readable network name. */
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
  escrowAddress,
  usdcAddress,
  bountyKey,
  blockchain,
  victimVerified,
}: Args): Promise<{ sent: boolean; reason?: string }> {
  const resend = getResend();
  if (!resend) return { sent: false, reason: "RESEND_API_KEY not configured" };
  if (!FROM_EMAIL)
    return { sent: false, reason: "DIGEST_FROM_EMAIL not configured" };

  const network = networkLabel(blockchain);
  const amountText =
    fundingAmountUsdc != null
      ? `${fundingAmountUsdc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`
      : `any amount of USDC (the recovery share)`;

  const railReady = Boolean(escrowAddress && usdcAddress && bountyKey);

  const subject = `Funding instructions — your RexIntel bounty ${bountyPublicId}`;
  const verifyLine = victimVerified
    ? "Your email is already verified — once funds arrive the bounty publishes automatically."
    : "Click the access link below and complete the one-time email verification. Until verified, your bounty stays private even after funding.";

  const instructionsText = railReady
    ? [
        `Send ${amountText} on ${network} via two web3 transactions:`,
        ``,
        `  1. On the USDC contract, call approve(${escrowAddress}, <amount>)`,
        `     USDC: ${usdcAddress}`,
        ``,
        `  2. On the BountyEscrow contract, call fundBounty(<bountyKey>, <amount>)`,
        `     BountyEscrow: ${escrowAddress}`,
        `     bountyKey:    ${bountyKey}`,
        ``,
        `Or fund from the site: ${siteUrl()}/bounties/${bountyPublicId}/fund`,
      ].join("\n")
    : `Send ${amountText} on ${network}. The on-chain escrow rail isn't yet provisioned for this draft — contact support and we'll attach a deposit address.`;

  const text = [
    `Your draft bounty is ready to fund.`,
    ``,
    instructionsText,
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

  const railBlockHtml = railReady
    ? `<div style="background:#f4f4f5;padding:14px;border-radius:6px;margin:16px 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;word-break:break-all;color:#111;">
    <p style="font-size:13px;color:#555;margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-transform:uppercase;letter-spacing:1px;">Send ${amountText} on ${network}</p>
    <p style="margin:0 0 6px;"><strong style="color:#555;">Step 1 — USDC.approve(escrow, amount)</strong></p>
    <p style="margin:0 0 10px;color:#111;">USDC: ${usdcAddress}</p>
    <p style="margin:0 0 6px;"><strong style="color:#555;">Step 2 — escrow.fundBounty(bountyKey, amount)</strong></p>
    <p style="margin:0;color:#111;">BountyEscrow: ${escrowAddress}<br/>bountyKey: ${bountyKey}</p>
  </div>
  <p style="font-size:13px;color:#555;margin:0 0 16px;">Or fund from the site: <a href="${siteUrl()}/bounties/${bountyPublicId}/fund" style="color:#2563eb;">${siteUrl()}/bounties/${bountyPublicId}/fund</a></p>`
    : `<div style="background:#fef3c7;padding:14px;border-radius:6px;margin:16px 0;">
    <p style="font-size:13px;color:#92400e;margin:0;">Send ${amountText} on ${network}. The on-chain escrow rail isn't yet provisioned for this draft — contact support and we'll attach a deposit address.</p>
  </div>`;

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;line-height:1.5;">
  <p style="font-size:14px;color:#555;margin:0 0 8px;">Your draft bounty <code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${bountyPublicId}</code> is ready to fund.</p>

  ${railBlockHtml}

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
