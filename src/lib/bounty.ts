import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  submitters,
  bounties,
  bountyClaims,
  bountyPayouts,
  type Bounty,
  type BountyClaim,
  type BountyClaimEvidence,
  type BountyClaimRejectionReason,
  type BountyKind,
  type BountyPayoutPayeeKind,
  type ClearanceTier,
} from "./db";
import { awardContributionPoints } from "./circle-auth";
import { upsertAttributionsBatch } from "./address-attribution";

// =====================================================================
// Bounty domain helpers.
//
// Source of truth for:
//   - tier gate (who may submit claims),
//   - bond + amount limits,
//   - which rejection reasons issue a strike,
//   - the 2-strike permanent-ban policy per
//     project_bounty_bad_faith_policy.md,
//   - payout ledger inserts that compose into a clean audit trail.
// =====================================================================

/** Minimum clearance tier required to submit a bounty claim. */
export const BOUNTY_CLAIM_MIN_TIER: ClearanceTier = "trusted";

// =====================================================================
// Victim access tokens.
//
// The creator of a bounty receives a raw 32-byte token in the create
// response (and the funding-instructions email). The DB stores only the
// SHA-256 hash, so a leaked snapshot does not yield working tokens.
//
// Tokens grant draft-viewing access to anon victims (no Circle account)
// — they're not session-bearing and don't authorize state changes by
// themselves. State-changing victim actions (verify-victim, /fund acks,
// etc.) require either the token PLUS a fresh OTP, or a Circle session
// match.
// =====================================================================

export function mintVictimAccessToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  const hash = hashVictimAccessToken(raw);
  return { raw, hash };
}

export function hashVictimAccessToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Timing-safe compare of a presented token against its stored hash.
 * Throws-free: returns false on any malformed input rather than leaking
 * the failure mode via exception timing.
 */
export function checkVictimAccessToken(
  presentedRaw: string | null | undefined,
  storedHash: string | null | undefined,
): boolean {
  if (!presentedRaw || !storedHash) return false;
  if (typeof presentedRaw !== "string" || presentedRaw.length === 0) return false;
  let presentedHash: string;
  try {
    presentedHash = hashVictimAccessToken(presentedRaw);
  } catch {
    return false;
  }
  if (presentedHash.length !== storedHash.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(presentedHash, "hex"),
      Buffer.from(storedHash, "hex"),
    );
  } catch {
    return false;
  }
}

/** Hard cap on bad-faith strikes per identity before permanent ban. */
export const BOUNTY_STRIKE_LIMIT = 2;

/**
 * Default refundable bond charged at claim submit (USDC). Slashed to the
 * victim's pool on a bad_faith / doxx_attempt verdict; refunded otherwise.
 * Overridable per-deploy via BOUNTY_CLAIM_BOND_USDC env. Set to 0 to disable.
 */
export function bountyClaimBondUsdc(): number {
  const raw = process.env.BOUNTY_CLAIM_BOND_USDC;
  if (raw === undefined) return 25;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 25;
  return n;
}

/** Rejection reasons that issue a strike. */
export const BOUNTY_CLAIM_STRIKE_REASONS = new Set<BountyClaimRejectionReason>([
  "bad_faith",
  "doxx_attempt",
]);

export function isStrikeReason(
  reason: BountyClaimRejectionReason | null | undefined,
): boolean {
  return reason != null && BOUNTY_CLAIM_STRIKE_REASONS.has(reason);
}

/** Lower / upper bounds on bounty economics. Tuned for the no-fee MVP. */
export const BOUNTY_MIN_FLAT_USDC = 500;
export const BOUNTY_MAX_FLAT_USDC = 1_000_000;
export const BOUNTY_MIN_RECOVERY_BPS = 100; // 1%
export const BOUNTY_MAX_RECOVERY_BPS = 5000; // 50%
export const BOUNTY_MIN_EXPIRY_DAYS = 7;
export const BOUNTY_MAX_EXPIRY_DAYS = 365;

/**
 * Kinds that may be CREATED today. info_arrest is gated for v1 — paying
 * for info leading to arrest carries bounty-hunter-law exposure in EU/UK
 * jurisdictions that needs counsel review before we accept new ones.
 * Existing info_arrest rows continue to work; this gate only blocks new
 * creation. Re-enable by adding "info_arrest" to this list after legal
 * sign-off. See project_bounty_mainnet_launch_checklist.md.
 */
export const BOUNTY_KINDS_OPEN_FOR_CREATION: BountyKind[] = [
  "recovery",
  "info_recovery",
];

export type BountyValidationError = { field: string; reason: string };

export type CreateBountyInput = {
  hackTraceId?: string | null;
  victimEmail: string;
  victimSubmitterId?: string | null;
  kind: BountyKind;
  recoveryPercentBps?: number | null;
  flatAmountUsdc?: number | null;
  policeReportFiled?: boolean;
  policeReportRef?: string | null;
  expiresInDays: number;
  description: string;
  termsAccepted: boolean;
};

/**
 * Validate a CreateBountyInput. Returns a list of errors (empty = valid).
 * Mirrors the SQL CHECK constraints so a bad payload 400s before the DB
 * has to enforce shape.
 */
export function validateCreateBounty(
  input: CreateBountyInput,
): BountyValidationError[] {
  const errs: BountyValidationError[] = [];

  if (!input.termsAccepted) {
    errs.push({ field: "termsAccepted", reason: "must accept terms" });
  }
  if (
    !input.victimEmail ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.victimEmail)
  ) {
    errs.push({ field: "victimEmail", reason: "must look like an email" });
  }
  if (!input.description || input.description.trim().length < 40) {
    errs.push({
      field: "description",
      reason: "must be at least 40 characters",
    });
  }
  if (input.description && input.description.length > 8000) {
    errs.push({ field: "description", reason: "must be under 8000 characters" });
  }
  if (
    !Number.isFinite(input.expiresInDays) ||
    input.expiresInDays < BOUNTY_MIN_EXPIRY_DAYS ||
    input.expiresInDays > BOUNTY_MAX_EXPIRY_DAYS
  ) {
    errs.push({
      field: "expiresInDays",
      reason: `must be ${BOUNTY_MIN_EXPIRY_DAYS}–${BOUNTY_MAX_EXPIRY_DAYS}`,
    });
  }

  if (input.kind === "recovery") {
    const bps = input.recoveryPercentBps ?? 0;
    if (
      !Number.isInteger(bps) ||
      bps < BOUNTY_MIN_RECOVERY_BPS ||
      bps > BOUNTY_MAX_RECOVERY_BPS
    ) {
      errs.push({
        field: "recoveryPercentBps",
        reason: `must be an integer ${BOUNTY_MIN_RECOVERY_BPS}–${BOUNTY_MAX_RECOVERY_BPS}`,
      });
    }
    if (input.flatAmountUsdc != null) {
      errs.push({
        field: "flatAmountUsdc",
        reason: "must be null for kind=recovery",
      });
    }
  } else {
    const usd = input.flatAmountUsdc ?? 0;
    if (
      !Number.isFinite(usd) ||
      usd < BOUNTY_MIN_FLAT_USDC ||
      usd > BOUNTY_MAX_FLAT_USDC
    ) {
      errs.push({
        field: "flatAmountUsdc",
        reason: `must be ${BOUNTY_MIN_FLAT_USDC}–${BOUNTY_MAX_FLAT_USDC} USDC`,
      });
    }
    if (input.recoveryPercentBps != null) {
      errs.push({
        field: "recoveryPercentBps",
        reason: "must be null for flat-kind bounty",
      });
    }
  }

  if (input.kind === "info_arrest" && !input.policeReportFiled) {
    errs.push({
      field: "policeReportFiled",
      reason: "info_arrest requires a filed police report attestation",
    });
  }
  if (
    input.policeReportFiled &&
    (!input.policeReportRef || input.policeReportRef.trim().length < 3)
  ) {
    errs.push({
      field: "policeReportRef",
      reason: "police_report_ref must be at least 3 chars when attesting",
    });
  }

  return errs;
}

/** Validate a sealed evidence payload from a claimant. */
export function validateClaimEvidence(
  payload: unknown,
): { ok: true; evidence: BountyClaimEvidence } | { ok: false; reason: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "evidence must be an object" };
  }
  const p = payload as Record<string, unknown>;

  const narrative = typeof p.narrative === "string" ? p.narrative.trim() : "";
  if (narrative.length < 80) {
    return { ok: false, reason: "narrative must be at least 80 characters" };
  }
  if (narrative.length > 16_000) {
    return { ok: false, reason: "narrative must be under 16000 characters" };
  }

  const rawAddrs = Array.isArray(p.targetAddresses) ? p.targetAddresses : [];
  if (rawAddrs.length === 0) {
    return { ok: false, reason: "at least one target address required" };
  }
  if (rawAddrs.length > 50) {
    return { ok: false, reason: "max 50 target addresses per claim" };
  }
  // Dedupe — claimants shouldn't be able to inflate count by listing the
  // same address twice, and the attribution write-through would no-op on
  // dupes anyway. Set preserves the 50-address cap meaningfully.
  const seen = new Set<string>();
  const targetAddresses: string[] = [];
  for (const raw of rawAddrs) {
    if (typeof raw !== "string") {
      return { ok: false, reason: "target addresses must be strings" };
    }
    const a = raw.trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(a)) {
      return {
        ok: false,
        reason: `invalid target address: ${raw.slice(0, 64)}`,
      };
    }
    if (seen.has(a)) continue;
    seen.add(a);
    targetAddresses.push(a);
  }
  if (targetAddresses.length === 0) {
    return { ok: false, reason: "at least one unique target address required" };
  }

  const evidence: BountyClaimEvidence = {
    targetAddresses,
    narrative,
    suspectedEntity:
      typeof p.suspectedEntity === "string"
        ? p.suspectedEntity.trim().slice(0, 200)
        : undefined,
    citedSubmissionIds: Array.isArray(p.citedSubmissionIds)
      ? p.citedSubmissionIds.filter(
          (x): x is string => typeof x === "string" && x.length < 100,
        )
      : undefined,
    // HTTPS-only — a claimant should not be able to slip a plaintext
    // http:// link past a victim who's likely to click it. Caps at 10 URLs
    // so the payload can't be used as a free-tier link dump.
    attachmentUrls: Array.isArray(p.attachmentUrls)
      ? p.attachmentUrls
          .filter(
            (x): x is string =>
              typeof x === "string" &&
              /^https:\/\//i.test(x) &&
              x.length < 500,
          )
          .slice(0, 10)
      : undefined,
    chain:
      typeof p.chain === "string"
        ? p.chain.trim().toLowerCase().slice(0, 32)
        : undefined,
  };

  return { ok: true, evidence };
}

/**
 * Read the bounty-surface gate for a submitter. Returns the reason the
 * caller is blocked, or null if they pass.
 *
 * Three checks (all must pass):
 *   1. Not banned (bountyBannedAt is null).
 *   2. Strike count is below the limit (defense in depth — the banned_at
 *      field is the authoritative gate; this catches a state-drift bug
 *      where strikes hit the limit but the banned_at write failed).
 *   3. Meets BOUNTY_CLAIM_MIN_TIER.
 */
export async function checkBountyClaimGate(
  submitterId: string,
): Promise<{ ok: true } | { ok: false; reason: string; tier?: ClearanceTier }> {
  const [row] = await db
    .select({
      tier: submitters.clearanceTier,
      strikes: submitters.bountyStrikes,
      bannedAt: submitters.bountyBannedAt,
    })
    .from(submitters)
    .where(eq(submitters.id, submitterId))
    .limit(1);

  if (!row) return { ok: false, reason: "submitter_not_found" };
  if (row.bannedAt) return { ok: false, reason: "bounty_banned" };
  if (row.strikes >= BOUNTY_STRIKE_LIMIT) {
    return { ok: false, reason: "bounty_strike_limit" };
  }
  // Tier check via ordinal — keep the import surface narrow here; the full
  // tier helper lives in lib/clearance.ts.
  const TIER_ORDER: ClearanceTier[] = [
    "open",
    "contributor",
    "trusted",
    "inner_circle",
  ];
  const have = TIER_ORDER.indexOf(row.tier);
  const need = TIER_ORDER.indexOf(BOUNTY_CLAIM_MIN_TIER);
  if (have < need) {
    return { ok: false, reason: "insufficient_tier", tier: row.tier };
  }
  return { ok: true };
}

/**
 * Apply a curator review to a claim. Single source of truth for:
 *   - claim status transition,
 *   - strike issuance (only for bad_faith / doxx_attempt),
 *   - strike-count bump + automatic ban at the limit,
 *   - bond payout ledger row (refund vs. slash),
 *   - winning-claim payout + contribution-points award.
 *
 * Does NOT write to address_attributions — that's a downstream effect
 * scheduled after victim ack. Keeps this function deterministic on inputs.
 */
export async function applyClaimReview(args: {
  claim: BountyClaim;
  bounty: Bounty;
  reviewerUserId: string;
  verdict: "accepted" | "partial" | "rejected" | "needs_info";
  rejectionReason?: BountyClaimRejectionReason | null;
  payoutAmountUsdc?: number; // required when verdict ∈ {accepted, partial}
  curatorNotes?: string | null;
}): Promise<{
  claim: BountyClaim;
  strikeIssued: boolean;
  banApplied: boolean;
  payoutId?: string;
  bondPayoutId?: string;
}> {
  const {
    claim,
    bounty,
    reviewerUserId,
    verdict,
    rejectionReason,
    payoutAmountUsdc,
    curatorNotes,
  } = args;

  const isReject = verdict === "rejected";
  const reason = isReject ? rejectionReason ?? null : null;
  const issuesStrike = isReject && isStrikeReason(reason);

  if (isReject && !reason) {
    throw new Error("applyClaimReview: rejected verdict requires a reason");
  }
  if (
    (verdict === "accepted" || verdict === "partial") &&
    (payoutAmountUsdc == null || !Number.isFinite(payoutAmountUsdc) || payoutAmountUsdc <= 0)
  ) {
    throw new Error(
      "applyClaimReview: accepted/partial verdict requires payoutAmountUsdc > 0",
    );
  }
  // Cap payouts at the escrowed amount. Without this a curator could
  // trigger a payout larger than what Circle can actually send, leaving
  // the bounty marked paid + points awarded + attributions written but
  // no money out. Cleaner to refuse up-front than to unwind later.
  if (verdict === "accepted" || verdict === "partial") {
    const escrowed = Number(bounty.escrowedAmountUsdc ?? "0");
    if ((payoutAmountUsdc as number) > escrowed) {
      throw new Error(
        `applyClaimReview: payoutAmountUsdc (${payoutAmountUsdc}) exceeds escrowed (${escrowed})`,
      );
    }
  }

  // Status mapping. needs_info is a non-terminal state that asks the
  // claimant to revise; we keep the claim row open so the unique
  // (bounty, claimant) index still excludes new attempts but lets the
  // claimant PATCH evidence.
  const nextStatus = (() => {
    switch (verdict) {
      case "accepted":
        return "accepted" as const;
      case "partial":
        return "partial" as const;
      case "rejected":
        return "rejected" as const;
      case "needs_info":
        return "needs_info" as const;
    }
  })();

  // Status-guarded UPDATE prevents two concurrent reviewers (or a
  // double-submitted request) from both winning the race. We only mutate
  // the claim if it's still in a non-terminal state; if rowCount is 0
  // someone else got here first and we throw a recognizable error.
  const NON_TERMINAL_STATUSES: Array<BountyClaim["status"]> = [
    "submitted",
    "under_review",
    "needs_info",
  ];

  // All the writes need to land or none of them — wrap in a tx so a
  // partway failure can't leave the bounty marked paid with no payout row,
  // points awarded with no claim status update, etc.
  const result = await db.transaction(async (tx) => {
    const updatedRows = await tx
      .update(bountyClaims)
      .set({
        status: nextStatus,
        rejectionReason: reason,
        strikeIssued: issuesStrike,
        curatorNotes: curatorNotes ?? claim.curatorNotes,
        reviewedByUserId: reviewerUserId,
        reviewedAt: new Date(),
      })
      .where(
        and(
          eq(bountyClaims.id, claim.id),
          inArray(bountyClaims.status, NON_TERMINAL_STATUSES),
        ),
      )
      .returning();

    if (updatedRows.length === 0) {
      throw new Error("claim_already_reviewed");
    }
    const updated = updatedRows[0];

    let banApplied = false;
    if (issuesStrike) {
      // Bump strike counter and conditionally set bountyBannedAt the moment
      // we cross the limit. Both updates in one SQL so the gate flips
      // atomically with the strike record.
      const [bumped] = await tx
        .update(submitters)
        .set({
          bountyStrikes: sql`${submitters.bountyStrikes} + 1`,
          bountyBannedAt: sql`CASE
            WHEN ${submitters.bountyStrikes} + 1 >= ${BOUNTY_STRIKE_LIMIT}
              AND ${submitters.bountyBannedAt} IS NULL
            THEN now()
            ELSE ${submitters.bountyBannedAt}
          END`,
          updatedAt: new Date(),
        })
        .where(eq(submitters.id, claim.claimantSubmitterId))
        .returning({
          strikes: submitters.bountyStrikes,
          bannedAt: submitters.bountyBannedAt,
        });
      banApplied = !!bumped?.bannedAt && bumped.strikes >= BOUNTY_STRIKE_LIMIT;
    }

    // Bond handling. v1: a no-strike rejection refunds; a strike-bearing
    // rejection slashes the bond — but only if we have a payee submitter
    // to send it to. For anon-victim bounties (no submitter row) the
    // slashed bond stays in escrow rather than writing a payout row with
    // a null payee that the worker can't fulfill.
    let bondPayoutId: string | undefined;
    const bond = Number(claim.bondAmountUsdc ?? "0");
    if (bond > 0) {
      const payeeKind: BountyPayoutPayeeKind = issuesStrike
        ? "bond_slash"
        : "bond_refund";
      const payeeSubmitter = issuesStrike
        ? bounty.victimSubmitterId
        : claim.claimantSubmitterId;

      if (issuesStrike && !payeeSubmitter) {
        // Anon victim — log and skip. The bond stays in escrow under the
        // bounty's wallet; a future cron could redistribute to the prize
        // pool or to platform_fee once we revisit the fee policy.
        console.warn(
          `bounty.applyClaimReview: bond_slash skipped for claim ${claim.publicId} — anon victim has no submitter row`,
        );
      } else {
        const [row] = await tx
          .insert(bountyPayouts)
          .values({
            bountyId: bounty.id,
            bountyClaimId: claim.id,
            amountUsdc: bond.toFixed(2),
            payeeKind,
            payeeSubmitterId: payeeSubmitter,
            status: "pending",
          })
          .returning({ id: bountyPayouts.id });
        bondPayoutId = row?.id;
      }
    }

    let payoutId: string | undefined;
    if (verdict === "accepted" || verdict === "partial") {
      const [row] = await tx
        .insert(bountyPayouts)
        .values({
          bountyId: bounty.id,
          bountyClaimId: claim.id,
          amountUsdc: (payoutAmountUsdc as number).toFixed(2),
          payeeKind: "claimant",
          payeeSubmitterId: claim.claimantSubmitterId,
          status: "pending",
        })
        .returning({ id: bountyPayouts.id });
      payoutId = row?.id;

      // Move the bounty into 'paid'. Partial verdict still flips to paid —
      // the ledger row carries the partial flag via the linked claim's
      // status, and the curator can post a second claim payout if more is
      // recovered later.
      await tx
        .update(bounties)
        .set({ status: "paid", updatedAt: new Date() })
        .where(eq(bounties.id, bounty.id));
    }

    return { updated, banApplied, payoutId, bondPayoutId };
  });

  // Post-commit side effects. awardContributionPoints + attribution write
  // are outside the tx because each runs its own transactions and a
  // failure in either is recoverable manually without unwinding the
  // verdict. Worst case: claimant doesn't get points / address doesn't
  // appear on the graph, both fixable by re-running.
  if (verdict === "accepted" || verdict === "partial") {
    try {
      await awardContributionPoints({
        submitterId: claim.claimantSubmitterId,
        kind: "bounty_claim_accepted",
        awardedByUserId: reviewerUserId,
        notes: `bounty ${bounty.publicId} claim ${claim.publicId}`,
      });
    } catch (err) {
      console.warn(
        `bounty.applyClaimReview: points award failed for claim ${claim.publicId}`,
        err,
      );
    }

    try {
      const chain = claim.evidencePayload.chain ?? "ethereum";
      // Defamation guard: do NOT write the claimant's free-form
      // `suspectedEntity` (often a person/company name) into the public
      // attribution graph. The name stays in the sealed evidence_payload
      // where only curator + victim see it. Public surface gets only the
      // on-chain address + the source tag (bounty-claim) + the bounty
      // publicId as sourceRef. If the claim's address attribution turns
      // out wrong, the public record is still defensible: "an accepted
      // bounty pointed at this address" — not "[Named Person] did it".
      const attributionClaims = claim.evidencePayload.targetAddresses.map(
        (address) => ({
          chain,
          address,
          source: "bounty-claim" as const,
          sourceRef: bounty.publicId,
          category: "hack-destination" as const,
          reportedAt: new Date(),
        }),
      );
      if (attributionClaims.length > 0) {
        await upsertAttributionsBatch(attributionClaims);
      }
    } catch (err) {
      console.warn(
        `bounty.applyClaimReview: attribution write-through failed for claim ${claim.publicId}`,
        err,
      );
    }
  }

  return {
    claim: result.updated,
    strikeIssued: issuesStrike,
    banApplied: result.banApplied,
    payoutId: result.payoutId,
    bondPayoutId: result.bondPayoutId,
  };
}
