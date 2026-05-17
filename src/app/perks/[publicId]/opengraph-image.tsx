import { ImageResponse } from "next/og";
import { and, eq } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { PerksPayload } from "@/lib/db/schema";
import { OG_SIZE, OG_CONTENT_TYPE, OgCard } from "@/lib/og-card";
import { parsePublicId } from "@/lib/slug";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Perk / credits program on Rex Intel Services";

export default async function PerksOgImage({
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
        eq(submissions.type, "perks"),
        eq(submissions.status, "approved"),
      ),
    )
    .limit(1);

  const p = (row?.payload ?? {}) as Partial<PerksPayload>;
  const subtitle = [p.organization, p.category, p.ecosystem]
    .filter(Boolean)
    .join("  ·  ");

  return new ImageResponse(
    (
      <OgCard
        kicker="Perks"
        title={p.name ?? "Perk"}
        subtitle={subtitle || undefined}
        badge={p.value}
      />
    ),
    OG_SIZE,
  );
}
