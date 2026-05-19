import { and, eq } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { IntelPayload } from "@/lib/db/schema";
import { parsePublicId } from "@/lib/slug";
import { payloadToHeroFields, renderHeroSvg } from "@/lib/intel-hero-svg";

/**
 * GET /intel/[publicId]/hero.svg
 *
 * Renders a typographic stat-card hero for the intel row. Drives the
 * IntelHero fallback so every approved article carries a hero image
 * without the curator having to upload one. Cacheable for a day — the
 * SVG is a pure function of the payload, which is itself rarely edited.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { publicId: string } },
) {
  const realId = parsePublicId(params.publicId) ?? params.publicId;
  const [row] = await db
    .select({ payload: submissions.payload })
    .from(submissions)
    .where(
      and(
        eq(submissions.publicId, realId),
        eq(submissions.type, "intel"),
        eq(submissions.status, "approved"),
      ),
    )
    .limit(1);

  if (!row) {
    return new Response("Not found", { status: 404 });
  }

  const svg = renderHeroSvg(payloadToHeroFields(row.payload as IntelPayload));
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
}
