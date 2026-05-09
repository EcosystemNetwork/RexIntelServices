import type { IntelPayload, EventPayload } from "@/lib/db/schema";

export type DigestIntel = {
  publicId: string;
  payload: IntelPayload;
  publishedAt: Date | null;
};

export type DigestEvent = {
  publicId: string;
  payload: EventPayload;
  eventStartsAt: Date | null;
};

export type RenderedDigest = {
  subject: string;
  previewText: string;
  htmlBody: string;
  textBody: string;
  internalName: string;
};

/**
 * Pure renderer for the weekly briefing email. Takes the items the cron
 * pulled and returns a complete campaign payload (subject + html + text +
 * internal name). No DB calls, no env reads — easy to unit-test or preview.
 *
 * Inline styles only — most email clients strip <style> blocks. Tested
 * against Resend's HTML rendering.
 */
export function renderDigest(args: {
  intel: DigestIntel[];
  events: DigestEvent[];
  baseUrl: string;
  issueDate: Date;
}): RenderedDigest {
  const { intel, events, baseUrl, issueDate } = args;

  const dateLabel = issueDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const isoDate = issueDate.toISOString().slice(0, 10);

  const subject =
    intel.length > 0
      ? `RexIntel Briefing — ${intel.length} field report${intel.length === 1 ? "" : "s"}, ${events.length} event${events.length === 1 ? "" : "s"} ahead`
      : `RexIntel Briefing — ${events.length} event${events.length === 1 ? "" : "s"} on the horizon`;

  const previewText =
    intel[0]?.payload.headline ??
    events[0]?.payload.name ??
    "This week's curated intel and events.";

  const htmlBody = renderHtml({ intel, events, baseUrl, dateLabel });
  const textBody = renderText({ intel, events, baseUrl, dateLabel });
  const internalName = `Weekly Briefing — ${isoDate}`;

  return { subject, previewText, htmlBody, textBody, internalName };
}

function renderHtml(args: {
  intel: DigestIntel[];
  events: DigestEvent[];
  baseUrl: string;
  dateLabel: string;
}): string {
  const { intel, events, baseUrl, dateLabel } = args;

  const intelSection =
    intel.length === 0
      ? ""
      : `
        <h2 style="font:600 11px/1 ui-monospace,monospace;letter-spacing:0.18em;text-transform:uppercase;color:#5fb91f;margin:32px 0 14px;">▸ Field Reports</h2>
        ${intel.map((i) => renderIntelItem(i, baseUrl)).join("")}
      `;

  const eventsSection =
    events.length === 0
      ? ""
      : `
        <h2 style="font:600 11px/1 ui-monospace,monospace;letter-spacing:0.18em;text-transform:uppercase;color:#1fa8e0;margin:36px 0 14px;">▸ Field Calendar</h2>
        ${events.map((e) => renderEventItem(e, baseUrl)).join("")}
      `;

  const empty =
    intel.length === 0 && events.length === 0
      ? `<p style="font:400 14px/1.6 ui-sans-serif,system-ui,sans-serif;color:#666;">A quiet week on the wire. Back next Monday.</p>`
      : "";

  return `
<div style="background:#0a0a0f;padding:32px 16px;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#111118;border:1px solid #1e1e28;border-radius:6px;">
    <tr>
      <td style="padding:28px 28px 20px;border-bottom:1px solid #1e1e28;">
        <div style="font:600 10px/1 ui-monospace,monospace;letter-spacing:0.22em;text-transform:uppercase;color:#5fb91f;">● Classified // Eyes Only</div>
        <div style="font:600 24px/1.2 ui-sans-serif,system-ui,sans-serif;color:#fff;margin:10px 0 4px;">RexIntel Briefing</div>
        <div style="font:400 12px/1 ui-monospace,monospace;color:#55556a;">${escape(dateLabel)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 28px 28px;">
        ${empty}
        ${intelSection}
        ${eventsSection}
        <div style="margin-top:36px;padding-top:20px;border-top:1px solid #1e1e28;font:400 12px/1.6 ui-sans-serif,system-ui,sans-serif;color:#8888a0;">
          See something the field should know? <a href="${baseUrl}/submit" style="color:#5fb91f;text-decoration:none;">Drop it on the wire ▸</a>
        </div>
      </td>
    </tr>
  </table>
</div>
  `.trim();
}

function renderIntelItem(i: DigestIntel, baseUrl: string): string {
  const url = `${baseUrl}/intel/${i.publicId}`;
  const sevTag =
    i.payload.severity != null
      ? `<span style="display:inline-block;font:600 9px/1 ui-monospace,monospace;letter-spacing:0.16em;text-transform:uppercase;color:${severityColor(i.payload.severity)};border:1px solid ${severityColor(i.payload.severity)}40;background:${severityColor(i.payload.severity)}15;padding:3px 6px;border-radius:2px;margin-right:6px;">${escape(i.payload.severity)}</span>`
      : "";
  const catTag = i.payload.category
    ? `<span style="font:600 10px/1 ui-monospace,monospace;color:#55556a;">${escape(i.payload.category)}</span>`
    : "";
  const summary = truncate(i.payload.body.replace(/\s+/g, " "), 220);

  return `
    <div style="margin:0 0 18px;padding:16px;background:#18181f;border:1px solid #1e1e28;border-radius:4px;">
      <div style="margin-bottom:8px;">${sevTag}${catTag}</div>
      <div style="font:600 16px/1.35 ui-sans-serif,system-ui,sans-serif;margin-bottom:6px;">
        <a href="${url}" style="color:#fff;text-decoration:none;">${escape(i.payload.headline)}</a>
      </div>
      <div style="font:400 14px/1.55 ui-sans-serif,system-ui,sans-serif;color:#8888a0;">${escape(summary)}</div>
      <div style="margin-top:10px;"><a href="${url}" style="font:600 11px/1 ui-monospace,monospace;letter-spacing:0.12em;text-transform:uppercase;color:#5fb91f;text-decoration:none;">Read brief ▸</a></div>
    </div>
  `;
}

function renderEventItem(e: DigestEvent, baseUrl: string): string {
  const url = `${baseUrl}/events/${e.publicId}`;
  const start = e.eventStartsAt;
  const dateLine = start
    ? start.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "";
  const location = [e.payload.city, e.payload.country].filter(Boolean).join(", ");
  const meta = [dateLine, location, e.payload.eventType, e.payload.priceTier]
    .filter(Boolean)
    .map((s) => escape(String(s)))
    .join(" · ");

  return `
    <div style="margin:0 0 14px;padding:14px 16px;background:#18181f;border:1px solid #1e1e28;border-radius:4px;">
      <div style="font:600 15px/1.35 ui-sans-serif,system-ui,sans-serif;margin-bottom:4px;">
        <a href="${url}" style="color:#fff;text-decoration:none;">${escape(e.payload.name)}</a>
      </div>
      <div style="font:400 12px/1 ui-monospace,monospace;color:#55556a;">${meta}</div>
    </div>
  `;
}

function renderText(args: {
  intel: DigestIntel[];
  events: DigestEvent[];
  baseUrl: string;
  dateLabel: string;
}): string {
  const { intel, events, baseUrl, dateLabel } = args;
  const lines: string[] = [];
  lines.push(`RexIntel Briefing — ${dateLabel}`);
  lines.push("=".repeat(48));
  lines.push("");

  if (intel.length === 0 && events.length === 0) {
    lines.push("A quiet week on the wire. Back next Monday.");
  }

  if (intel.length > 0) {
    lines.push("FIELD REPORTS");
    lines.push("-".repeat(48));
    for (const i of intel) {
      const tags = [i.payload.severity, i.payload.category].filter(Boolean).join(" · ");
      if (tags) lines.push(`[${tags}]`);
      lines.push(i.payload.headline);
      lines.push(truncate(i.payload.body.replace(/\s+/g, " "), 220));
      lines.push(`${baseUrl}/intel/${i.publicId}`);
      lines.push("");
    }
  }

  if (events.length > 0) {
    lines.push("FIELD CALENDAR");
    lines.push("-".repeat(48));
    for (const e of events) {
      const dateLine = e.eventStartsAt
        ? e.eventStartsAt.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })
        : "";
      const location = [e.payload.city, e.payload.country].filter(Boolean).join(", ");
      const meta = [dateLine, location, e.payload.eventType].filter(Boolean).join(" · ");
      lines.push(e.payload.name);
      if (meta) lines.push(meta);
      lines.push(`${baseUrl}/events/${e.publicId}`);
      lines.push("");
    }
  }

  lines.push("");
  lines.push(`Drop intel: ${baseUrl}/submit`);
  return lines.join("\n");
}

function severityColor(sev: NonNullable<IntelPayload["severity"]>): string {
  switch (sev) {
    case "low":
      return "#8888a0";
    case "medium":
      return "#60a5fa";
    case "high":
      return "#fbbf24";
    case "critical":
      return "#f87171";
  }
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
