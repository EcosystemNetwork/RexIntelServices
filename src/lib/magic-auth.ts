import { cookies } from "next/headers";
import { sealData, unsealData } from "iron-session";
import { eq, sql } from "drizzle-orm";
import { Magic } from "@magic-sdk/admin";
import {
  db,
  submitters,
  contributionEvents,
  type ClearanceTier,
  type ContributionEventKind,
  type Submitter,
} from "./db";
import {
  CONTRIBUTION_POINTS,
  tierForPoints,
  meetsTier,
} from "./clearance";
import { runQueuedBackfillForSubmitter } from "./loss-report-attribution";

// =====================================================================
// Magic Link dedicated-wallet auth. Replaces the prior Circle programmable
// wallet rail. Magic owns the OTP UX and key custody; we receive a DID
// token after the user passes the email-OTP challenge, validate it server-
// side with the Admin SDK, and mint our own session cookie keyed on the
// submitter row resolved by email.
//
// Flow:
//   1. Client: `magic.auth.loginWithEmailOTP({ email })` → Magic shows
//      their OTP modal, user enters code → returns a DID token.
//   2. Client POSTs { didToken } → /api/auth/magic/login.
//   3. Server validates the DID token (signature, expiry, audience) via
//      the Magic Admin SDK, then `getMetadataByIssuer` to read email +
//      publicAddress.
//   4. Server upserts the `submitters` row keyed on email (case-insensitive),
//      writes (magicIssuer, walletAddress, walletChain) onto it, and seals
//      the `rex_magic_session` cookie.
//   5. Client refreshes its profile via /api/auth/magic/me.
//
// Env vars required:
//   MAGIC_SECRET_KEY               — server-only; `sk_live_...` for mainnet,
//                                    `sk_test_...` for sandbox/local.
//   NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY — `pk_live_...` / `pk_test_...`,
//                                    consumed by the browser SDK.
//   NEXT_PUBLIC_MAGIC_RPC_URL      — Base mainnet RPC, e.g. https://mainnet.base.org
//   NEXT_PUBLIC_MAGIC_CHAIN_ID     — 8453 (Base mainnet) / 84532 (Base Sepolia)
//   SESSION_PASSWORD               — reused from existing iron-session config.
//
// Magic DID tokens are short-lived (default 15min) and bound to the issuer
// they name, so a leaked token has minimal blast radius. The Admin SDK call
// throws on any validation failure (expired, malformed, signature mismatch),
// which the route handler maps to 401 without leaking which check failed.
// =====================================================================

const SESSION_COOKIE = "rex_magic_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * Thrown when the supplied DID token is invalid, expired, or otherwise
 * unusable. Route handler maps this to 401.
 */
export class MagicAuthError extends Error {
  readonly reason: "invalid_token" | "missing_email" | "no_wallet";
  constructor(
    reason: "invalid_token" | "missing_email" | "no_wallet",
    message: string,
  ) {
    super(message);
    this.name = "MagicAuthError";
    this.reason = reason;
  }
}

export interface MagicSession {
  submitterId: string;
  magicIssuer: string;
  walletAddress: string; // lowercased
  clearanceTier: ClearanceTier;
  mintedAt: number;
}

function getSessionPassword(): string {
  const pw = process.env.SESSION_PASSWORD;
  if (!pw || pw.length < 32) {
    throw new Error(
      "SESSION_PASSWORD must be at least 32 characters — generate one with `openssl rand -base64 32`",
    );
  }
  return pw;
}

function getMagicSecretKey(): string {
  const key = process.env.MAGIC_SECRET_KEY;
  if (!key) {
    throw new Error("MAGIC_SECRET_KEY is not set");
  }
  return key;
}

// Magic's wallet network. We pick a chain slug for our address-graph layer
// based on the configured chain id. Keeping the mapping centralized means
// downstream JOINs on submitters.wallet_chain don't have to translate
// across two vocabularies.
function getWalletChain(): string {
  const chainId = Number(
    process.env.NEXT_PUBLIC_MAGIC_CHAIN_ID ?? process.env.MAGIC_CHAIN_ID ?? "8453",
  );
  switch (chainId) {
    case 8453:
    case 84532:
      return "base";
    case 1:
    case 11155111:
      return "ethereum";
    case 137:
    case 80002:
      return "polygon";
    case 42161:
    case 421614:
      return "arbitrum";
    default:
      return "base";
  }
}

// Lazy-initialized Magic Admin SDK client. `Magic.init` is async because
// it loads the underlying admin module; we cache the resolved instance so
// every request after the first doesn't re-import.
let magicAdmin: Magic | null = null;
async function getMagicAdmin(): Promise<Magic> {
  if (magicAdmin) return magicAdmin;
  magicAdmin = await Magic.init(getMagicSecretKey());
  return magicAdmin;
}

interface MagicMetadata {
  issuer: string;
  publicAddress: string;
  email: string | null;
}

/**
 * Validate a Magic DID token (signature, expiry, audience) and resolve
 * the associated email + wallet address. Throws `MagicAuthError` on any
 * validation failure. Exposed so callers that mint a different session
 * (e.g. the operator/admin rail) can reuse the same Magic validation
 * without going through the submitter upsert.
 */
export async function resolveMagicDidToken(
  didToken: string,
): Promise<MagicMetadata> {
  return validateAndResolveDidToken(didToken);
}

async function validateAndResolveDidToken(
  didToken: string,
): Promise<MagicMetadata> {
  const admin = await getMagicAdmin();
  try {
    // Throws on signature mismatch, expiry, malformed token, etc. Void
    // return on success — the actual issuer pull is a separate call.
    admin.token.validate(didToken);
  } catch (err) {
    throw new MagicAuthError(
      "invalid_token",
      err instanceof Error ? err.message : "Magic token validation failed",
    );
  }
  const issuer = admin.token.getIssuer(didToken);
  const meta = await admin.users.getMetadataByIssuer(issuer);
  // Every field on MagicUserMetadata is nullable in the SDK type — guard
  // the ones we treat as required so a bad upstream response surfaces as
  // a typed error instead of an opaque downstream NPE.
  if (!meta.issuer) {
    throw new MagicAuthError(
      "invalid_token",
      "Magic metadata had no issuer",
    );
  }
  if (!meta.publicAddress) {
    throw new MagicAuthError(
      "no_wallet",
      "Magic user has no public address — wallet provisioning incomplete",
    );
  }
  return {
    issuer: meta.issuer,
    publicAddress: meta.publicAddress,
    email: meta.email ?? null,
  };
}

// ---------------------------------------------------------------------------
// Submitter upsert keyed on email + magicIssuer
// ---------------------------------------------------------------------------

/**
 * Find or create a submitter row for this email. Persists the Magic issuer
 * and wallet address on the same row so subsequent sessions can resolve
 * either by email or issuer.
 *
 * Slug is generated once on insert from the email's local-part + the
 * uuid prefix — collision-free without a retry loop.
 */
export async function upsertSubmitterByMagic(args: {
  email: string;
  magicIssuer: string;
  walletAddress: string;
}): Promise<Submitter> {
  const email = args.email.toLowerCase();
  const walletAddress = args.walletAddress.toLowerCase();
  const walletChain = getWalletChain();

  const [existing] = await db
    .select()
    .from(submitters)
    .where(sql`lower(${submitters.email}) = ${email}`)
    .limit(1);

  if (existing) {
    // Patch (magicIssuer, walletAddress, walletChain) onto the existing row
    // — only update fields that actually changed so the row's updatedAt
    // doesn't bump on every login (separate from loginCount/lastLoginAt
    // which we bump on session mint).
    const updates: Partial<typeof submitters.$inferInsert> = {};
    if (existing.magicIssuer !== args.magicIssuer) {
      updates.magicIssuer = args.magicIssuer;
    }
    if (existing.walletAddress !== walletAddress) {
      updates.walletAddress = walletAddress;
    }
    if (existing.walletChain !== walletChain) {
      updates.walletChain = walletChain;
    }
    if (Object.keys(updates).length === 0) {
      return existing;
    }
    updates.updatedAt = new Date();
    const [updated] = await db
      .update(submitters)
      .set(updates)
      .where(eq(submitters.id, existing.id))
      .returning();
    return updated;
  }

  const baseSlug =
    email
      .split("@")[0]
      ?.normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "")
      .slice(0, 50) || "contributor";

  const [inserted] = await db
    .insert(submitters)
    .values({
      email,
      magicIssuer: args.magicIssuer,
      walletAddress,
      walletChain,
      slug: "",
    })
    .onConflictDoNothing()
    .returning();

  if (!inserted) {
    // Race: another concurrent login won the insert. Re-read and patch.
    const [race] = await db
      .select()
      .from(submitters)
      .where(sql`lower(${submitters.email}) = ${email}`)
      .limit(1);
    if (!race) {
      throw new Error(
        "magic: failed to upsert submitter and could not re-read after race",
      );
    }
    return race;
  }

  const slug = `${baseSlug}-${inserted.id.slice(0, 6)}`;
  const [withSlug] = await db
    .update(submitters)
    .set({ slug, updatedAt: new Date() })
    .where(eq(submitters.id, inserted.id))
    .returning();
  return withSlug;
}

/**
 * Email-only upsert helper, retained for callers that don't have a Magic
 * issuer to bind yet (e.g. legacy intel-submit flows that record a tip
 * author without minting a session). Does NOT touch magicIssuer or
 * walletAddress — those are written only by the Magic login path.
 */
export async function upsertSubmitterByEmail(
  email: string,
): Promise<Submitter> {
  const lower = email.toLowerCase();
  const [existing] = await db
    .select()
    .from(submitters)
    .where(sql`lower(${submitters.email}) = ${lower}`)
    .limit(1);
  if (existing) return existing;

  const baseSlug =
    lower
      .split("@")[0]
      ?.normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "")
      .slice(0, 50) || "contributor";

  const [inserted] = await db
    .insert(submitters)
    .values({
      email: lower,
      slug: "",
    })
    .onConflictDoNothing()
    .returning();

  if (!inserted) {
    const [race] = await db
      .select()
      .from(submitters)
      .where(sql`lower(${submitters.email}) = ${lower}`)
      .limit(1);
    if (!race) {
      throw new Error(
        "magic: failed to upsert submitter and could not re-read after race",
      );
    }
    return race;
  }

  const slug = `${baseSlug}-${inserted.id.slice(0, 6)}`;
  const [withSlug] = await db
    .update(submitters)
    .set({ slug, updatedAt: new Date() })
    .where(eq(submitters.id, inserted.id))
    .returning();
  return withSlug;
}

// ---------------------------------------------------------------------------
// Public entry point — invoked by /api/auth/magic/login
// ---------------------------------------------------------------------------

/**
 * Validate the supplied Magic DID token, upsert the submitter row, and
 * mint our session cookie. Returns the persisted submitter row.
 *
 * The DID token IS the proof of email ownership — Magic only issues it
 * after the OTP challenge passes — so there is no separate verify-email
 * gating step. A leaked DID token is replayable within its short TTL
 * (~15min); the Admin SDK enforces that on every validate() call.
 */
export async function completeMagicLogin(args: {
  didToken: string;
}): Promise<Submitter> {
  const meta = await validateAndResolveDidToken(args.didToken);
  if (!meta.email) {
    throw new MagicAuthError(
      "missing_email",
      "Magic metadata had no email — the user may have signed in via a non-email method",
    );
  }
  const sub = await upsertSubmitterByMagic({
    email: meta.email,
    magicIssuer: meta.issuer,
    walletAddress: meta.publicAddress,
  });
  await createMagicSession({
    submitterId: sub.id,
    magicIssuer: meta.issuer,
    walletAddress: meta.publicAddress.toLowerCase(),
    clearanceTier: sub.clearanceTier,
  });
  return sub;
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export async function createMagicSession(data: {
  submitterId: string;
  magicIssuer: string;
  walletAddress: string;
  clearanceTier: ClearanceTier;
}) {
  const payload: MagicSession = {
    submitterId: data.submitterId,
    magicIssuer: data.magicIssuer,
    walletAddress: data.walletAddress.toLowerCase(),
    clearanceTier: data.clearanceTier,
    mintedAt: Date.now(),
  };
  const sealed = await sealData(payload, { password: getSessionPassword() });
  cookies().set(SESSION_COOKIE, sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  // Login telemetry — best-effort, don't block sign-in on DB blips.
  try {
    await db
      .update(submitters)
      .set({
        loginCount: sql`${submitters.loginCount} + 1`,
        lastLoginAt: new Date(),
      })
      .where(eq(submitters.id, data.submitterId));
  } catch {
    // Non-fatal.
  }
}

export async function getMagicSession(): Promise<MagicSession | null> {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    // iron-session's `unsealData` returns `{}` (not throw) on garbage
    // input. Without a shape check, any browser cookie value would
    // satisfy `if (session)` callers. Verify the unsealed payload has
    // the (submitterId, magicIssuer, walletAddress) tuple that
    // `createMagicSession` always seals.
    const payload = await unsealData<Partial<MagicSession>>(raw, {
      password: getSessionPassword(),
    });
    if (
      typeof payload?.submitterId !== "string" ||
      payload.submitterId.length === 0 ||
      typeof payload?.magicIssuer !== "string" ||
      typeof payload?.walletAddress !== "string"
    ) {
      return null;
    }
    return payload as MagicSession;
  } catch {
    return null;
  }
}

export async function destroyMagicSession() {
  cookies().delete(SESSION_COOKIE);
}

/**
 * Guard for gated route handlers. Returns the session when the caller
 * meets `required`; returns null otherwise.
 *
 * Reads the current tier from the DB rather than the session cookie so a
 * user who crosses a threshold mid-session immediately gains access to
 * newly-unlocked surfaces without needing to re-login.
 */
export async function requireMagicTier(
  required: ClearanceTier,
): Promise<MagicSession | null> {
  const session = await getMagicSession();
  if (!session) return null;
  const [row] = await db
    .select({ tier: submitters.clearanceTier })
    .from(submitters)
    .where(eq(submitters.id, session.submitterId))
    .limit(1);
  const liveTier = row?.tier ?? session.clearanceTier;
  if (!meetsTier(liveTier, required)) return null;
  return { ...session, clearanceTier: liveTier };
}

// ---------------------------------------------------------------------------
// Points ledger — award + recompute tier (auth-agnostic)
// ---------------------------------------------------------------------------

/**
 * Append a contribution event and update the denormalized `points` cache
 * + derived `clearance_tier` in a single transaction. Auth-agnostic — the
 * caller passes a submitterId already resolved via getMagicSession.
 *
 * Trust is monotonic up by product rule: this function rejects negative
 * `pointsOverride` and the `retraction_clawback` kind at runtime. Bad
 * actors are handled via clearance freeze/ban, not score deduction.
 */
export async function awardContributionPoints(args: {
  submitterId: string;
  kind: ContributionEventKind;
  submissionId?: string;
  awardedByUserId?: string;
  notes?: string;
  pointsOverride?: number;
}): Promise<{ points: number; tier: ClearanceTier }> {
  if (args.kind === "retraction_clawback") {
    throw new Error(
      "awardContributionPoints: retraction_clawback is disabled — trust is monotonic up. Use clearance freeze/ban for bad actors.",
    );
  }
  if (args.pointsOverride !== undefined && args.pointsOverride < 0) {
    throw new Error(
      "awardContributionPoints: pointsOverride must be non-negative — trust is monotonic up.",
    );
  }
  const fixed = CONTRIBUTION_POINTS[args.kind];
  const points =
    args.pointsOverride !== undefined ? args.pointsOverride : fixed;
  if (points === 0 && args.kind !== "curator_award") {
    throw new Error(
      `awardContributionPoints: kind=${args.kind} has no fixed point value and no override was provided`,
    );
  }

  const result = await db.transaction(async (tx) => {
    await tx.insert(contributionEvents).values({
      submitterId: args.submitterId,
      kind: args.kind,
      points,
      submissionId: args.submissionId,
      awardedByUserId: args.awardedByUserId,
      notes: args.notes,
    });

    const [{ total }] = await tx
      .select({
        total: sql<number>`COALESCE(SUM(${contributionEvents.points}), 0)::int`,
      })
      .from(contributionEvents)
      .where(eq(contributionEvents.submitterId, args.submitterId));

    const tier = tierForPoints(total);
    await tx
      .update(submitters)
      .set({ points: total, clearanceTier: tier, updatedAt: new Date() })
      .where(eq(submitters.id, args.submitterId));

    return { points: total, tier };
  });

  if (args.kind !== "loss_report_accepted") {
    try {
      await runQueuedBackfillForSubmitter(args.submitterId);
    } catch (err) {
      console.warn(
        "[magic-auth] queued loss-report backfill failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return result;
}

/**
 * Award the prize-pool placement points for a monthly settlement. Returns
 * null when place is outside the paid range (only top-3 earn points).
 */
export async function awardPrizeWin(args: {
  submitterId: string;
  place: 1 | 2 | 3 | number;
  submissionId?: string;
  awardedByUserId?: string;
  notes?: string;
}): Promise<{ points: number; tier: ClearanceTier } | null> {
  const kind =
    args.place === 1
      ? ("prize_win_first" as const)
      : args.place === 2
      ? ("prize_win_second" as const)
      : args.place === 3
      ? ("prize_win_third" as const)
      : null;
  if (!kind) return null;
  return await awardContributionPoints({
    submitterId: args.submitterId,
    kind,
    submissionId: args.submissionId,
    awardedByUserId: args.awardedByUserId,
    notes: args.notes,
  });
}
