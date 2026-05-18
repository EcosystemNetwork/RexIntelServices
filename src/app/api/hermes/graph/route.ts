import { NextResponse } from "next/server";
import { fetchGraphData } from "@/lib/graph-data";
import { requireHermes } from "@/lib/hermes-auth";

/**
 * GET /api/hermes/graph
 *
 * Programmatic dump of the address graph for Hermes. Accepts the same query
 * params as the public /graph page (window, kind, chain, view, category).
 *
 * Returns the same shape fetchGraphData() returns to the page — nodes,
 * edges, and meta. Operator-only.
 *
 * Note: there's also a public /api/graph that returns the same data without
 * auth. The reason this Hermes-namespaced version exists is so the operator
 * surface stays consistent — Hermes hits everything under /api/hermes/*
 * with the same bearer token, no special-casing.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denial = requireHermes(req);
  if (denial) return denial;

  const url = new URL(req.url);
  const data = await fetchGraphData({
    window: url.searchParams.get("window"),
    kind: url.searchParams.get("kind"),
    chain: url.searchParams.get("chain"),
    view: url.searchParams.get("view"),
    category: url.searchParams.get("category"),
  });

  return NextResponse.json({ ok: true, ...data });
}
