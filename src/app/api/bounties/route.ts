import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  bounties,
  hackTraces,
  submitters,
  type BountyKind,
  type BountyStatus,
} from "@/lib/db";
import { mintVictimAccessToken, validateCreateBounty } from "@/lib/bounty";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { getMagicSession } from "@/lib/magic-auth";
import { consumeEmailVerifiedCookie } from "@/lib/email-otp";
import {
  bountyAccessUrl,
  sendBountyFundingEmail,
} from "@/lib/email/bounty-funding-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =====================================================================
// GET /api/bounties
//
// Public listing. Only returns bounties whose status is one of the
// publicly-visible states (open | adjudicating | paid). Draft / funded
// bounties stay private until they hit `open` (post-funding-webhook), and
// expired / refunded bounties drop off the public surface.
//
// Optional query params:
//   ?kind=recovery|info_recovery|info_arrest
//   ?status=open|adjudicating|paid       (overrides default visible set)
//   ?limit=N                              (clamped 1..100, default 50)
// =====================================================================

import { DEFAULT_VISIBLE_STATUSES } from "@/lib/bounty-visibility";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const kindParam = url.searchParams.get("kind") as BountyKind | null;
  const statusParam = url.searchParams.get("status") as BountyStatus | null;
  const limitParam = Number(url.searchParams.get("limit") ?? "50");
  const limit = Math.max(1, Math.min(100, Math.trunc(limitParam) || 50));

  const statusFilter: BountyStatus[] = statusParam
    ? DEFAULT_VISIBLE_STATUSES.includes(statusParam)
      ? [statusParam]
      : DEFAULT_VISIBLE_STATUSES
    : DEFAULT_VISIBLE_STATUSES;

  const where = kindParam
    ? and(
        inArray(bounties.status, statusFilter),
        eq(bounties.kind, kindParam),
      )
    : inArray(bounties.status, statusFilter);

  const rows = await db
    .select({
      publicId: bounties.publicId,
      kind: bounties.kind,
      status: bounties.status,
      recoveryPercentBps: bounties.recoveryPercentBps,
      flatAmountUsdc: bounties.flatAmountUsdc,
      escrowedAmountUsdc: bounties.escrowedAmountUsdc,
      policeReportFiled: bounties.policeReportFiled,
      expiresAt: bounties.expiresAt,
      createdAt: bounties.createdAt,
    })
    .from(bounties)
    .where(where)
    .orderBy(desc(bounties.createdAt))
    .limit(limit);

  return NextResponse.json({ ok: true, bounties: rows });
}

// =====================================================================
// POST /api/bounties
//
// Create a draft bounty. The bounty is not yet visible publicly and no
// funds have moved — the response carries the publicId and a `fundingUrl`
// the victim follows to deposit USDC into the custodial escrow wallet.
// A separate /fund route flips draft → funded → open once Circle confirms.
//
// Anyone with a hack_trace public_id can create a draft against their
// trace; we re-verify the email matches the trace's submitter email so a
// stranger can't piggyback bounties onto someone else's trace.
//
// Body:
//   { hackTracePublicId?: string,
//     victimEmail: string,
//     kind: "recovery" | "info_recovery" | "info_arrest",
//     recoveryPercentBps?: number,    // required for kind=recovery
//     flatAmountUsdc?: number,        // required for flat kinds
//     policeReportFiled?: boolean,    // required true for info_arrest
//     policeReportRef?: string,
//     expiresInDays: number,
//     description: string,
//     termsAccepted: boolean }
// =====================================================================

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  // 5 draft bounty creates per IP per hour — bounties are economically
  // expensive to fund so spammy drafts are pure noise.
  const limit = await rateLimit(`bounty-create:${ip}`, 5, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  type Body = {
    hackTracePublicId?: string;
    victimEmail?: string;
    kind?: BountyKind;
    recoveryPercentBps?: number | null;
    flatAmountUsdc?: number | null;
    policeReportFiled?: boolean;
    policeReportRef?: string | null;
    expiresInDays?: number;
    description?: string;
    termsAccepted?: boolean;
  };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const victimEmail = (body.victimEmail ?? "").trim().toLowerCase();
  const kind = body.kind;
  if (!kind || !["recovery", "info_recovery", "info_arrest"].includes(kind)) {
    return NextResponse.json(
      { ok: false, error: "invalid_kind" },
      { status: 400 },
    );
  }

  const expiresInDays =
    typeof body.expiresInDays === "number" ? body.expiresInDays : 30;

  const errs = validateCreateBounty({
    victimEmail,
    kind,
    recoveryPercentBps: body.recoveryPercentBps ?? null,
    flatAmountUsdc: body.flatAmountUsdc ?? null,
    policeReportFiled: !!body.policeReportFiled,
    policeReportRef: body.policeReportRef ?? null,
    expiresInDays,
    description: body.description ?? "",
    termsAccepted: !!body.termsAccepted,
  });
  if (errs.length > 0) {
    return NextResponse.json(
      { ok: false, error: "validation_failed", details: errs },
      { status: 400 },
    );
  }

  // Resolve the optional hack_trace anchor. If supplied, the trace must
  // exist AND its submitter_email must match the victim email — bounties
  // are tied to the victim of record, not whoever found the trace later.
  let hackTraceId: string | null = null;
  if (body.hackTracePublicId) {
    const [trace] = await db
      .select({ id: hackTraces.id, email: hackTraces.submitterEmail })
      .from(hackTraces)
      .where(eq(hackTraces.publicId, body.hackTracePublicId))
      .limit(1);
    if (!trace) {
      return NextResponse.json(
        { ok: false, error: "hack_trace_not_found" },
        { status: 404 },
      );
    }
    if ((trace.email ?? "").toLowerCase() !== victimEmail) {
      return NextResponse.json(
        { ok: false, error: "victim_email_mismatch" },
        { status: 403 },
      );
    }
    hackTraceId = trace.id;
  }

  // Try to link to an existing submitter row if the victim already has a
  // Circle wallet. Bounty still works for anon victims (just an email).
  const [matched] = await db
    .select({ id: submitters.id, email: submitters.email })
    .from(submitters)
    .where(eq(submitters.email, victimEmail))
    .limit(1);
  const victimSubmitterId = matched?.id ?? null;

  // Victim ownership proof. Two routes accepted:
  //   (a) Circle session present AND its submitter row's email matches —
  //       the caller is logged in as the victim. Strongest proof.
  //   (b) The single-use email-OTP cookie is present and matches —
  //       caller just completed an OTP round for this exact email.
  // If neither is true the bounty is still created (rate-limited drafts
  // are fine), but victim_verified_at stays null and the /fund route
  // refuses to flip it to `open`. The creator can complete OTP later via
  // /verify-victim using the access token.
  let victimVerifiedAt: Date | null = null;
  const session = await getMagicSession();
  if (session && matched?.email?.toLowerCase() === victimEmail) {
    victimVerifiedAt = new Date();
  } else if (await consumeEmailVerifiedCookie(victimEmail)) {
    victimVerifiedAt = new Date();
  }

  const expiresAt = new Date(
    Date.now() + Math.trunc(expiresInDays) * 24 * 60 * 60 * 1000,
  );

  // One-shot raw access token. Stored as SHA-256 in the DB so a snapshot
  // leak doesn't yield working tokens. We return the raw token below; the
  // creator must capture it now (or via the funding-instructions email).
  const accessToken = mintVictimAccessToken();

  // Insert FIRST so we have a publicId to use as the Circle wallet refId.
  // The wallet provisioning step writes back the wallet id + address.
  const [created] = await db
    .insert(bounties)
    .values({
      hackTraceId,
      victimEmail,
      victimSubmitterId,
      kind,
      recoveryPercentBps:
        kind === "recovery" ? (body.recoveryPercentBps ?? null) : null,
      flatAmountUsdc:
        kind !== "recovery"
          ? (body.flatAmountUsdc as number).toFixed(2)
          : null,
      policeReportFiled: !!body.policeReportFiled,
      policeReportRef: body.policeReportRef ?? null,
      termsAcceptedAt: new Date(),
      expiresAt,
      description: (body.description ?? "").trim(),
      status: "draft",
      victimVerifiedAt,
      victimAccessTokenHash: accessToken.hash,
    })
    .returning({
      id: bounties.id,
      publicId: bounties.publicId,
      status: bounties.status,
    });

  if (!created) {
    return NextResponse.json(
      { ok: false, error: "insert_failed" },
      { status: 500 },
    );
  }

  // Escrow rail is currently un-wired. Circle DCW was removed when we moved
  // off Circle entirely; a replacement custody answer (Privy server wallets,
  // self-custody EOA, or an on-chain escrow contract) hasn't been picked
  // yet. Bounty rows still create — the public listing renders the offer —
  // but no on-chain escrow exists for them, so payouts cannot fire. The
  // create response carries a warning flag the client can surface to the
  // victim. See project_recovery_bounties_v1 memory for the v1.1 plan.
  const escrowAddress: string | null = null;
  const walletProvisionWarning =
    "custody_rail_pending: bounty escrow rail is being rebuilt; payouts not available yet";

  // Send funding-instructions email. Non-fatal: if Resend is down or env
  // isn't set we still return the access token in the response so the UI
  // can surface it. The email is the fallback when the user closes the tab.
  try {
    const accessUrl = bountyAccessUrl(created.publicId, accessToken.raw);
    await sendBountyFundingEmail({
      to: victimEmail,
      bountyPublicId: created.publicId,
      accessUrl,
      fundingAmountUsdc:
        kind === "recovery" ? null : (body.flatAmountUsdc as number),
      depositAddress: escrowAddress,
      blockchain: process.env.CIRCLE_BOUNTY_BLOCKCHAIN ?? "BASE",
      victimVerified: victimVerifiedAt != null,
    });
  } catch (err) {
    console.warn(
      `[bounty-create] funding email failed for ${created.publicId}`,
      err,
    );
  }

  // Build the share URLs. The raw access token is appended as ?token=…
  // so the creator's first page reload lands on the gated detail view
  // without needing a session.
  const tokenSuffix = `?token=${accessToken.raw}`;

  return NextResponse.json({
    ok: true,
    publicId: created.publicId,
    status: created.status,
    victimVerified: victimVerifiedAt != null,
    // Returned ONCE — store it client-side or in email immediately.
    victimAccessToken: accessToken.raw,
    escrowAddress,
    walletProvisionWarning,
    fundingUrl: `/bounties/${created.publicId}/fund${tokenSuffix}`,
    bountyUrl: `/bounties/${created.publicId}${tokenSuffix}`,
  });
}

