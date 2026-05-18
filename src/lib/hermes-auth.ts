/**
 * Hermes operator auth — single static bearer token.
 *
 * RexIntel is designed as an extension/operating surface of Rex Deus's
 * Hermes agent. Hermes calls /api/hermes/* programmatically; every route in
 * that namespace gates on `Authorization: Bearer ${HERMES_OPERATOR_TOKEN}`.
 *
 * One token, one operator. Rotated by changing the env var. NOT used for
 * the planned paid B2B agent API (x402 micro-fees) — that's a separate
 * auth path; see project_paid_agent_api.md in memory.
 */
import { type NextRequest, NextResponse } from "next/server";

/** Pulled at call time so a rotated env var takes effect without restart. */
function expectedToken(): string | null {
  const t = process.env.HERMES_OPERATOR_TOKEN?.trim();
  return t && t.length >= 24 ? t : null;
}

/**
 * Inspect the request and return whether Hermes is authorized.
 * Treats missing env var as DENY (fail-closed) — we never want the operator
 * surface to silently become open if the env is wiped in production.
 */
export function isHermesAuthorized(req: NextRequest | Request): boolean {
  const expected = expectedToken();
  if (!expected) return false;

  const header = req.headers.get("authorization") ?? "";
  // Accept either "Bearer <token>" or the raw token. Case-insensitive on the
  // "Bearer " prefix; we don't allow a "Token" prefix or other schemes.
  const m = header.match(/^\s*Bearer\s+(.+?)\s*$/i);
  const presented = m ? m[1] : header.trim();
  if (!presented) return false;

  // Constant-time-ish compare. Token strings are short enough that JS's
  // built-in === is fine here; we're guarding against header-stripping
  // attacks, not against a remote timing oracle.
  return presented === expected;
}

/** Convenience: short-circuit a route with a uniform 401 response. */
export function denyHermes(reason = "operator token required"): NextResponse {
  return NextResponse.json(
    { ok: false, error: "unauthorized", reason },
    { status: 401 },
  );
}

/**
 * Per-call gate. Use at the top of every /api/hermes/* route:
 *
 *   const denial = requireHermes(req);
 *   if (denial) return denial;
 */
export function requireHermes(
  req: NextRequest | Request,
): NextResponse | null {
  if (isHermesAuthorized(req)) return null;
  return denyHermes();
}
