import { ImageResponse } from "next/og";
import { and, eq } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { IntelPayload } from "@/lib/db/schema";
import { OG_SIZE, OG_CONTENT_TYPE, OgCard } from "@/lib/og-card";
import { parsePublicId } from "@/lib/slug";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Intel report on Rex Intel Services";

export default async function IntelOgImage({
  params,
}: {
  params: { publicId: string };
}) {
  const publicId = parsePublicId(params.publicId) ?? params.publicId;
  const [row] = await db
    .select({ payload: submissions.payload, publishedAt: submissions.publishedAt })
    .from(submissions)
    .where(
      and(
        eq(submissions.publicId, publicId),
        eq(submissions.type, "intel"),
        eq(submissions.status, "approved"),
      ),
    )
    .limit(1);

  const p = (row?.payload ?? {}) as Partial<IntelPayload>;

  // When an explicit hero image is set, layer the kicker + headline over it
  // as a "cinema" card. Falls back to the plain branded card when there's
  // no hero — keeps existing 80+ rows looking identical.
  const dateStr = row?.publishedAt
    ? new Date(row.publishedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";
  const subtitle = [p.category, dateStr].filter(Boolean).join("  ·  ");

  const kicker =
    p.kind === "incident"
      ? "Incident · Postmortem"
      : p.kind === "original"
        ? "Original Signal"
        : "Intel Wire";
  const badge = p.severity ? p.severity.toUpperCase() : undefined;

  if (p.heroImageUrl) {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            position: "relative",
            width: "100%",
            height: "100%",
            background: "#0b0b0d",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.heroImageUrl}
            alt=""
            width={OG_SIZE.width}
            height={OG_SIZE.height}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          {/* Bottom-to-top gradient so the headline stays legible no matter
              what color the hero is. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.40) 55%, rgba(0,0,0,0.92) 100%)",
              display: "flex",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 64,
              right: 64,
              bottom: 56,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              color: "#fff",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 22,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: "#5fb91f",
                fontFamily: "monospace",
              }}
            >
              <span>▸ {kicker}</span>
              {badge && (
                <span
                  style={{
                    padding: "4px 10px",
                    border: "1px solid rgba(248,113,113,0.6)",
                    color: "#f87171",
                    fontSize: 18,
                    letterSpacing: 2,
                  }}
                >
                  {badge}
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: 60,
                lineHeight: 1.05,
                letterSpacing: -1.2,
                fontWeight: 600,
                maxWidth: "92%",
              }}
            >
              {p.headline ?? "Intel Report"}
            </div>
            {subtitle && (
              <div
                style={{
                  fontSize: 22,
                  fontFamily: "monospace",
                  color: "rgba(255,255,255,0.72)",
                }}
              >
                {subtitle}
              </div>
            )}
            <div
              style={{
                fontSize: 20,
                fontFamily: "monospace",
                color: "rgba(255,255,255,0.5)",
                letterSpacing: 2,
                textTransform: "uppercase",
                marginTop: 4,
              }}
            >
              Rex Intel Services
            </div>
          </div>
        </div>
      ),
      OG_SIZE,
    );
  }

  return new ImageResponse(
    (
      <OgCard
        kicker={kicker}
        title={p.headline ?? "Intel Report"}
        subtitle={subtitle || undefined}
        badge={badge}
      />
    ),
    OG_SIZE,
  );
}
