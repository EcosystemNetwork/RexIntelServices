import { ImageResponse } from "next/og";
import { and, eq } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { PopupCityPayload } from "@/lib/db/schema";
import { OG_SIZE, OG_CONTENT_TYPE, OgCard } from "@/lib/og-card";
import { parsePublicId } from "@/lib/slug";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Pop-up city on Rex Intel Services";

export default async function PopupCityOgImage({
  params,
}: {
  params: { publicId: string };
}) {
  const publicId = parsePublicId(params.publicId) ?? params.publicId;
  const [row] = await db
    .select({
      payload: submissions.payload,
      eventStartsAt: submissions.eventStartsAt,
      eventEndsAt: submissions.eventEndsAt,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.publicId, publicId),
        eq(submissions.type, "popup_city"),
        eq(submissions.status, "approved"),
      ),
    )
    .limit(1);

  const p = (row?.payload ?? {}) as Partial<PopupCityPayload>;
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const dateStr =
    row?.eventStartsAt && row?.eventEndsAt
      ? `${fmt(new Date(row.eventStartsAt))} – ${fmt(new Date(row.eventEndsAt))}`
      : row?.eventStartsAt
        ? fmt(new Date(row.eventStartsAt))
        : "";
  const location = [p.city, p.country].filter(Boolean).join(", ");
  const subtitle = [dateStr, location, p.focus].filter(Boolean).join("  ·  ");

  return new ImageResponse(
    (
      <OgCard
        kicker="Pop-up City"
        title={p.name ?? "Pop-up City"}
        subtitle={subtitle || undefined}
      />
    ),
    OG_SIZE,
  );
}
