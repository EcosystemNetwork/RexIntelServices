import { cookies } from "next/headers";
import { sealData, unsealData } from "iron-session";
import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
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
import { consumeEmailVerifiedCookie } from "./email-otp";
import { runQueuedBackfillForSubmitter } from "./loss-report-attribution";

/**
 * Thrown when the caller hasn't completed the email-OTP step before
 * /circle/init. The route handler maps this to a 403 so the client can
 * surface a "verify your email first" message instead of a generic 502.
 */
export class CircleAuthGateError extends Error {
  readonly reason: "email_not_verified";
  constructor(reason: "email_not_verified", message: string) {
    super(message);
    this.name = "CircleAuthGateError";
    this.reason = reason;
  }
}

// =====================================================================
// Circle programmable-wallets auth — email-onboarded, PIN-signed,
// user-controlled wallets. Replaces the prior SIWE/MetaMask flow.
//
// Flow:
//   1. Client posts { email } → /api/auth/circle/init
//   2. Server creates (or fetches) a `submitters` row keyed on email with
//      a freshly-allocated circleUserId, then mints a Circle userToken +
//      issues an `initialize` challenge if the user has no wallet yet.
//   3. Client passes userToken+encryptionKey+challengeId to the Circle
//      Web SDK, which renders the PIN-setup / PIN-entry UX.
//   4. On SDK success, client posts { email } → /api/auth/circle/complete
//   5. Server polls Circle for the user's wallet address, writes it into
//      the submitters row, and mints our session cookie.
//
// Env vars required:
//   CIRCLE_API_KEY            — server-side, never expose
//   CIRCLE_APP_ID             — also exposed as NEXT_PUBLIC_CIRCLE_APP_ID
//   CIRCLE_BLOCKCHAIN         — e.g. "BASE", "ETH", "MATIC", "BASE-SEPOLIA"
//                               (defaults to "BASE" — Coinbase L2, pennies
//                               per tx and free for users when Circle's
//                               paymaster / gas station is enabled in the
//                               Circle Console for this wallet set)
//   SESSION_PASSWORD          — reused from existing iron-session config
// =====================================================================

const SESSION_COOKIE = "rex_circle_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
// Circle W3S uses ONE base URL for both TEST_API_KEY (testnet) and
// LIVE_API_KEY (mainnet) — the key prefix is the toggle, not the URL.
// CIRCLE_BASE_URL override exists only for future region endpoints.
const CIRCLE_BASE =
  process.env.CIRCLE_BASE_URL ?? "https://api.circle.com";

export interface CircleSession {
  submitterId: string;
  circleUserId: string;
  walletAddress: string; // lowercased; may be empty string if wallet not yet provisioned
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

function getCircleApiKey(): string {
  const key = process.env.CIRCLE_API_KEY;
  if (!key) {
    throw new Error("CIRCLE_API_KEY is not set");
  }
  return key;
}

function getBlockchain(): string {
  return process.env.CIRCLE_BLOCKCHAIN ?? "BASE";
}

// Circle returns blockchain identifiers like "ETH", "MATIC", "ARB" that
// don't match the slugs used by our address-graph layer (see chains.ts).
// Normalize at the write boundary so a later JOIN between submitters and
// addresses on `chain` doesn't have to handle two vocabularies.
function normalizeCircleChain(circleBlockchain: string): string {
  switch (circleBlockchain.toUpperCase()) {
    case "ETH":
    case "ETH-SEPOLIA":
      return "ethereum";
    case "MATIC":
    case "MATIC-AMOY":
      return "polygon";
    case "ARB":
    case "ARB-SEPOLIA":
      return "arbitrum";
    case "BASE":
    case "BASE-SEPOLIA":
      return "base";
    case "AVAX":
      return "avalanche";
    case "SOL":
      return "solana";
    default:
      return circleBlockchain.toLowerCase();
  }
}

// ---------------------------------------------------------------------------
// Circle REST helpers
// ---------------------------------------------------------------------------

interface CircleResponse<T> {
  data: T;
}

/**
 * Typed Circle API error. `code` is the numeric code from Circle's error
 * body (e.g. 155101 = userAlreadyExisted, 155106 = userWasInitialized) —
 * see CIRCLE_ERROR_CODE below for the ones we explicitly handle. Callers
 * should match on the code rather than parsing the message text.
 */
export class CircleApiError extends Error {
  readonly status: number;
  readonly code: number | undefined;
  constructor(args: { status: number; code: number | undefined; message: string }) {
    super(args.message);
    this.name = "CircleApiError";
    this.status = args.status;
    this.code = args.code;
  }
}

// Subset of Circle's numeric error codes we recognize. Full list lives in
// `@circle-fin/w3s-pw-web-sdk` (types.ts ErrorCode enum) — kept here as
// constants so the server module doesn't pull in the browser SDK.
export const CIRCLE_ERROR_CODE = {
  USER_ALREADY_EXISTED: 155101,
  USER_WAS_INITIALIZED: 155106,
  USER_TOKEN_EXPIRED: 155104,
  INVALID_USER_TOKEN: 155105,
} as const;

async function circleFetch<T>(
  path: string,
  init: {
    method: "GET" | "POST" | "PUT";
    body?: Record<string, unknown>;
    userToken?: string;
  },
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getCircleApiKey()}`,
    "Content-Type": "application/json",
  };
  if (init.userToken) headers["X-User-Token"] = init.userToken;

  const res = await fetch(`${CIRCLE_BASE}${path}`, {
    method: init.method,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
    // Circle API calls are server-side; never cache responses since they
    // carry per-user tokens and challenges.
    cache: "no-store",
  });

  if (!res.ok) {
    // Circle error bodies look like { code: 155101, message: "..." } — try
    // to parse so callers can branch on the numeric code instead of regex
    // against text. Fall back to status-only if the body isn't JSON.
    let code: number | undefined;
    let message = `circle: ${init.method} ${path} → ${res.status}`;
    try {
      const body = (await res.json()) as { code?: number; message?: string };
      if (typeof body.code === "number") code = body.code;
      if (body.message) message = `${message} — ${body.message}`;
    } catch {
      const text = await res.text().catch(() => "");
      if (text) message = `${message} ${text}`;
    }
    throw new CircleApiError({ status: res.status, code, message });
  }
  const json = (await res.json()) as CircleResponse<T>;
  return json.data;
}

/**
 * Create a new Circle user keyed on a UUID we own. Circle treats `userId`
 * as our application's identifier — they don't manage email-to-userId
 * mapping for us, which is why we store the binding in `submitters`.
 */
async function createCircleUser(userId: string): Promise<void> {
  await circleFetch<unknown>("/v1/w3s/users", {
    method: "POST",
    body: { userId },
  });
}

/**
 * Mint a session-token + encryption-key pair for a Circle user. The web SDK
 * uses these to authenticate the user against Circle and decrypt the
 * challenge response. Tokens are short-lived (~60min).
 */
async function mintCircleUserToken(userId: string): Promise<{
  userToken: string;
  encryptionKey: string;
}> {
  return await circleFetch<{ userToken: string; encryptionKey: string }>(
    "/v1/w3s/users/token",
    {
      method: "POST",
      body: { userId },
    },
  );
}

/**
 * Kick off the wallet-initialization challenge. After this, the user must
 * complete the PIN-setup flow in the SDK. Returns a challengeId the client
 * SDK passes to its `execute` call. Idempotent at our layer — Circle will
 * error if the user is already initialized, which we treat as "wallet
 * already exists, skip the challenge."
 */
async function initializeCircleUser(args: {
  userToken: string;
  blockchain: string;
}): Promise<{ challengeId: string } | { alreadyInitialized: true }> {
  try {
    const data = await circleFetch<{ challengeId: string }>(
      "/v1/w3s/user/initialize",
      {
        method: "POST",
        userToken: args.userToken,
        body: {
          blockchains: [args.blockchain],
          accountType: "SCA",
        },
      },
    );
    return { challengeId: data.challengeId };
  } catch (err) {
    if (
      err instanceof CircleApiError &&
      err.code === CIRCLE_ERROR_CODE.USER_WAS_INITIALIZED
    ) {
      return { alreadyInitialized: true };
    }
    throw err;
  }
}

interface CircleWallet {
  id: string;
  address: string;
  blockchain: string;
  state: string; // LIVE | INITIALIZED | etc.
}

async function listCircleWallets(userToken: string): Promise<CircleWallet[]> {
  const data = await circleFetch<{ wallets: CircleWallet[] }>(
    "/v1/w3s/wallets",
    {
      method: "GET",
      userToken,
    },
  );
  return data.wallets;
}

// ---------------------------------------------------------------------------
// Submitter upsert keyed on email + circleUserId
// ---------------------------------------------------------------------------

/**
 * Find or create a submitter row for this email. Allocates a new
 * circleUserId on first call so subsequent /init requests for the same
 * email can re-mint a Circle userToken instead of re-creating users.
 *
 * Slug is generated once on insert from the email's local-part + the
 * uuid prefix — collision-free without a retry loop. Updated only if
 * the wallet later replaces the slug stem.
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
  if (existing) {
    if (existing.circleUserId) return existing;
    // Backfill a circleUserId for legacy email-only rows on first sign-in.
    const circleUserId = randomUUID();
    const [updated] = await db
      .update(submitters)
      .set({ circleUserId, updatedAt: new Date() })
      .where(eq(submitters.id, existing.id))
      .returning();
    return updated;
  }

  const circleUserId = randomUUID();
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
      circleUserId,
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
        "circle: failed to upsert submitter and could not re-read after race",
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
// Public entry points called by the API routes
// ---------------------------------------------------------------------------

export interface InitResult {
  submitterId: string;
  circleUserId: string;
  userToken: string;
  encryptionKey: string;
  // challengeId is null when the user is already initialized and just
  // needs to sign in (no PIN setup required). The web SDK handles this
  // case by skipping straight to the existing-user PIN prompt.
  challengeId: string | null;
  // The wallet address if Circle has already provisioned one. The client
  // can pre-warm the connected state before the SDK round-trip if so.
  walletAddress: string | null;
}

/**
 * Begin the Circle email-to-wallet onboarding flow. Idempotent — calling
 * this with the same email returns the same circleUserId every time.
 */
export async function beginCircleAuth(email: string): Promise<InitResult> {
  // Load-bearing: without this consume-on-read check, anyone could type
  // someone-else's email into the form and front-run that identity by
  // setting a Circle PIN before the real owner ever shows up. The cookie
  // is single-use — one OTP verify buys exactly one init round.
  const ok = await consumeEmailVerifiedCookie(email);
  if (!ok) {
    throw new CircleAuthGateError(
      "email_not_verified",
      "Email ownership not verified. Request an OTP first.",
    );
  }
  const sub = await upsertSubmitterByEmail(email);
  const circleUserId = sub.circleUserId;
  if (!circleUserId) {
    // Should be unreachable — upsertSubmitterByEmail always sets it.
    throw new Error("circle: submitter has no circleUserId after upsert");
  }

  // POST /v1/w3s/users is idempotent in our usage — calling it twice for
  // the same userId errors with code 155101. Swallow that and proceed;
  // re-throw anything else (auth failures, network issues, etc.).
  try {
    await createCircleUser(circleUserId);
  } catch (err) {
    if (
      !(
        err instanceof CircleApiError &&
        err.code === CIRCLE_ERROR_CODE.USER_ALREADY_EXISTED
      )
    ) {
      throw err;
    }
  }

  const { userToken, encryptionKey } = await mintCircleUserToken(circleUserId);

  let challengeId: string | null = null;
  let walletAddress: string | null = sub.walletAddress;

  if (!walletAddress) {
    // No wallet yet — initialize. If Circle says "already initialized,"
    // fall through and fetch the wallet directly.
    const result = await initializeCircleUser({
      userToken,
      blockchain: getBlockchain(),
    });
    if ("challengeId" in result) {
      challengeId = result.challengeId;
    } else {
      const wallets = await listCircleWallets(userToken);
      walletAddress = wallets[0]?.address?.toLowerCase() ?? null;
    }
  }

  return {
    submitterId: sub.id,
    circleUserId,
    userToken,
    encryptionKey,
    challengeId,
    walletAddress,
  };
}

/**
 * Complete the auth flow after the client SDK has finished the PIN
 * challenge. Re-mints a fresh userToken (the one returned by /init may
 * have expired) and fetches the wallet that Circle just provisioned.
 * Persists the wallet on the submitter row and mints our session cookie.
 */
export async function completeCircleAuth(args: {
  email: string;
}): Promise<Submitter> {
  const sub = await upsertSubmitterByEmail(args.email);
  if (!sub.circleUserId) {
    throw new Error("circle: missing circleUserId on submitter at complete");
  }

  const { userToken } = await mintCircleUserToken(sub.circleUserId);
  const wallets = await listCircleWallets(userToken);
  const wallet = wallets[0];
  if (!wallet) {
    throw new Error(
      "circle: no wallet returned for user — PIN flow may not be complete",
    );
  }

  const lowered = wallet.address.toLowerCase();
  const [updated] = await db
    .update(submitters)
    .set({
      walletAddress: lowered,
      walletChain: normalizeCircleChain(wallet.blockchain),
      updatedAt: new Date(),
    })
    .where(eq(submitters.id, sub.id))
    .returning();

  await createCircleSession({
    submitterId: updated.id,
    circleUserId: updated.circleUserId ?? sub.circleUserId,
    walletAddress: lowered,
    clearanceTier: updated.clearanceTier,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export async function createCircleSession(data: {
  submitterId: string;
  circleUserId: string;
  walletAddress: string;
  clearanceTier: ClearanceTier;
}) {
  const payload: CircleSession = {
    submitterId: data.submitterId,
    circleUserId: data.circleUserId,
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

  // Bump the admin-visible login analytics. Done after the cookie write so a
  // DB blip can't block the sign-in itself — telemetry is best-effort.
  try {
    await db
      .update(submitters)
      .set({
        loginCount: sql`${submitters.loginCount} + 1`,
        lastLoginAt: new Date(),
      })
      .where(eq(submitters.id, data.submitterId));
  } catch {
    // Non-fatal: the user is already signed in; a missed bump is acceptable.
  }
}

export async function getCircleSession(): Promise<CircleSession | null> {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    return await unsealData<CircleSession>(raw, {
      password: getSessionPassword(),
    });
  } catch {
    return null;
  }
}

export async function destroyCircleSession() {
  cookies().delete(SESSION_COOKIE);
}

/**
 * Guard for gated route handlers. Returns the session when the caller
 * meets `required`; returns null otherwise.
 *
 * Reads the current tier from the DB rather than the session cookie. The
 * cookie's `clearanceTier` is only refreshed at sign-in and at PIN-complete,
 * so a user who crosses a threshold mid-session would otherwise stay locked
 * out of newly-unlocked surfaces until next sign-in. One extra row read per
 * gated request is the right trade.
 */
export async function requireCircleTier(
  required: ClearanceTier,
): Promise<CircleSession | null> {
  const session = await getCircleSession();
  if (!session) return null;
  const [row] = await db
    .select({ tier: submitters.clearanceTier })
    .from(submitters)
    .where(eq(submitters.id, session.submitterId))
    .limit(1);
  const liveTier = row?.tier ?? session.clearanceTier;
  if (!meetsTier(liveTier, required)) return null;
  // Hand back the session with the freshest tier so downstream code that
  // reads session.clearanceTier doesn't see the stale cookie value.
  return { ...session, clearanceTier: liveTier };
}

// ---------------------------------------------------------------------------
// Points ledger — award + recompute tier (auth-agnostic)
// ---------------------------------------------------------------------------

/**
 * Append a contribution event and update the denormalized `points` cache
 * + derived `clearance_tier` in a single transaction. Auth-agnostic — the
 * caller passes a submitterId already resolved via getCircleSession.
 *
 * Trust is monotonic up by product rule: this function rejects negative
 * `pointsOverride` and the `retraction_clawback` kind at runtime. Bad
 * actors are handled via clearance freeze/ban (a separate moderation lane),
 * not score deduction — that removes the dispute surface ("why did you take
 * my points") and keeps the leaderboard a pure verified-contributions signal.
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

  // Backfill queued loss_report attributions. Cheap no-op when the submitter
  // either has no queued reports or hasn't crossed the non-loss-report-approval
  // gate yet. Runs outside the transaction so an attribution-write failure
  // doesn't roll back the points award the submitter just earned.
  if (args.kind !== "loss_report_accepted") {
    try {
      await runQueuedBackfillForSubmitter(args.submitterId);
    } catch (err) {
      console.warn(
        "[circle-auth] queued loss-report backfill failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return result;
}

/**
 * Award the prize-pool placement points for a monthly settlement. Thin
 * wrapper over awardContributionPoints with the place → event-kind mapping
 * so the settlement caller doesn't have to know the enum names. Returns
 * null when place is outside the paid range (only top-3 earn points; the
 * pool itself splits 60/30/10 of 80% — see prize-pool.ts computePayouts).
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
