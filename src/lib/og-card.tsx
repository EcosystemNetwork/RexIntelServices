/**
 * Shared OG image renderer. Renders a 1200×630 brand card via Satori
 * (next/og under the hood) so social previews on Twitter / Discord / Slack
 * look consistent across every detail page.
 *
 * Constraints from Satori:
 *   - Only inline styles, no className. Tailwind doesn't apply.
 *   - No external fonts unless explicitly loaded into ImageResponse.
 *     We rely on the system stack so the renderer stays fast on the edge.
 *   - No JS interactivity — output is a static image.
 */

import type { ReactElement } from "react";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png" as const;

export type OgCardProps = {
  kicker: string;
  title: string;
  subtitle?: string;
  /** Optional accent label — small chip rendered above the title (severity, status, etc.). */
  badge?: string;
};

const BG = "#080a09";
const FG = "#ffffff";
const MUTED = "#9ca3a0";
const ACCENT = "#5fb91f";
const ACCENT_2 = "#1fa8e0";
const BORDER = "#1a1d1c";

export function OgCard({
  kicker,
  title,
  subtitle,
  badge,
}: OgCardProps): ReactElement {
  // Long titles wrap; cap at ~120 chars so layout doesn't overflow.
  const safeTitle = title.length > 120 ? title.slice(0, 117) + "…" : title;
  const safeSubtitle =
    subtitle && subtitle.length > 160 ? subtitle.slice(0, 157) + "…" : subtitle;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: BG,
        backgroundImage: `radial-gradient(circle at 85% 15%, rgba(31,168,224,0.10), transparent 55%), radial-gradient(circle at 15% 85%, rgba(95,185,31,0.12), transparent 55%)`,
        padding: "64px 72px",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
        color: FG,
      }}
    >
      {/* Top row: brand + kicker */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 22,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: ACCENT,
            fontWeight: 600,
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 9999,
              background: ACCENT,
              boxShadow: `0 0 14px ${ACCENT}`,
            }}
          />
          REX INTEL
        </div>
        <div
          style={{
            fontSize: 18,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: MUTED,
          }}
        >
          {kicker}
        </div>
      </div>

      {/* Title block */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {badge && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              alignSelf: "flex-start",
              padding: "6px 14px",
              border: `1px solid ${ACCENT}`,
              borderRadius: 4,
              color: ACCENT,
              fontSize: 18,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            {badge}
          </div>
        )}
        <div
          style={{
            fontSize: safeTitle.length > 70 ? 64 : 80,
            lineHeight: 1.05,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            display: "flex",
          }}
        >
          {safeTitle}
        </div>
        {safeSubtitle && (
          <div
            style={{
              fontSize: 28,
              color: MUTED,
              lineHeight: 1.35,
              display: "flex",
            }}
          >
            {safeSubtitle}
          </div>
        )}
      </div>

      {/* Bottom strip */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 24,
          borderTop: `1px solid ${BORDER}`,
        }}
      >
        <div
          style={{
            fontSize: 22,
            color: MUTED,
            letterSpacing: "0.04em",
          }}
        >
          rexintel.services
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 18,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: ACCENT_2,
            fontWeight: 600,
          }}
        >
          Crypto Intelligence
        </div>
      </div>
    </div>
  );
}
