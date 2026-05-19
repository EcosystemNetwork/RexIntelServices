import type { NewsletterTemplate } from "./index";

export const communityBounty: NewsletterTemplate = {
  id: "community-bounty",
  name: "Community Bounty",
  description:
    "Bounty pool / claim notice. Green CTA banner with amount, target address, claim link.",
  category: "bounty",
  subject: "Bounty live: $X for the [target] cluster",
  previewText:
    "A new community bounty is open. Claim conditions, escrow, deadline inside.",
  htmlBody: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f7;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#0a0a0f;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:28px 32px 18px;border-bottom:1px solid #2a2a35;">
            <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.22em;color:#5fb91f;text-transform:uppercase;margin-bottom:10px;">
              ✦ Bounty pool · LIVE on Base
            </div>
            <h1 style="margin:0;font-size:26px;line-height:1.22;color:#e8e8ef;font-weight:700;">
              {{firstName}} — there's a new claim window open.
            </h1>
          </td>
        </tr>

        <tr>
          <td style="padding:26px 32px 6px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:linear-gradient(180deg,#5fb91f,#3f8a14);border-radius:8px;">
              <tr>
                <td style="padding:24px;" align="center">
                  <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.2em;color:#0a0a0f;text-transform:uppercase;opacity:0.7;">
                    Pool balance
                  </div>
                  <div style="font-family:'Courier New',monospace;font-size:44px;color:#0a0a0f;font-weight:800;line-height:1;margin:8px 0 6px;">
                    $X,XXX
                  </div>
                  <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.18em;color:#0a0a0f;text-transform:uppercase;opacity:0.75;">
                    USDC · Settled on chain
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:22px 32px 8px;">
            <h2 style="margin:0 0 8px;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#5fb91f;font-family:'Courier New',monospace;">
              ▸ Target cluster
            </h2>
            <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#c9cdd4;">
              [Name the operator cluster. One sentence on what they did.]
            </p>
            <div style="font-family:'Courier New',monospace;font-size:12px;color:#1fa8e0;background:#111118;border:1px solid #2a2a35;border-radius:4px;padding:10px 12px;margin:0 0 22px;word-break:break-all;">
              0x0000000000000000000000000000000000000000
            </div>

            <h2 style="margin:0 0 8px;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#5fb91f;font-family:'Courier New',monospace;">
              ▸ Claim conditions
            </h2>
            <ul style="margin:0 0 22px;padding-left:20px;font-size:14px;line-height:1.65;color:#c9cdd4;">
              <li>What constitutes valid evidence.</li>
              <li>How payouts are split when multiple claimants overlap.</li>
              <li>Deadline (or "open until pool drains").</li>
            </ul>

            <h2 style="margin:0 0 8px;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#5fb91f;font-family:'Courier New',monospace;">
              ▸ Bad-faith policy
            </h2>
            <p style="margin:0 0 24px;font-size:13px;line-height:1.65;color:#8888a0;">
              Two bad-faith claims per identity = permanent ban. We slash the bond, no appeal.
            </p>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td align="center" style="padding:18px;background:#5fb91f;border-radius:6px;">
                  <a href="https://rexintelservices.com/bounties" style="font-family:'Courier New',monospace;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0a0a0f;font-weight:700;text-decoration:none;">
                    Open the bounty board →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:22px 32px 26px;border-top:1px solid #2a2a35;font-family:'Courier New',monospace;font-size:11px;color:#8888a0;line-height:1.7;">
            <div style="margin-bottom:6px;">— Rex Intel Services / Bounty desk</div>
            <div>
              <a href="mailto:rexintelservices@proton.me" style="color:#8888a0;text-decoration:none;">rexintelservices@proton.me</a>
              &nbsp;·&nbsp;
              <a href="https://x.com/rexintelservice" style="color:#1fa8e0;text-decoration:none;">@rexintelservice</a>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
};
