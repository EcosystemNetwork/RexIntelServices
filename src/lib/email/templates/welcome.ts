import type { NewsletterTemplate } from "./index";

export const welcome: NewsletterTemplate = {
  id: "welcome",
  name: "Welcome",
  description:
    "Onboarding email for new subscribers. Brand intro, three things you'll get, social follow strip.",
  category: "transactional",
  subject: "Welcome to Rex Intel Services, {{firstName}}",
  previewText:
    "You're in. Here's what to expect, where to follow, and how to send tips.",
  htmlBody: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f7;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:#0a0a0f;padding:24px 32px;" align="center">
            <div style="font-family:'Courier New',monospace;font-size:13px;letter-spacing:0.28em;color:#5fb91f;text-transform:uppercase;font-weight:700;">
              ✦ Rex Intel Services
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:36px 36px 18px;">
            <h1 style="margin:0 0 14px;font-size:30px;line-height:1.2;color:#111;font-weight:700;">
              You're in, {{firstName}}.
            </h1>
            <p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#333;">
              We send intelligence briefings on lost crypto, on-chain attribution,
              and the operators behind the bigger crimes. Plus the occasional
              long-form investigation when something is worth our time.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 36px 16px;">
            <h2 style="margin:0 0 14px;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#0a0a0f;font-family:-apple-system,sans-serif;font-weight:700;">
              What you'll get
            </h2>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:10px;">
              <tr>
                <td width="40" valign="top" style="font-family:'Courier New',monospace;font-size:14px;color:#5fb91f;font-weight:700;padding-top:2px;">01</td>
                <td valign="top">
                  <div style="font-size:15px;color:#111;font-weight:600;margin-bottom:2px;">Monthly intel briefings</div>
                  <div style="font-size:14px;color:#555;line-height:1.5;">The signals worth knowing, with addresses where we can attribute.</div>
                </td>
              </tr>
            </table>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:10px;">
              <tr>
                <td width="40" valign="top" style="font-family:'Courier New',monospace;font-size:14px;color:#5fb91f;font-weight:700;padding-top:2px;">02</td>
                <td valign="top">
                  <div style="font-size:15px;color:#111;font-weight:600;margin-bottom:2px;">Incident alerts</div>
                  <div style="font-size:14px;color:#555;line-height:1.5;">Sent the same day a meaningful incident lands.</div>
                </td>
              </tr>
            </table>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
              <tr>
                <td width="40" valign="top" style="font-family:'Courier New',monospace;font-size:14px;color:#5fb91f;font-weight:700;padding-top:2px;">03</td>
                <td valign="top">
                  <div style="font-size:15px;color:#111;font-weight:600;margin-bottom:2px;">Investigation drops</div>
                  <div style="font-size:14px;color:#555;line-height:1.5;">Long-form pieces when we have something the rest of the space doesn't.</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:0 36px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td align="center" style="padding:16px;background:#5fb91f;border-radius:6px;">
                  <a href="https://rexintelservices.com/graph" style="font-family:'Courier New',monospace;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0a0a0f;font-weight:700;text-decoration:none;">
                    Open the attribution graph →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:0 36px 28px;">
            <div style="font-size:13px;color:#666;line-height:1.65;padding:14px 16px;background:#f4f4f7;border-radius:6px;">
              <strong style="color:#111;">Got a tip?</strong> The secure inbox is
              <a href="mailto:rexintelservices@proton.me" style="color:#0a0a0f;font-weight:600;">rexintelservices@proton.me</a>.
              We treat sources as anonymous by default.
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 36px 28px;border-top:1px solid #e5e5e5;font-family:-apple-system,sans-serif;font-size:12px;color:#888;line-height:1.7;text-align:center;">
            <div style="margin-bottom:6px;">— The Rex Intel Services team</div>
            <div>
              <a href="https://x.com/rexintelservice" style="color:#888;text-decoration:underline;">@rexintelservice</a>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
};
