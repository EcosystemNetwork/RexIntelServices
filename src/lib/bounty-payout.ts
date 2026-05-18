import { publicEncrypt, randomUUID } from "crypto";
import { CircleApiError } from "./circle-auth";

// =====================================================================
// Bounty payout rail — outbound USDC transfers from a Developer-
// Controlled escrow wallet (DCW) to the payee's wallet address.
//
// Critical correctness note on Circle's auth model:
//   The entity-secret ciphertext is SINGLE-USE per request. Circle's
//   docs are explicit: "Each ciphertext is single-use. Reusing one
//   causes the request to be rejected, which prevents replay attacks."
//   So we store the raw 32-byte entity secret (hex) in env, fetch
//   Circle's RSA public key once, and RSA-OAEP-encrypt the secret
//   freshly before each transfer call.
//
// Environment requirements for live mode:
//   CIRCLE_API_KEY                       — TEST_API_KEY:... for sandbox,
//                                          LIVE_API_KEY:... for production.
//   CIRCLE_BASE_URL                      — Defaults to api.circle.com.
//                                          Set to api-sandbox.circle.com
//                                          when testing with a TEST key.
//   CIRCLE_ENTITY_SECRET                 — 64-char hex (32 bytes), the
//                                          raw secret. Generate with
//                                          `openssl rand -hex 32` or
//                                          Circle's sample script.
//   CIRCLE_BOUNTY_USDC_TOKEN_ADDRESS     — Defaults to native USDC on
//                                          Base mainnet
//                                          (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913).
//                                          Override to the Base Sepolia
//                                          USDC contract when in sandbox.
//   CIRCLE_BOUNTY_BLOCKCHAIN             — `BASE` (prod) or `BASE-SEPOLIA`
//                                          (sandbox). Defaults to BASE.
//
// If any of CIRCLE_API_KEY / CIRCLE_ENTITY_SECRET is missing the helper
// runs in dry-run mode: cron calls it safely, logs what it WOULD do,
// returns `skipped` so the payout row stays pending for the next sweep
// once the env is set.
// =====================================================================

const DEFAULT_CIRCLE_BASE = "https://api.circle.com";

// Native USDC on Base mainnet. Pin in env to override for Base Sepolia
// (0x036CbD53842c5426634e7929541eC2318f3dCF7e) during sandbox testing.
const DEFAULT_USDC_TOKEN_ADDRESS =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const DEFAULT_BLOCKCHAIN = "BASE";

export type TransferResult =
  | { kind: "sent"; transferId: string; txHash?: string }
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; reason: string; retryable: boolean };

export interface TransferRequest {
  /** UUID of the bountyPayouts row — used as idempotency key. */
  payoutId: string;
  /** Source Circle wallet id (the bounty's escrow). */
  sourceWalletId: string | null;
  /** Destination on-chain address (0x… lowercased). */
  destinationAddress: string | null;
  /** Amount as a decimal string, e.g. "12.34". */
  amountUsdc: string;
}

/**
 * Issue a single outbound transfer. Returns a result the caller stores
 * verbatim: `sent` → flip the payout row to sent, `failed` → flip to
 * failed with reason, `skipped` → leave pending for next sweep.
 */
export async function sendBountyPayout(
  req: TransferRequest,
): Promise<TransferResult> {
  if (!req.sourceWalletId) {
    return { kind: "skipped", reason: "no_source_wallet" };
  }
  if (
    !req.destinationAddress ||
    !/^0x[a-f0-9]{40}$/.test(req.destinationAddress)
  ) {
    return { kind: "skipped", reason: "no_or_invalid_destination" };
  }

  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecretHex = process.env.CIRCLE_ENTITY_SECRET;

  if (!apiKey || !entitySecretHex) {
    console.warn(
      `[bounty-payout] DRY RUN — would send ${req.amountUsdc} USDC from wallet ${req.sourceWalletId} → ${req.destinationAddress} (payout ${req.payoutId}). Missing env: ${[
        !apiKey && "CIRCLE_API_KEY",
        !entitySecretHex && "CIRCLE_ENTITY_SECRET",
      ]
        .filter(Boolean)
        .join(", ")}`,
    );
    return { kind: "skipped", reason: "rail_not_configured" };
  }

  // Fresh ciphertext per request — replay-protected by Circle server-side.
  let entitySecretCiphertext: string;
  try {
    entitySecretCiphertext = await encryptEntitySecret(
      entitySecretHex,
      apiKey,
    );
  } catch (err) {
    return {
      kind: "failed",
      reason: `entity_secret_encrypt: ${err instanceof Error ? err.message : "unknown"}`.slice(
        0,
        500,
      ),
      retryable: true, // public-key fetch could be a transient network blip
    };
  }

  // Idempotency: payout row UUID is the key. Same retry → same key →
  // Circle dedupes server-side. No double-pay even if cron runs twice.
  const idempotencyKey = stableUuidFromPayoutId(req.payoutId);

  const tokenAddress =
    process.env.CIRCLE_BOUNTY_USDC_TOKEN_ADDRESS ?? DEFAULT_USDC_TOKEN_ADDRESS;
  const tokenBlockchain =
    process.env.CIRCLE_BOUNTY_BLOCKCHAIN ?? DEFAULT_BLOCKCHAIN;

  try {
    const data = await dcwFetch<{
      id: string;
      state: string;
      txHash?: string;
    }>("/v1/w3s/developer/transactions/transfer", {
      method: "POST",
      apiKey,
      body: {
        idempotencyKey,
        entitySecretCiphertext,
        walletId: req.sourceWalletId,
        // Prefer tokenAddress + tokenBlockchain over tokenId so we don't
        // have to round-trip through a tokens lookup endpoint. Circle
        // accepts either form on this endpoint.
        tokenAddress,
        tokenBlockchain,
        destinationAddress: req.destinationAddress,
        amounts: [req.amountUsdc],
        feeLevel: "MEDIUM",
      },
    });

    // Circle returns INITIATED almost immediately; the on-chain tx hash
    // arrives via webhook later. We record the transferId now so the
    // webhook can correlate; txHash backfills via a follow-up cron poll
    // or webhook handler.
    return { kind: "sent", transferId: data.id, txHash: data.txHash };
  } catch (err) {
    if (err instanceof CircleApiError) {
      // 5xx → retryable (Circle blip). 4xx → non-retryable; bad request,
      // insufficient funds, invalid wallet. The wrapper preserves the
      // numeric code so a future ops dashboard can group by Circle code.
      const retryable = err.status >= 500;
      return {
        kind: "failed",
        reason: `${err.status}: ${err.message}`.slice(0, 500),
        retryable,
      };
    }
    return {
      kind: "failed",
      reason:
        err instanceof Error ? err.message.slice(0, 500) : "unknown_error",
      retryable: true,
    };
  }
}

/**
 * Stable Circle-format idempotency key derived from the payout UUID.
 * Same input → same key → Circle dedupes the second send server-side.
 */
function stableUuidFromPayoutId(payoutId: string): string {
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      payoutId,
    )
  ) {
    return payoutId;
  }
  console.warn(
    `[bounty-payout] payoutId not a UUID: ${payoutId} — using fresh idempotency key, retries WILL double-pay`,
  );
  return randomUUID();
}

// ---------------------------------------------------------------------------
// Entity-secret encryption (RSA-OAEP-SHA256, base64)
// ---------------------------------------------------------------------------

let cachedPublicKeyPem: string | null = null;

/**
 * Fetch Circle's RSA public key from /v1/w3s/config/entity/publicKey.
 * Cached for the lifetime of the process — Circle rotates the key
 * infrequently and the docs encourage caching. If a request later fails
 * with an auth/key error, the caller can force a refresh by clearing
 * the cache and retrying.
 */
async function fetchEntityPublicKey(apiKey: string): Promise<string> {
  if (cachedPublicKeyPem) return cachedPublicKeyPem;
  const data = await dcwFetch<{ publicKey: string }>(
    "/v1/w3s/config/entity/publicKey",
    { method: "GET", apiKey },
  );
  if (!data.publicKey || !data.publicKey.includes("BEGIN PUBLIC KEY")) {
    throw new Error("entity_public_key_missing_or_malformed");
  }
  cachedPublicKeyPem = data.publicKey;
  return data.publicKey;
}

/**
 * RSA-OAEP-SHA256 encrypt the entity secret using Circle's published
 * public key. Returns base64. Matches the reference implementation in
 * circlefin/w3s-entity-secret-sample-code (Node.js variant).
 */
async function encryptEntitySecret(
  entitySecretHex: string,
  apiKey: string,
): Promise<string> {
  // Validate input shape early — wrong length here causes a confusing
  // 4xx from Circle later.
  if (!/^[0-9a-f]{64}$/i.test(entitySecretHex)) {
    throw new Error(
      "CIRCLE_ENTITY_SECRET must be 64 hex chars (32 bytes)",
    );
  }
  const publicKeyPem = await fetchEntityPublicKey(apiKey);
  const ciphertextBuf = publicEncrypt(
    {
      key: publicKeyPem,
      oaepHash: "sha256",
      // Node sets MGF1 to the same hash as oaepHash when not specified,
      // which matches the sample-code spec (OAEP-SHA256 + MGF1-SHA256).
    },
    Buffer.from(entitySecretHex, "hex"),
  );
  return ciphertextBuf.toString("base64");
}

// ---------------------------------------------------------------------------
// HTTP wrapper
// ---------------------------------------------------------------------------

function getCircleBaseUrl(): string {
  return process.env.CIRCLE_BASE_URL ?? DEFAULT_CIRCLE_BASE;
}

async function dcwFetch<T>(
  path: string,
  init: {
    method: "POST" | "GET";
    apiKey: string;
    body?: Record<string, unknown>;
  },
): Promise<T> {
  const res = await fetch(`${getCircleBaseUrl()}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${init.apiKey}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    let code: number | undefined;
    let message = `circle-dcw: ${init.method} ${path} → ${res.status}`;
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
  const json = (await res.json()) as { data: T };
  return json.data;
}
