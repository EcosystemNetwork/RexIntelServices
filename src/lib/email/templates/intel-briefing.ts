import type { NewsletterTemplate } from "./index";

export const intelBriefing: NewsletterTemplate = {
  id: "intel-briefing",
  name: "Intel Briefing",
  description:
    "Flagship monthly briefing. Stat-card hero, 3–5 signal blocks, social footer.",
  category: "newsletter",
  subject: "{{firstName}}, this month's intel briefing is in",
  previewText:
    "The signals we're tracking, the incidents we're chasing, the addresses we're tagging.",
  htmlBody: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f7;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#0a0a0f;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:28px 32px 20px;border-bottom:1px solid #2a2a35;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.18em;color:#5fb91f;text-transform:uppercase;">
                  RexIntel Services / Briefing
                </td>
                <td align="right" style="font-family:'Courier New',monospace;font-size:11px;color:#8888a0;">
                  ISSUE • MONTHLY
                </td>
              </tr>
            </table>
            <h1 style="margin:18px 0 0;font-size:28px;line-height:1.2;color:#e8e8ef;font-weight:600;">
              Hey {{firstName}} — here's what we're watching.
            </h1>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px;">
            <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#c9cdd4;">
              Three signals crossed our desk this month that matter. Two new incident clusters
              landed in the moat graph, and one investigation is going long-form next week.
            </p>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 28px;">
              <tr>
                <td width="33%" align="center" style="padding:14px 6px;background:#111118;border:1px solid #2a2a35;border-radius:6px;">
                  <div style="font-family:'Courier New',monospace;font-size:22px;color:#5fb91f;font-weight:700;">$9.4B</div>
                  <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.15em;color:#8888a0;text-transform:uppercase;margin-top:4px;">Lost crypto tracked</div>
                </td>
                <td width="6">&nbsp;</td>
                <td width="33%" align="center" style="padding:14px 6px;background:#111118;border:1px solid #2a2a35;border-radius:6px;">
                  <div style="font-family:'Courier New',monospace;font-size:22px;color:#1fa8e0;font-weight:700;">+83</div>
                  <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.15em;color:#8888a0;text-transform:uppercase;margin-top:4px;">Wallets tagged</div>
                </td>
                <td width="6">&nbsp;</td>
                <td width="33%" align="center" style="padding:14px 6px;background:#111118;border:1px solid #2a2a35;border-radius:6px;">
                  <div style="font-family:'Courier New',monospace;font-size:22px;color:#fbbf24;font-weight:700;">12</div>
                  <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.15em;color:#8888a0;text-transform:uppercase;margin-top:4px;">New incidents</div>
                </td>
              </tr>
            </table>

            <h2 style="margin:0 0 12px;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#5fb91f;font-family:'Courier New',monospace;">
              ▸ Signal 01
            </h2>
            <h3 style="margin:0 0 6px;font-size:18px;color:#e8e8ef;font-weight:600;line-height:1.3;">
              [Replace with signal title]
            </h3>
            <p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#c9cdd4;">
              One paragraph of analysis. What happened, who's involved, why it matters now.
            </p>
            <p style="margin:0 0 28px;font-size:13px;">
              <a href="https://rexintelservices.com/intel/REPLACE-ID" style="color:#5fb91f;text-decoration:none;font-weight:600;">Read the full breakdown →</a>
            </p>

            <h2 style="margin:0 0 12px;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#5fb91f;font-family:'Courier New',monospace;">
              ▸ Signal 02
            </h2>
            <h3 style="margin:0 0 6px;font-size:18px;color:#e8e8ef;font-weight:600;line-height:1.3;">
              [Replace with signal title]
            </h3>
            <p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#c9cdd4;">
              Same shape. Keep it terse — readers skim, they don't read.
            </p>
            <p style="margin:0 0 28px;font-size:13px;">
              <a href="https://rexintelservices.com/intel/REPLACE-ID" style="color:#5fb91f;text-decoration:none;font-weight:600;">Read the full breakdown →</a>
            </p>

            <h2 style="margin:0 0 12px;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#5fb91f;font-family:'Courier New',monospace;">
              ▸ Signal 03
            </h2>
            <h3 style="margin:0 0 6px;font-size:18px;color:#e8e8ef;font-weight:600;line-height:1.3;">
              [Replace with signal title]
            </h3>
            <p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#c9cdd4;">
              Same shape.
            </p>
            <p style="margin:0 0 32px;font-size:13px;">
              <a href="https://rexintelservices.com/intel/REPLACE-ID" style="color:#5fb91f;text-decoration:none;font-weight:600;">Read the full breakdown →</a>
            </p>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:20px;">
              <tr>
                <td align="center" style="padding:18px;background:#5fb91f;border-radius:6px;">
                  <a href="https://rexintelservices.com/graph" style="font-family:'Courier New',monospace;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0a0a0f;font-weight:700;text-decoration:none;">
                    Open the attribution graph →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 32px 28px;border-top:1px solid #2a2a35;font-family:'Courier New',monospace;font-size:11px;color:#8888a0;line-height:1.7;">
            <div style="margin-bottom:6px;">— The Rex Intel Services team</div>
            <div>
              <a href="https://x.com/rexintelservice" style="color:#1fa8e0;text-decoration:none;">@rexintelservice</a>
              &nbsp;·&nbsp;
              <a href="mailto:rexintelservices@proton.me" style="color:#8888a0;text-decoration:none;">rexintelservices@proton.me</a>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
};
