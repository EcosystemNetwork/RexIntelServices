import { ImageResponse } from "next/og";
import { and, eq } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { AcceleratorPayload } from "@/lib/db/schema";
import { OG_SIZE, OG_CONTENT_TYPE, OgCard } from "@/lib/og-card";
import { parsePublicId } from "@/lib/slug";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Accelerator program on Rex Intel Services";

export default async function AcceleratorOgImage({
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
        eq(submissions.type, "accelerator"),
        eq(submissions.status, "approved"),
      ),
    )
    .limit(1);

  const p = (row?.payload ?? {}) as Partial<AcceleratorPayload>;
  const subtitle = [p.organization, p.investment, p.location, p.focus]
    .filter(Boolean)
    .join("  ·  ");

  return new ImageResponse(
    (
      <OgCard
        kicker="Accelerator"
        title={p.name ?? "Accelerator"}
        subtitle={subtitle || undefined}
        badge={p.rolling ? "ROLLING" : p.duration}
      />
    ),
    OG_SIZE,
  );
}
