import type { NewsletterTemplate } from "./index";

export const weeklyDigest: NewsletterTemplate = {
  id: "weekly-digest",
  name: "Weekly Digest",
  description:
    "Terse 5-bullet weekly roundup. Monospace numbers. No hero — designed to skim in 30 seconds.",
  category: "newsletter",
  subject: "Week in intel — [date range]",
  previewText: "Five things from the week. Read in 30 seconds.",
  htmlBody: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f7;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:24px 32px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.2em;color:#5fb91f;text-transform:uppercase;font-weight:700;">
                  Week in intel
                </td>
                <td align="right" style="font-family:'Courier New',monospace;font-size:11px;color:#888;">
                  [date range]
                </td>
              </tr>
            </table>
            <h1 style="margin:14px 0 6px;font-size:22px;line-height:1.25;color:#111;font-weight:700;">
              Hey {{firstName}} — five things worth your time.
            </h1>
          </td>
        </tr>

        <tr>
          <td style="padding:14px 32px 6px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td width="40" valign="top" style="font-family:'Courier New',monospace;font-size:14px;color:#5fb91f;font-weight:700;padding:2px 0;">01</td>
                <td valign="top" style="padding-bottom:14px;border-bottom:1px solid #eee;">
                  <div style="font-size:15px;color:#111;line-height:1.5;">
                    <a href="https://rexintelservices.com/intel/REPLACE-ID" style="color:#111;font-weight:600;text-decoration:none;border-bottom:1px solid #5fb91f;">[Headline one]</a>
                    — one-line take.
                  </div>
                </td>
              </tr>
              <tr><td colspan="2" style="height:14px;"></td></tr>
              <tr>
                <td width="40" valign="top" style="font-family:'Courier New',monospace;font-size:14px;color:#5fb91f;font-weight:700;padding:2px 0;">02</td>
                <td valign="top" style="padding-bottom:14px;border-bottom:1px solid #eee;">
                  <div style="font-size:15px;color:#111;line-height:1.5;">
                    <a href="https://rexintelservices.com/intel/REPLACE-ID" style="color:#111;font-weight:600;text-decoration:none;border-bottom:1px solid #5fb91f;">[Headline two]</a>
                    — one-line take.
                  </div>
                </td>
              </tr>
              <tr><td colspan="2" style="height:14px;"></td></tr>
              <tr>
                <td width="40" valign="top" style="font-family:'Courier New',monospace;font-size:14px;color:#5fb91f;font-weight:700;padding:2px 0;">03</td>
                <td valign="top" style="padding-bottom:14px;border-bottom:1px solid #eee;">
                  <div style="font-size:15px;color:#111;line-height:1.5;">
                    <a href="https://rexintelservices.com/intel/REPLACE-ID" style="color:#111;font-weight:600;text-decoration:none;border-bottom:1px solid #5fb91f;">[Headline three]</a>
                    — one-line take.
                  </div>
                </td>
              </tr>
              <tr><td colspan="2" style="height:14px;"></td></tr>
              <tr>
                <td width="40" valign="top" style="font-family:'Courier New',monospace;font-size:14px;color:#5fb91f;font-weight:700;padding:2px 0;">04</td>
                <td valign="top" style="padding-bottom:14px;border-bottom:1px solid #eee;">
                  <div style="font-size:15px;color:#111;line-height:1.5;">
                    <a href="https://rexintelservices.com/intel/REPLACE-ID" style="color:#111;font-weight:600;text-decoration:none;border-bottom:1px solid #5fb91f;">[Headline four]</a>
                    — one-line take.
                  </div>
                </td>
              </tr>
              <tr><td colspan="2" style="height:14px;"></td></tr>
              <tr>
                <td width="40" valign="top" style="font-family:'Courier New',monospace;font-size:14px;color:#5fb91f;font-weight:700;padding:2px 0;">05</td>
                <td valign="top">
                  <div style="font-size:15px;color:#111;line-height:1.5;">
                    <a href="https://rexintelservices.com/intel/REPLACE-ID" style="color:#111;font-weight:600;text-decoration:none;border-bottom:1px solid #5fb91f;">[Headline five]</a>
                    — one-line take.
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td align="center" style="padding:14px;background:#0a0a0f;border-radius:6px;">
                  <a href="https://rexintelservices.com" style="font-family:'Courier New',monospace;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#5fb91f;font-weight:700;text-decoration:none;">
                    The full feed →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:18px 32px 26px;border-top:1px solid #eee;font-family:-apple-system,sans-serif;font-size:12px;color:#888;line-height:1.7;text-align:center;">
            <div style="margin-bottom:4px;">— Rex Intel Services</div>
            <div>
              <a href="https://x.com/rexintelservice" style="color:#888;text-decoration:underline;">@rexintelservice</a>
              &nbsp;·&nbsp;
              <a href="mailto:rexintelservices@proton.me" style="color:#888;text-decoration:underline;">rexintelservices@proton.me</a>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
};
