import { ImageResponse } from "next/og";
import { and, eq } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { JobPayload } from "@/lib/db/schema";
import { OG_SIZE, OG_CONTENT_TYPE, OgCard } from "@/lib/og-card";
import { parsePublicId } from "@/lib/slug";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Job listing on Rex Intel Services";

export default async function JobOgImage({
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
        eq(submissions.type, "job"),
        eq(submissions.status, "approved"),
      ),
    )
    .limit(1);

  const p = (row?.payload ?? {}) as Partial<JobPayload>;
  const subtitleBits = [
    p.location,
    p.remote === true ? "Remote" : null,
    p.seniority,
    p.employmentType,
  ].filter(Boolean);

  return new ImageResponse(
    (
      <OgCard
        kicker={p.company ? `Hiring · ${p.company}` : "Open Role"}
        title={p.title ?? "Open Role"}
        subtitle={subtitleBits.join("  ·  ") || undefined}
        badge={p.remote === true ? "Remote" : undefined}
      />
    ),
    OG_SIZE,
  );
}
