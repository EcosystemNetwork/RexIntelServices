import { ImageResponse } from "next/og";
import { and, eq } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { EventPayload } from "@/lib/db/schema";
import { OG_SIZE, OG_CONTENT_TYPE, OgCard } from "@/lib/og-card";
import { parsePublicId } from "@/lib/slug";

// Node runtime because our Drizzle/Neon client conditionally requires `ws` for
// non-Edge environments. Edge can be enabled later if we audit that branch.
export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Event listing on Rex Intel Services";

export default async function EventOgImage({
  params,
}: {
  params: { publicId: string };
}) {
  const publicId = parsePublicId(params.publicId) ?? params.publicId;
  const [row] = await db
    .select({ payload: submissions.payload })
    .from(submissions)
    .where(
      and(
        eq(submissions.publicId, publicId),
        eq(submissions.type, "event"),
        eq(submissions.status, "approved"),
      ),
    )
    .limit(1);

  const p = (row?.payload ?? {}) as Partial<EventPayload>;
  const dateStr = p.startsAt
    ? new Date(p.startsAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";
  const location = [p.city, p.country].filter(Boolean).join(", ");
  const subtitle = [dateStr, location, p.eventType]
    .filter(Boolean)
    .join("  ·  ");

  return new ImageResponse(
    (
      <OgCard
        kicker={
          p.eventType === "hackathon" ? "Hackathon" : "Event"
        }
        title={p.name ?? "Event"}
        subtitle={subtitle || undefined}
      />
    ),
    OG_SIZE,
  );
}
