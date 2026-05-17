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
 *   window: 30 | 90 | 365 | all  (days; default 90)
 *   kind:   incident | original | all (default incident)
 *   chain:  any supported chain slug (optional)
 *
 * Public endpoint — no auth. Read-only.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const data = await fetchGraphData({
    window: url.searchParams.get("window"),
    kind: url.searchParams.get("kind"),
    chain: url.searchParams.get("chain"),
  });
  return NextResponse.json(data);
}
