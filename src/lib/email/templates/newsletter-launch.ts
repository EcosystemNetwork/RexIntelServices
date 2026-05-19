import type { NewsletterTemplate } from "./index";

// Inaugural "we're live" broadcast. Two jobs:
//   1. Announce that Rex Intel's newsletter is now publishing.
//   2. Promote ETHConf (June 8-10 2026 NYC) with the NYC26 discount code.
// Hero image is the Rex-Intel × ETHConf social card pinned in /public.
export const newsletterLaunch: NewsletterTemplate = {
  id: "newsletter-launch",
  name: "Newsletter launch · ETHConf",
  description:
    "Inaugural broadcast announcing the Rex Intel newsletter + promoting ETHConf NYC (June 8-10) with discount code NYC26.",
  category: "newsletter",
  subject: "We're live — and we'll see you at ETHConf, {{firstName}}",
  previewText:
    "Rex Intel is officially broadcasting. First stop: ETHConf NYC (Jun 8-10). Code NYC26 inside.",
  htmlBody: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f7;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">

        <tr>
          <td style="background:#0a0a0f;padding:24px 32px;" align="center">
            <div style="font-family:'Courier New',monospace;font-size:13px;letter-spacing:0.28em;color:#5fb91f;text-transform:uppercase;font-weight:700;">
              ✦ Rex Intel Services · Issue 001
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:0;" align="center">
            <a href="https://ethconf.com/?ref=rexintel&utm_source=newsletter&utm_medium=email&utm_campaign=launch" style="display:block;line-height:0;">
              <img
                src="https://rexintelservices.com/Rex-Intel-ETHConf-Social-Card.png"
                width="600"
                alt="Rex Intel attending ETHConf — June 8-10 2026, New York City. Use code NYC26 for a discount."
                style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:0;text-decoration:none;"
              />
            </a>
          </td>
        </tr>

        <tr>
          <td style="padding:36px 36px 18px;">
            <p style="margin:0 0 8px;font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.24em;color:#5fb91f;text-transform:uppercase;font-weight:700;">
              Day one
            </p>
            <h1 style="margin:0 0 14px;font-size:30px;line-height:1.18;color:#111;font-weight:700;">
              We're live, {{firstName}}.
            </h1>
            <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#333;">
              You're reading the inaugural Rex Intel briefing. From here on out
              you'll get the signals nobody else is putting together:
              attribution graphs on the wallets behind the biggest hacks,
              incident alerts the day something lands, and long-form
              investigations on operators the rest of the space won't touch.
            </p>
            <p style="margin:0 0 8px;font-size:16px;line-height:1.65;color:#333;">
              No fluff, no recycled headlines, no Substack pivots. Just intel.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:8px 36px 22px;">
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
          <td style="padding:6px 36px 8px;">
            <div style="border-top:1px solid #e5e5e5;height:1px;line-height:1px;font-size:1px;">&nbsp;</div>
          </td>
        </tr>

        <tr>
          <td style="padding:22px 36px 6px;">
            <p style="margin:0 0 6px;font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.24em;color:#5fb91f;text-transform:uppercase;font-weight:700;">
              First stop · June 8–10, NYC
            </p>
            <h2 style="margin:0 0 12px;font-size:24px;line-height:1.22;color:#111;font-weight:700;">
              We'll be at ETHConf. You should be too.
            </h2>
            <p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#333;">
              ETHConf is the one room in New York this June where the people
              actually building the rails sit down with the people trying to
              break them. Rex Intel will be there — pulling threads, taking
              tips, and meeting subscribers in person.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 36px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0a0a0f;border-radius:8px;">
              <tr>
                <td style="padding:22px 24px;" align="center">
                  <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.22em;color:#9ca3af;text-transform:uppercase;font-weight:700;margin-bottom:8px;">
                    Use Rex's code at checkout
                  </div>
                  <div style="font-family:'Courier New',monospace;font-size:34px;letter-spacing:0.28em;color:#fde047;font-weight:700;margin-bottom:14px;">
                    NYC26
                  </div>
                  <a href="https://ethconf.com/?ref=rexintel&utm_source=newsletter&utm_medium=email&utm_campaign=launch&promo=NYC26" style="display:inline-block;padding:13px 26px;background:#fde047;border-radius:6px;font-family:'Courier New',monospace;font-size:13px;letter-spacing:0.14em;color:#0a0a0f;font-weight:700;text-decoration:none;text-transform:uppercase;">
                    Grab your ETHConf ticket →
                  </a>
                  <div style="font-family:-apple-system,sans-serif;font-size:12px;color:#9ca3af;margin-top:14px;line-height:1.5;">
                    June 8–10, 2026 · New York City · ethconf.com
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:0 36px 22px;">
            <h3 style="margin:0 0 14px;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#0a0a0f;font-family:-apple-system,sans-serif;font-weight:700;">
              What lands in your inbox from here
            </h3>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:10px;">
              <tr>
                <td width="40" valign="top" style="font-family:'Courier New',monospace;font-size:14px;color:#5fb91f;font-weight:700;padding-top:2px;">01</td>
                <td valign="top">
                  <div style="font-size:15px;color:#111;font-weight:600;margin-bottom:2px;">Monthly intel briefings</div>
                  <div style="font-size:14px;color:#555;line-height:1.5;">The signals worth knowing, with on-chain addresses wherever we can attribute.</div>
                </td>
              </tr>
            </table>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:10px;">
              <tr>
                <td width="40" valign="top" style="font-family:'Courier New',monospace;font-size:14px;color:#5fb91f;font-weight:700;padding-top:2px;">02</td>
                <td valign="top">
                  <div style="font-size:15px;color:#111;font-weight:600;margin-bottom:2px;">Incident alerts</div>
                  <div style="font-size:14px;color:#555;line-height:1.5;">Same-day notes the moment a meaningful hack, drain, or operator move lands.</div>
                </td>
              </tr>
            </table>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:22px;">
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
          <td style="padding:0 36px 28px;">
            <div style="font-size:13px;color:#666;line-height:1.65;padding:14px 16px;background:#f4f4f7;border-radius:6px;">
              <strong style="color:#111;">Sitting on a tip?</strong> The secure inbox is
              <a href="mailto:rexintelservices@proton.me" style="color:#0a0a0f;font-weight:600;">rexintelservices@proton.me</a>.
              Sources are anonymous by default.
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 36px 28px;border-top:1px solid #e5e5e5;font-family:-apple-system,sans-serif;font-size:12px;color:#888;line-height:1.7;text-align:center;">
            <div style="margin-bottom:6px;">— The Rex Intel Services team</div>
            <div>
              <a href="https://x.com/rexintelservice" style="color:#888;text-decoration:underline;">@rexintelservice</a>
              &nbsp;·&nbsp;
              <a href="https://rexintelservices.com" style="color:#888;text-decoration:underline;">rexintelservices.com</a>
            </div>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>`,
};
