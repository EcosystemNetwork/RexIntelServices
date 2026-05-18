import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { IntelPayload } from "@/lib/db/schema";
import { requireHermes } from "@/lib/hermes-auth";

/**
 * POST /api/hermes/intel
 *
 * Hermes creates or updates an intel submission. Matches on payload.headline
 * (same idempotency key the seed scripts use). Body should be the full
 * IntelPayload shape:
 *   {
 *     headline: "...",
 *     kind: "incident" | "original" | "tip",
 *     category?: "DeFi exploit" | "Exchange hack" | ...,
 *     severity?: "low" | "medium" | "high" | "critical",
 *     anonymous?: boolean,
 *     body: "...",
 *     sources?: string[],
 *     links?: string[],
 *     personas?: PersonaSlug[]
 *   }
 *
 * Hermes-authored intel publishes directly as approved (Hermes IS the
 * operator — no curator review queue for the operator's own writes).
 * Submissions from random callers without the bearer token cannot reach
 * this route at all.
 *
 * Returns { ok: true, action: "inserted"|"updated", publicId, intelUrl }.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denial = requireHermes(req);
  if (denial) return denial;

  let body: Partial<IntelPayload>;
  try {
    body = (await req.json()) as Partial<IntelPayload>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  // Minimal required-fields validation. Hermes is trusted (operator surface)
  // but a typo'd payload should still 400, not write garbage to the DB.
  if (
    !body.headline ||
    typeof body.headline !== "string" ||
    body.headline.length < 8
  ) {
    return NextResponse.json(
      { ok: false, error: "missing_or_short_headline" },
      { status: 400 },
    );
  }
  if (!body.kind || !["tip", "original", "incident"].includes(body.kind)) {
    return NextResponse.json(
      { ok: false, error: "invalid_kind", got: body.kind ?? null },
      { status: 400 },
    );
  }
  if (!body.body || typeof body.body !== "string" || body.body.length < 50) {
    return NextResponse.json(
      { ok: false, error: "missing_or_short_body" },
      { status: 400 },
    );
  }

  const payload: IntelPayload = {
    headline: body.headline,
    kind: body.kind,
    category: body.category,
    severity: body.severity ?? "medium",
    anonymous: body.anonymous ?? true,
    body: body.body,
    sources: body.sources,
    links: body.links,
    personas: body.personas,
  };

  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "intel"),
        sql`${submissions.payload}->>'headline' = ${payload.headline}`,
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(submissions)
      .set({
        payload,
        status: "approved",
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, existing[0].id));
    return NextResponse.json({
      ok: true,
      action: "updated",
      publicId: existing[0].publicId,
      intelUrl: `/intel/${existing[0].publicId}`,
    });
  }

  const [row] = await db
    .insert(submissions)
    .values({
      type: "intel",
      status: "approved",
      payload,
      publishedAt: new Date(),
    })
    .returning({ publicId: submissions.publicId });

  return NextResponse.json({
    ok: true,
    action: "inserted",
    publicId: row.publicId,
    intelUrl: `/intel/${row.publicId}`,
  });
}
