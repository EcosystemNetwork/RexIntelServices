import type { IntelPayload } from "@/lib/db/schema";

/**
 * Server-renderable typographic stat-card hero for an intel article.
 *
 * Same visual vocabulary as scripts/generate-intel-heroes.ts (kicker /
 * statBig / statLabel / headline / subhead / caption) but accepts data
 * derived from an IntelPayload, so every approved row gets a hero image
 * automatically — no static-asset generation step, no payload field to
 * curate. Served from /intel/[publicId]/hero.svg.
 *
 * Trade-off: it's a generic stat card, not a hand-designed lander hero.
 * Hand-designed heroes still live in /public/intel-heroes/ and override
 * this fallback when `payload.heroImageUrl` is set.
 */

export type HeroAccent = "green" | "red" | "amber" | "blue";

export type HeroFields = {
  kicker: string;
  statBig: string;
  statLabel: string;
  headline: string;
  subhead: string;
  accent: HeroAccent;
  badge?: string;
  caption?: string;
};

const ACCENT_RGB: Record<HeroAccent, { hex: string; alt: string }> = {
  green: { hex: "#5fb91f", alt: "#1fa8e0" },
  red: { hex: "#f87171", alt: "#fbbf24" },
  amber: { hex: "#fbbf24", alt: "#f87171" },
  blue: { hex: "#60a5fa", alt: "#5fb91f" },
};

const KIND_KICKER: Record<NonNullable<IntelPayload["kind"]>, string> = {
  tip: "▸ TIP · INTEL WIRE",
  original: "▸ ORIGINAL · INVESTIGATIONS",
  incident: "▸ INCIDENT · POSTMORTEM",
};

const SEVERITY_BADGE: Record<NonNullable<IntelPayload["severity"]>, string> = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
  critical: "CRITICAL",
};

const SEVERITY_ACCENT: Record<NonNullable<IntelPayload["severity"]>, HeroAccent> = {
  low: "blue",
  medium: "amber",
  high: "amber",
  critical: "red",
};

const KIND_ACCENT: Record<NonNullable<IntelPayload["kind"]>, HeroAccent> = {
  tip: "blue",
  original: "green",
  incident: "red",
};

/**
 * Pull the most useful big-number out of the headline (e.g. "$1.5B", "$250M",
 * "$67K"). Falls back to the kind/category short tag. Recognises the formats
 * the harvesters emit: `$1.5B`, `$305M`, `$500k`, `$954K`, raw `1,500,000`.
 */
function extractBigStat(payload: IntelPayload): {
  big: string;
  label: string;
} {
  const headline = payload.headline ?? "";
  // Pre-formatted currency hit ($ + digits + optional unit) — what every
  // harvester writes today.
  const moneyMatch = headline.match(/\$\s?[\d.,]+\s?[KMBkmb]?/);
  if (moneyMatch) {
    const big = moneyMatch[0].replace(/\s+/g, "").toUpperCase();
    return { big, label: (payload.category ?? "INCIDENT").toUpperCase() };
  }
  // Bare integer with commas (e.g. "119,756 BTC stolen"). Trim to 6 chars
  // so it doesn't overflow the column.
  const numMatch = headline.match(/(\d{1,3}(?:,\d{3})+)/);
  if (numMatch) {
    return {
      big: numMatch[1].slice(0, 7),
      label: (payload.category ?? "INCIDENT").toUpperCase(),
    };
  }
  // Last resort: the kind itself as the stat. Surfaces an "OFAC" / "INCIDENT"
  // big-stat instead of leaving the column empty.
  const kindLabel = (payload.kind ?? "intel").toUpperCase();
  return { big: kindLabel, label: (payload.category ?? "REX INTEL").toUpperCase() };
}

export function payloadToHeroFields(payload: IntelPayload): HeroFields {
  const kind = payload.kind ?? "tip";
  const sev = payload.severity;
  const accent = sev ? SEVERITY_ACCENT[sev] : KIND_ACCENT[kind];
  const { big, label } = extractBigStat(payload);
  return {
    kicker: KIND_KICKER[kind],
    statBig: big,
    statLabel: label,
    headline: payload.headline ?? "Rex Intel",
    subhead:
      payload.dek ??
      payload.body.split(/\n+/)[0]?.replace(/[*_`#>]/g, "").trim() ??
      "",
    accent,
    badge: sev ? SEVERITY_BADGE[sev] : undefined,
    caption:
      payload.category ??
      (payload.sourceHarvester ? `Source: ${payload.sourceHarvester}` : undefined),
  };
}

export function renderHeroSvg(hero: HeroFields): string {
  const acc = ACCENT_RGB[hero.accent];
  const statLen = hero.statBig.length;
  const statFontPx =
    statLen <= 4 ? 380 : statLen <= 5 ? 320 : statLen <= 6 ? 270 : 230;
  const badge = hero.badge
    ? `
  <g transform="translate(1530 130)">
    <rect width="260" height="48" rx="2" fill="none" stroke="${acc.hex}" stroke-width="1.5"/>
    <text x="130" y="32" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="22" letter-spacing="6" fill="${acc.hex}" text-anchor="middle">${escapeXml(hero.badge)}</text>
  </g>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080" role="img" aria-label="${escapeXml(hero.headline)} — ${escapeXml(hero.statBig)} ${escapeXml(hero.statLabel)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b0b0d"/>
      <stop offset="1" stop-color="#06060a"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${acc.hex}"/>
      <stop offset="1" stop-color="${acc.alt}"/>
    </linearGradient>
    <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
      <path d="M80 0 L0 0 0 80" fill="none" stroke="#1a1a1f" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="1920" height="1080" fill="url(#bg)"/>
  <rect width="1920" height="1080" fill="url(#grid)" opacity="0.55"/>

  <g opacity="0.06" fill="${acc.hex}">
    <rect y="180" width="1920" height="1"/>
    <rect y="540" width="1920" height="1"/>
    <rect y="900" width="1920" height="1"/>
  </g>

  <rect x="120" y="120" width="4" height="840" fill="url(#accent)"/>

  <g font-family="ui-monospace,Menlo,Consolas,monospace" font-size="26" letter-spacing="6">
    <text x="160" y="160" fill="${acc.hex}">${escapeXml(hero.kicker)}</text>
  </g>
  ${badge}

  <g font-family="Georgia,'Times New Roman',serif" font-weight="700">
    <text x="160" y="500" font-size="${statFontPx}" fill="#ffffff" letter-spacing="-12">${escapeXml(hero.statBig)}</text>
  </g>

  <g font-family="ui-monospace,Menlo,Consolas,monospace" letter-spacing="4">
    <text x="160" y="570" font-size="32" fill="#9ca3af">${escapeXml(hero.statLabel)}</text>
  </g>

  <line x1="160" y1="640" x2="900" y2="640" stroke="${acc.hex}" stroke-width="2" opacity="0.4"/>

  <g font-family="Georgia,'Times New Roman',serif" font-weight="600" fill="#ffffff">
    ${renderHeadline(hero.headline, 160, 760, 68, 78)}
  </g>
  <g font-family="Georgia,'Times New Roman',serif" font-weight="400" fill="#9ca3af">
    ${renderSubhead(hero.subhead, 160, 920, 38, 50)}
  </g>

  <g font-family="ui-monospace,Menlo,Consolas,monospace" font-size="22" letter-spacing="4">
    <text x="160" y="1020" fill="${acc.hex}">REX INTEL SERVICES${hero.caption ? ` · ${escapeXml(hero.caption.toUpperCase())}` : ""}</text>
  </g>

  <g font-family="ui-monospace,Menlo,Consolas,monospace" font-size="20" letter-spacing="3" fill="#3a3a42">
    <text x="1760" y="1020" text-anchor="end">rex-intel-services</text>
  </g>
</svg>
`;
}

function renderHeadline(text: string, x: number, y: number, fontSize: number, lineHeight: number): string {
  const max = 42;
  if (text.length <= max) {
    return `<text x="${x}" y="${y}" font-size="${fontSize}">${escapeXml(text)}</text>`;
  }
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  const a = (space > 20 ? cut.slice(0, space) : cut).trim();
  const remaining = text.slice(a.length).trim();
  const b =
    remaining.length > max
      ? remaining.slice(0, max - 1).trimEnd() + "…"
      : remaining;
  return [
    `<text x="${x}" y="${y}" font-size="${fontSize}">${escapeXml(a)}</text>`,
    `<text x="${x}" y="${y + lineHeight}" font-size="${fontSize}">${escapeXml(b)}</text>`,
  ].join("\n    ");
}

function renderSubhead(text: string, x: number, y: number, fontSize: number, lineHeight: number): string {
  if (!text) return "";
  const max = 70;
  if (text.length <= max) {
    return `<text x="${x}" y="${y}" font-size="${fontSize}">${escapeXml(text)}</text>`;
  }
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  const a = (space > 30 ? cut.slice(0, space) : cut).trim();
  const remaining = text.slice(a.length).trim();
  const b =
    remaining.length > max
      ? remaining.slice(0, max - 1).trimEnd() + "…"
      : remaining;
  return [
    `<text x="${x}" y="${y}" font-size="${fontSize}">${escapeXml(a)}</text>`,
    `<text x="${x}" y="${y + lineHeight}" font-size="${fontSize}">${escapeXml(b)}</text>`,
  ].join("\n    ");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
