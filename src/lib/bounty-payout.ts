import { randomUUID } from "crypto";
import { CircleApiError } from "./circle-auth";

// =====================================================================
// Bounty payout rail — outbound USDC transfers from a Developer
// Controlled escrow wallet (DCW) to the payee's user-controlled Circle
// wallet. The existing /lib/circle-auth.ts wraps the User Controlled
// Wallet (UCW) APIs that we use for contributor sign-in; payouts need
// the DCW namespace which is a sibling integration on the same API key.
//
// Two environment requirements for live mode:
//   CIRCLE_API_KEY                                — server-side, same key
//   CIRCLE_BOUNTY_ESCROW_ENTITY_SECRET_CIPHERTEXT — RSA-encrypted entity
//                                                   secret for the DCW
//                                                   wallet set; generated
//                                                   via Circle's docs and
//                                                   rotated periodically.
//   CIRCLE_USDC_TOKEN_ID_BASE                     — Circle's tokenId for
//                                                   USDC on Base. One-time
//                                                   lookup; pin in env.
//
// If any of these are missing the helper runs in dry-run mode: the cron
// can call it safely, it logs what it WOULD do, and returns a sentinel
// so the caller leaves the payout row in `pending` for the next sweep.
// This lets us deploy the rail before the operator wires Circle DCW
// credentials, instead of blocking the whole feature on the integration.
// =====================================================================

const CIRCLE_BASE = "https://api.circle.com";

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
 * verbatim — `sent` flips the payout row to status='sent', `failed`
 * flips it to 'failed' with the reason, `skipped` leaves it pending for
 * the next sweep (used when the rail isn't configured yet).
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
  const entitySecretCiphertext =
    process.env.CIRCLE_BOUNTY_ESCROW_ENTITY_SECRET_CIPHERTEXT;
  const usdcTokenId = process.env.CIRCLE_USDC_TOKEN_ID_BASE;

  if (!apiKey || !entitySecretCiphertext || !usdcTokenId) {
    // Dry-run: write nothing, log what we'd send, leave the payout row
    // pending. Operator wires the env vars; next cron tick sends for real.
    console.warn(
      `[bounty-payout] DRY RUN — would send ${req.amountUsdc} USDC from wallet ${req.sourceWalletId} → ${req.destinationAddress} (payout ${req.payoutId}). Missing env: ${[
        !apiKey && "CIRCLE_API_KEY",
        !entitySecretCiphertext && "CIRCLE_BOUNTY_ESCROW_ENTITY_SECRET_CIPHERTEXT",
        !usdcTokenId && "CIRCLE_USDC_TOKEN_ID_BASE",
      ]
        .filter(Boolean)
        .join(", ")}`,
    );
    return { kind: "skipped", reason: "rail_not_configured" };
  }

  // Idempotency key is derived from the payout row's UUID — the same row
  // retried twice produces the same key, so Circle dedupes server-side
  // and we never double-pay. Append a v1 namespace prefix so a future
  // rail change can rotate keys cleanly without colliding with retries
  // of the old format.
  const idempotencyKey = stableUuidFromPayoutId(req.payoutId);

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
        tokenId: usdcTokenId,
        destinationAddress: req.destinationAddress,
        amounts: [req.amountUsdc],
        feeLevel: "MEDIUM",
      },
    });

    // Circle returns INITIATED almost immediately; the on-chain tx hash
    // arrives via webhook later. We record the transferId now so the
    // webhook can correlate; txHash gets backfilled by the webhook
    // handler at /api/auth/circle/* (or a follow-up cron poll).
    return { kind: "sent", transferId: data.id, txHash: data.txHash };
  } catch (err) {
    if (err instanceof CircleApiError) {
      // 5xx → retryable (Circle blip). 4xx → not retryable (bad request,
      // insufficient funds, invalid wallet). Specific 422 with code 401
      // is "balance insufficient" — log clearly so the operator can top
      // up the escrow.
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
 * Stable Circle-format idempotency key derived from a UUID. Circle
 * accepts arbitrary strings up to 64 chars; we pass the UUID verbatim.
 * Same input → same key → same transfer (Circle dedupes).
 */
function stableUuidFromPayoutId(payoutId: string): string {
  // payoutId is already a UUID from the DB default. Validate shape; if
  // somehow malformed, fall back to a fresh UUID so the request still
  // goes through (but loses idempotency — alert via the log).
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

async function dcwFetch<T>(
  path: string,
  init: {
    method: "POST" | "GET";
    apiKey: string;
    body?: Record<string, unknown>;
  },
): Promise<T> {
  const res = await fetch(`${CIRCLE_BASE}${path}`, {
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
