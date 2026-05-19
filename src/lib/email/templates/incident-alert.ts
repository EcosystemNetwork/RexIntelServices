import type { NewsletterTemplate } from "./index";

export const incidentAlert: NewsletterTemplate = {
  id: "incident-alert",
  name: "Incident Alert",
  description:
    "Breaking incident drop. Red-banded header, single incident, CTA to full article.",
  category: "alert",
  subject: "INCIDENT ALERT: [headline]",
  previewText: "A new incident just landed in the moat. Loss size, vector, attribution.",
  htmlBody: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f7;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#0a0a0f;border-radius:8px;overflow:hidden;border:1px solid #f87171;">
        <tr>
          <td style="background:#f87171;padding:14px 32px;font-family:'Courier New',monospace;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#0a0a0f;font-weight:700;">
            ▲ INCIDENT ALERT
          </td>
        </tr>

        <tr>
          <td style="padding:28px 32px 8px;">
            <div style="font-family:'Courier News',monospace;font-size:11px;letter-spacing:0.16em;color:#8888a0;text-transform:uppercase;margin-bottom:8px;">
              [Date] · [Chain] · Reported by RexIntel
            </div>
            <h1 style="margin:0 0 14px;font-size:26px;line-height:1.2;color:#e8e8ef;font-weight:700;">
              [Replace with incident headline]
            </h1>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:14px 0 22px;">
              <tr>
                <td width="50%" style="padding:12px;background:#111118;border:1px solid #2a2a35;border-radius:6px;vertical-align:top;">
                  <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.16em;color:#8888a0;text-transform:uppercase;">Loss</div>
                  <div style="font-family:'Courier New',monospace;font-size:20px;color:#f87171;font-weight:700;margin-top:4px;">$XX.X M</div>
                </td>
                <td width="6">&nbsp;</td>
                <td width="50%" style="padding:12px;background:#111118;border:1px solid #2a2a35;border-radius:6px;vertical-align:top;">
                  <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.16em;color:#8888a0;text-transform:uppercase;">Vector</div>
                  <div style="font-family:'Courier New',monospace;font-size:13px;color:#e8e8ef;margin-top:4px;">[Bridge exploit / wallet drainer / etc.]</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:0 32px 24px;">
            <h2 style="margin:0 0 8px;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#5fb91f;font-family:'Courier New',monospace;">
              ▸ What happened
            </h2>
            <p style="margin:0 0 22px;font-size:14px;line-height:1.65;color:#c9cdd4;">
              One paragraph. Plain English. No speculation we can't back with an address.
            </p>

            <h2 style="margin:0 0 8px;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#5fb91f;font-family:'Courier New',monospace;">
              ▸ Attribution
            </h2>
            <p style="margin:0 0 8px;font-size:14px;line-height:1.65;color:#c9cdd4;">
              Operator cluster (if known) or "Unattributed".
            </p>
            <div style="font-family:'Courier New',monospace;font-size:12px;color:#1fa8e0;background:#111118;border:1px solid #2a2a35;border-radius:4px;padding:10px 12px;margin:0 0 22px;word-break:break-all;">
              0x0000000000000000000000000000000000000000
            </div>

            <h2 style="margin:0 0 8px;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#5fb91f;font-family:'Courier New',monospace;">
              ▸ Why this matters
            </h2>
            <p style="margin:0 0 28px;font-size:14px;line-height:1.65;color:#c9cdd4;">
              Two sentences. What pattern this fits. Who else may be exposed.
            </p>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td align="center" style="padding:18px;background:#5fb91f;border-radius:6px;">
                  <a href="https://rexintelservices.com/intel/REPLACE-ID" style="font-family:'Courier New',monospace;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0a0a0f;font-weight:700;text-decoration:none;">
                    Read full report →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:18px 32px 26px;border-top:1px solid #2a2a35;font-family:'Courier New',monospace;font-size:11px;color:#8888a0;line-height:1.7;">
            <div style="margin-bottom:6px;">— Rex Intel Services / Incident desk</div>
            <div>
              Tip line: <a href="mailto:rexintelservices@proton.me" style="color:#8888a0;text-decoration:none;">rexintelservices@proton.me</a>
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
