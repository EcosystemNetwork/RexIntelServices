import type { NewsletterTemplate } from "./index";

export const investigationDrop: NewsletterTemplate = {
  id: "investigation-drop",
  name: "Investigation Drop",
  description:
    "Long-form investigative drop. Black masthead, hero slot, byline, body, 'Why this matters'.",
  category: "investigation",
  subject: "{{firstName}} — new investigation: [headline]",
  previewText:
    "What we found, what the on-chain shows, and why we're publishing now.",
  htmlBody: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f7;padding:32px 12px;font-family:Georgia,'Times New Roman',serif;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:#0a0a0f;padding:18px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.22em;color:#5fb91f;text-transform:uppercase;">
                  RexIntel / Investigation
                </td>
                <td align="right" style="font-family:'Courier New',monospace;font-size:11px;color:#8888a0;">
                  [Issue #]
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:36px 36px 8px;">
            <div style="font-family:-apple-system,sans-serif;font-size:11px;letter-spacing:0.16em;color:#888;text-transform:uppercase;margin-bottom:14px;">
              Investigation · [Date]
            </div>
            <h1 style="margin:0 0 14px;font-size:32px;line-height:1.18;color:#111;font-weight:700;font-family:Georgia,serif;">
              [Replace with investigation headline]
            </h1>
            <p style="margin:0 0 8px;font-size:17px;line-height:1.5;color:#555;font-style:italic;font-family:Georgia,serif;">
              [Replace with subhead / dek — the one sentence that explains why this matters.]
            </p>
            <div style="font-family:-apple-system,sans-serif;font-size:12px;color:#888;margin-top:14px;">
              By Rex Intel Services
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:8px 36px 0;">
            <div style="height:1px;background:#e5e5e5;margin:24px 0;"></div>
          </td>
        </tr>

        <tr>
          <td style="padding:0 36px 24px;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#222;">
            <p style="margin:0 0 18px;">
              <span style="font-size:48px;line-height:0.9;float:left;margin:6px 8px 0 0;color:#0a0a0f;font-family:Georgia,serif;font-weight:700;">{{firstName}}</span>
              — open with the lede. One paragraph that lands the story. What we found,
              who is in it, and what the consequence is. Don't bury it.
            </p>
            <p style="margin:0 0 18px;">
              Second paragraph: how we got there. Reference the source documents
              and the on-chain trail. Anchor every claim to something verifiable.
            </p>
            <p style="margin:0 0 18px;">
              Third paragraph: the surprise. The thing the reader doesn't yet know.
            </p>

            <h2 style="margin:32px 0 12px;font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:#0a0a0f;font-family:-apple-system,sans-serif;font-weight:700;">
              The on-chain trail
            </h2>
            <p style="margin:0 0 14px;">
              Wallet addresses, flows, counterparties. Keep it tight.
            </p>
            <div style="font-family:'Courier New',monospace;font-size:12px;color:#0a0a0f;background:#f4f4f7;border-left:3px solid #5fb91f;padding:12px 14px;margin:0 0 22px;word-break:break-all;">
              0x0000000000000000000000000000000000000000
            </div>

            <h2 style="margin:32px 0 12px;font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:#0a0a0f;font-family:-apple-system,sans-serif;font-weight:700;">
              Why this matters
            </h2>
            <p style="margin:0 0 24px;">
              Tie it to the pattern. Tie it to the reader.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 36px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td align="center" style="padding:18px;background:#0a0a0f;border-radius:6px;">
                  <a href="https://rexintelservices.com/intel/REPLACE-ID" style="font-family:'Courier New',monospace;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#5fb91f;font-weight:700;text-decoration:none;">
                    Read the full investigation →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 36px 28px;border-top:1px solid #e5e5e5;font-family:-apple-system,sans-serif;font-size:12px;color:#888;line-height:1.7;text-align:center;">
            <div style="margin-bottom:6px;">— The Rex Intel Services investigations desk</div>
            <div>
              Secure tips: <a href="mailto:rexintelservices@proton.me" style="color:#888;text-decoration:underline;">rexintelservices@proton.me</a>
              &nbsp;·&nbsp;
              <a href="https://x.com/rexintelservice" style="color:#888;text-decoration:underline;">@rexintelservice</a>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
};
