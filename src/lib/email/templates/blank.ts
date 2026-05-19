import type { NewsletterTemplate } from "./index";

export const blank: NewsletterTemplate = {
  id: "blank",
  name: "Blank canvas",
  description: "Empty scaffold — minimal 600px frame, system font, footer. Bring your own copy.",
  category: "blank",
  subject: "",
  previewText: "",
  htmlBody: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f7;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;color:#111;font-weight:700;">
              Hey {{firstName}},
            </h1>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#333;">
              Replace this with your copy.
            </p>
            <p style="margin:32px 0 0;font-size:14px;color:#555;">— Rex Intel Services</p>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 32px 24px;border-top:1px solid #eee;font-family:-apple-system,sans-serif;font-size:12px;color:#888;line-height:1.7;text-align:center;">
            <a href="https://x.com/rexintelservice" style="color:#888;text-decoration:underline;">@rexintelservice</a>
            &nbsp;·&nbsp;
            <a href="mailto:rexintelservices@proton.me" style="color:#888;text-decoration:underline;">rexintelservices@proton.me</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
};
