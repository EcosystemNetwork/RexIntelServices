import type {
  IntelPayload,
  EventPayload,
  PopupCityPayload,
  GrantPayload,
  AcceleratorPayload,
} from "@/lib/db/schema";

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

export type DigestPopupCity = {
  publicId: string;
  payload: PopupCityPayload;
  eventStartsAt: Date | null;
};

export type DigestGrant = {
  publicId: string;
  payload: GrantPayload;
};

export type DigestAccelerator = {
  publicId: string;
  payload: AcceleratorPayload;
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
  popupCities?: DigestPopupCity[];
  grants?: DigestGrant[];
  accelerators?: DigestAccelerator[];
  baseUrl: string;
  issueDate: Date;
}): RenderedDigest {
  const {
    intel,
    events,
    popupCities = [],
    grants = [],
    accelerators = [],
    baseUrl,
    issueDate,
  } = args;

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
    popupCities[0]?.payload.name ??
    grants[0]?.payload.name ??
    accelerators[0]?.payload.name ??
    "This week's curated intel and events.";

  const htmlBody = renderHtml({
    intel,
    events,
    popupCities,
    grants,
    accelerators,
    baseUrl,
    dateLabel,
  });
  const textBody = renderText({
    intel,
    events,
    popupCities,
    grants,
    accelerators,
    baseUrl,
    dateLabel,
  });
  const internalName = `Weekly Briefing — ${isoDate}`;

  return { subject, previewText, htmlBody, textBody, internalName };
}

function renderHtml(args: {
  intel: DigestIntel[];
  events: DigestEvent[];
  popupCities: DigestPopupCity[];
  grants: DigestGrant[];
  accelerators: DigestAccelerator[];
  baseUrl: string;
  dateLabel: string;
}): string {
  const { intel, events, popupCities, grants, accelerators, baseUrl, dateLabel } = args;

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

  const popupSection =
    popupCities.length === 0
      ? ""
      : `
        <h2 style="font:600 11px/1 ui-monospace,monospace;letter-spacing:0.18em;text-transform:uppercase;color:#1fa8e0;margin:36px 0 14px;">▸ Pop-Up Cities</h2>
        ${popupCities.map((c) => renderPopupItem(c, baseUrl)).join("")}
      `;

  const grantsSection =
    grants.length === 0
      ? ""
      : `
        <h2 style="font:600 11px/1 ui-monospace,monospace;letter-spacing:0.18em;text-transform:uppercase;color:#5fb91f;margin:36px 0 14px;">▸ Grants</h2>
        ${grants.map((g) => renderGrantItem(g, baseUrl)).join("")}
      `;

  const acceleratorsSection =
    accelerators.length === 0
      ? ""
      : `
        <h2 style="font:600 11px/1 ui-monospace,monospace;letter-spacing:0.18em;text-transform:uppercase;color:#5fb91f;margin:36px 0 14px;">▸ Accelerators</h2>
        ${accelerators.map((a) => renderAcceleratorItem(a, baseUrl)).join("")}
      `;

  const allEmpty =
    intel.length === 0 &&
    events.length === 0 &&
    popupCities.length === 0 &&
    grants.length === 0 &&
    accelerators.length === 0;
  const empty = allEmpty
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
        ${popupSection}
        ${grantsSection}
        ${acceleratorsSection}
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
      ? (() => {
          const c = severityColor(i.payload.severity!);
          return `<span style="display:inline-block;font:600 9px/1 ui-monospace,monospace;letter-spacing:0.16em;text-transform:uppercase;color:${c.hex};border:1px solid ${c.border};background:${c.bg};padding:3px 6px;border-radius:2px;margin-right:6px;">${escape(i.payload.severity!)}</span>`;
        })()
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

function renderPopupItem(c: DigestPopupCity, baseUrl: string): string {
  const url = `${baseUrl}/pop-up-cities/${c.publicId}`;
  const start = c.eventStartsAt;
  const dateLine = start
    ? start.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";
  const location = [c.payload.city, c.payload.country].filter(Boolean).join(", ");
  const meta = [dateLine, location, c.payload.focus].filter(Boolean).map((s) => escape(String(s))).join(" · ");
  return `
    <div style="margin:0 0 14px;padding:14px 16px;background:#18181f;border:1px solid #1e1e28;border-radius:4px;">
      <div style="font:600 15px/1.35 ui-sans-serif,system-ui,sans-serif;margin-bottom:4px;">
        <a href="${url}" style="color:#fff;text-decoration:none;">${escape(c.payload.name)}</a>
      </div>
      <div style="font:400 12px/1 ui-monospace,monospace;color:#55556a;">${meta}</div>
    </div>
  `;
}

function renderGrantItem(g: DigestGrant, baseUrl: string): string {
  const url = `${baseUrl}/grants/${g.publicId}`;
  const meta = [g.payload.organization, g.payload.amount, g.payload.rolling ? "Rolling" : null]
    .filter(Boolean)
    .map((s) => escape(String(s)))
    .join(" · ");
  return `
    <div style="margin:0 0 14px;padding:14px 16px;background:#18181f;border:1px solid #1e1e28;border-radius:4px;">
      <div style="font:600 15px/1.35 ui-sans-serif,system-ui,sans-serif;margin-bottom:4px;">
        <a href="${url}" style="color:#fff;text-decoration:none;">${escape(g.payload.name)}</a>
      </div>
      <div style="font:400 12px/1 ui-monospace,monospace;color:#55556a;">${meta}</div>
    </div>
  `;
}

function renderAcceleratorItem(a: DigestAccelerator, baseUrl: string): string {
  const url = `${baseUrl}/accelerators/${a.publicId}`;
  const meta = [a.payload.organization, a.payload.investment, a.payload.duration]
    .filter(Boolean)
    .map((s) => escape(String(s)))
    .join(" · ");
  return `
    <div style="margin:0 0 14px;padding:14px 16px;background:#18181f;border:1px solid #1e1e28;border-radius:4px;">
      <div style="font:600 15px/1.35 ui-sans-serif,system-ui,sans-serif;margin-bottom:4px;">
        <a href="${url}" style="color:#fff;text-decoration:none;">${escape(a.payload.name)}</a>
      </div>
      <div style="font:400 12px/1 ui-monospace,monospace;color:#55556a;">${meta}</div>
    </div>
  `;
}

function renderText(args: {
  intel: DigestIntel[];
  events: DigestEvent[];
  popupCities: DigestPopupCity[];
  grants: DigestGrant[];
  accelerators: DigestAccelerator[];
  baseUrl: string;
  dateLabel: string;
}): string {
  const { intel, events, popupCities, grants, accelerators, baseUrl, dateLabel } = args;
  const lines: string[] = [];
  lines.push(`RexIntel Briefing — ${dateLabel}`);
  lines.push("=".repeat(48));
  lines.push("");

  if (
    intel.length === 0 &&
    events.length === 0 &&
    popupCities.length === 0 &&
    grants.length === 0 &&
    accelerators.length === 0
  ) {
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

  if (popupCities.length > 0) {
    lines.push("POP-UP CITIES");
    lines.push("-".repeat(48));
    for (const c of popupCities) {
      const dateLine = c.eventStartsAt
        ? c.eventStartsAt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "";
      const location = [c.payload.city, c.payload.country].filter(Boolean).join(", ");
      const meta = [dateLine, location, c.payload.focus].filter(Boolean).join(" · ");
      lines.push(c.payload.name);
      if (meta) lines.push(meta);
      lines.push(`${baseUrl}/pop-up-cities/${c.publicId}`);
      lines.push("");
    }
  }

  if (grants.length > 0) {
    lines.push("GRANTS");
    lines.push("-".repeat(48));
    for (const g of grants) {
      const meta = [g.payload.organization, g.payload.amount, g.payload.rolling ? "Rolling" : null]
        .filter(Boolean)
        .join(" · ");
      lines.push(g.payload.name);
      if (meta) lines.push(meta);
      lines.push(`${baseUrl}/grants/${g.publicId}`);
      lines.push("");
    }
  }

  if (accelerators.length > 0) {
    lines.push("ACCELERATORS");
    lines.push("-".repeat(48));
    for (const a of accelerators) {
      const meta = [a.payload.organization, a.payload.investment, a.payload.duration]
        .filter(Boolean)
        .join(" · ");
      lines.push(a.payload.name);
      if (meta) lines.push(meta);
      lines.push(`${baseUrl}/accelerators/${a.publicId}`);
      lines.push("");
    }
  }

  lines.push("");
  lines.push(`Drop intel / submit a listing: ${baseUrl}/submit`);
  return lines.join("\n");
}

// Email-client-safe severity tones. We deliberately use rgba() instead of
// 8-digit hex (#rrggbbaa) because Outlook on Windows ignores the alpha byte
// and renders the badge fully opaque, which clobbers the dark email shell.
function severityColor(
  sev: NonNullable<IntelPayload["severity"]>,
): { hex: string; bg: string; border: string } {
  switch (sev) {
    case "low":
      return {
        hex: "#8888a0",
        bg: "rgba(136,136,160,0.10)",
        border: "rgba(136,136,160,0.30)",
      };
    case "medium":
      return {
        hex: "#60a5fa",
        bg: "rgba(96,165,250,0.10)",
        border: "rgba(96,165,250,0.30)",
      };
    case "high":
      return {
        hex: "#fbbf24",
        bg: "rgba(251,191,36,0.10)",
        border: "rgba(251,191,36,0.30)",
      };
    case "critical":
      return {
        hex: "#f87171",
        bg: "rgba(248,113,113,0.10)",
        border: "rgba(248,113,113,0.30)",
      };
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
