import { ImageResponse } from "next/og";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { HackathonPayload } from "@/lib/db/schema";
import { OG_SIZE, OG_CONTENT_TYPE, OgCard } from "@/lib/og-card";
import { parsePublicId } from "@/lib/slug";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Hackathon on Rex Intel Services";

export default async function HackathonOgImage({
  params,
}: {
  params: { publicId: string };
}) {
  const publicId = parsePublicId(params.publicId) ?? params.publicId;
  // Hackathons share the events table — stored as type='event' with
  // payload.eventType='hackathon'. The previous filter on type='hackathon'
  // (a defined enum value but unused in practice) returned no rows, so every
  // social share rendered a blank card.
  const [row] = await db
    .select({ payload: submissions.payload, eventStartsAt: submissions.eventStartsAt })
    .from(submissions)
    .where(
      and(
        eq(submissions.publicId, publicId),
        eq(submissions.type, "event"),
        sql`${submissions.payload}->>'eventType' = 'hackathon'`,
        eq(submissions.status, "approved"),
      ),
    )
    .limit(1);

  const p = (row?.payload ?? {}) as Partial<HackathonPayload>;
  const dateStr = row?.eventStartsAt
    ? new Date(row.eventStartsAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";
  const location = [p.city, p.country].filter(Boolean).join(", ");
  const subtitle = [dateStr, location, p.mode].filter(Boolean).join("  ·  ");

  return new ImageResponse(
    (
      <OgCard
        kicker="Hackathon"
        title={p.name ?? "Hackathon"}
        subtitle={subtitle || undefined}
        badge={p.prizePool}
      />
    ),
    OG_SIZE,
  );
}
