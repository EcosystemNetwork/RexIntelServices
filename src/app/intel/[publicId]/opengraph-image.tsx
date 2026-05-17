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
