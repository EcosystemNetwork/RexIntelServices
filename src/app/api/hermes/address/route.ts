import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { addresses, db, intelAddresses, submissions } from "@/lib/db";
import { requireHermes } from "@/lib/hermes-auth";

/**
 * POST /api/hermes/address
 *
 * Hermes upserts an address (same shape as the seed-intel-addresses.ts
 * AddrEntry) and optionally links it to an intel submission. This is the
 * programmatic equivalent of running a one-off seed entry — same upsert
 * semantics (dedupe on chain + lower(address)).
 *
 * Body shape:
 *   {
 *     chain: "ethereum",
 *     address: "0x...",
 *     label?: string,
 *     notes?: string,
 *     category?: "lost" | "sanctioned" | "government-seized" | ...,
 *     ownerName?: string,
 *     balanceEstimateUsd?: number,
 *     nativeAmount?: number,
 *     nativeSymbol?: string,
 *     linkTo?: {
 *       headline: string,     // existing intel piece's headline
 *       role: "subject" | "counterparty" | "observed"
 *     }
 *   }
 *
 * Returns the addressId + whether it was a new insert or an update, plus
 * the intel link result if linkTo was provided.
 */
export const dynamic = "force-dynamic";

type Body = {
  chain?: string;
  address?: string;
  label?: string;
  notes?: string;
  category?: string;
  ownerName?: string;
  balanceEstimateUsd?: number;
  nativeAmount?: number;
  nativeSymbol?: string;
  linkTo?: { headline?: string; role?: string };
};

const VALID_CATEGORIES = new Set([
  "exchange",
  "defi-protocol",
  "treasury",
  "foundation",
  "bridge",
  "mixer",
  "sanctioned",
  "government-seized",
  "lost",
  "dormant",
  "hack-source",
  "hack-destination",
  "validator",
  "personality",
  "market-maker",
  "mev-bot",
  "scam",
]);

const VALID_ROLES = new Set(["subject", "counterparty", "observed"]);

export async function POST(req: Request) {
  const denial = requireHermes(req);
  if (denial) return denial;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  if (!body.chain || typeof body.chain !== "string") {
    return NextResponse.json(
      { ok: false, error: "missing_chain" },
      { status: 400 },
    );
  }
  if (!body.address || typeof body.address !== "string") {
    return NextResponse.json(
      { ok: false, error: "missing_address" },
      { status: 400 },
    );
  }
  if (body.category && !VALID_CATEGORIES.has(body.category)) {
    return NextResponse.json(
      { ok: false, error: "invalid_category", got: body.category },
      { status: 400 },
    );
  }

  const chain = body.chain.toLowerCase().trim();

  const attrPatch: Record<string, unknown> = {};
  if (body.label !== undefined) attrPatch.label = body.label;
  if (body.notes !== undefined) attrPatch.notes = body.notes;
  if (body.category !== undefined) attrPatch.category = body.category;
  if (body.ownerName !== undefined) attrPatch.ownerName = body.ownerName;
  if (body.balanceEstimateUsd !== undefined)
    attrPatch.balanceEstimateUsd = String(body.balanceEstimateUsd);
  if (body.nativeAmount !== undefined)
    attrPatch.nativeAmount = String(body.nativeAmount);
  if (body.nativeSymbol !== undefined)
    attrPatch.nativeSymbol = body.nativeSymbol.toUpperCase();

  // Dedupe on (chain, lower(address)).
  const [existing] = await db
    .select({ id: addresses.id })
    .from(addresses)
    .where(
      and(
        eq(addresses.chain, chain),
        sql`lower(${addresses.address}) = lower(${body.address})`,
      ),
    )
    .limit(1);

  let addressId: string;
  let action: "inserted" | "updated";

  if (existing) {
    await db
      .update(addresses)
      .set({ ...attrPatch, updatedAt: new Date() })
      .where(eq(addresses.id, existing.id));
    addressId = existing.id;
    action = "updated";
  } else {
    const [inserted] = await db
      .insert(addresses)
      .values({
        chain,
        address: body.address,
        ...attrPatch,
      })
      .returning({ id: addresses.id });
    addressId = inserted.id;
    action = "inserted";
  }

  // Optional intel linkage. Headline must already exist as an intel
  // submission — Hermes should call POST /api/hermes/intel first if needed.
  let linkResult: {
    linked: boolean;
    submissionId?: string;
    headline?: string;
    role?: string;
    error?: string;
  } | null = null;

  if (body.linkTo?.headline) {
    if (!body.linkTo.role || !VALID_ROLES.has(body.linkTo.role)) {
      linkResult = {
        linked: false,
        error: "invalid_or_missing_role",
        headline: body.linkTo.headline,
      };
    } else {
      const [sub] = await db
        .select({ id: submissions.id })
        .from(submissions)
        .where(
          and(
            eq(submissions.type, "intel"),
            sql`${submissions.payload}->>'headline' = ${body.linkTo.headline}`,
          ),
        )
        .limit(1);
      if (!sub) {
        linkResult = {
          linked: false,
          error: "headline_not_found",
          headline: body.linkTo.headline,
        };
      } else {
        await db
          .insert(intelAddresses)
          .values({
            submissionId: sub.id,
            addressId,
            role: body.linkTo.role as "subject" | "counterparty" | "observed",
          })
          .onConflictDoNothing();
        linkResult = {
          linked: true,
          submissionId: sub.id,
          headline: body.linkTo.headline,
          role: body.linkTo.role,
        };
      }
    }
  }

  return NextResponse.json({
    ok: true,
    action,
    addressId,
    chain,
    address: body.address,
    link: linkResult,
  });
}
