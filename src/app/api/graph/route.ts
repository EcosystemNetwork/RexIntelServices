import { NextResponse } from "next/server";
import { fetchGraphData } from "@/lib/graph-data";

/**
 * GET /api/graph
 *
 * JSON payload backing the public address graph view. Returns a windowed
 * slice of incident-tagged intel and the addresses they reference, plus
 * derived address↔address co-occurrence edges. The data logic lives in
 * `@/lib/graph-data` so the /graph page can call it server-side without
 * a self-fetch round-trip.
 *
 * Query params:
 *   window:         30 | 90 | 365 | all  (days; default 90)
 *   kind:           incident | original | all (default incident)
 *   chain:          any supported chain slug (optional)
 *   view:           incidents | institutional | combined (default incidents)
 *   category:       any address_category slug — filters institutional/combined
 *   user_reported:  "1" to include community-loss-report attributions
 *                   (firsthand victim claims). Off by default.
 *   severity:       low | medium | high | critical — filters incident nodes
 *   source:         any address_attribution_source slug — filters addresses
 *   owner_kind:     any address_owner_kind slug — filters addresses
 *   min_confidence: 0–100 — drops addresses below the threshold
 *
 * Public endpoint — no auth. Read-only.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const minConfRaw = url.searchParams.get("min_confidence");
  const data = await fetchGraphData({
    window: url.searchParams.get("window"),
    kind: url.searchParams.get("kind"),
    chain: url.searchParams.get("chain"),
    view: url.searchParams.get("view"),
    category: url.searchParams.get("category"),
    includeUserReported: url.searchParams.get("user_reported") === "1",
    severity: url.searchParams.get("severity"),
    source: url.searchParams.get("source"),
    ownerKind: url.searchParams.get("owner_kind"),
    minConfidence: minConfRaw == null ? null : Number(minConfRaw),
    crew: url.searchParams.get("crew"),
  });
  return NextResponse.json(data);
}
