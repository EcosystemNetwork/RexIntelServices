import { ImageResponse } from "next/og";
import { and, eq } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { CapitalPayload } from "@/lib/db/schema";
import { OG_SIZE, OG_CONTENT_TYPE, OgCard } from "@/lib/og-card";
import { parsePublicId } from "@/lib/slug";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Capital source on Rex Intel Services";

export default async function CapitalOgImage({
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
        eq(submissions.type, "capital"),
        eq(submissions.status, "approved"),
      ),
    )
    .limit(1);

  const p = (row?.payload ?? {}) as Partial<CapitalPayload>;
  const subtitle = [p.stage, p.checkSize, p.focus].filter(Boolean).join("  ·  ");

  return new ImageResponse(
    (
      <OgCard
        kicker="Capital"
        title={p.name ?? "Capital source"}
        subtitle={subtitle || undefined}
        badge={p.decisionWindow}
      />
    ),
    OG_SIZE,
  );
}
