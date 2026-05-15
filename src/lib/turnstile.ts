/**
 * Cloudflare Turnstile verification.
 *
 * Config:
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY — public key (rendered in the widget)
 *   TURNSTILE_SECRET_KEY            — server-only verification key
 *
 * When EITHER env var is unset, Turnstile is considered disabled and
 * verifyTurnstileToken() returns `{ ok: true, skipped: true }`. That lets
 * local dev + first-deploys work without provisioning anything; when you
 * paste both keys onto Vercel the protection activates on the next request
 * with no code change.
 *
 * Frontend integration: the widget is rendered as a <div class="cf-turnstile">
 * once the public site key is set. Submitting forms includes the resulting
 * cf-turnstile-response value, which the server passes to verify here.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function isTurnstileEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY &&
      process.env.TURNSTILE_SECRET_KEY,
  );
}

/**
 * Server-side verification. Returns `{ ok: true, skipped: true }` when
 * Turnstile is disabled, `{ ok: true }` when the token validates, and
 * `{ ok: false, error }` when it fails. Caller can treat the unified
 * `ok` field as "may proceed" — skipped + success are both pass states.
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string,
): Promise<{ ok: true; skipped?: boolean } | { ok: false; error: string }> {
  if (!isTurnstileEnabled()) {
    return { ok: true, skipped: true };
  }
  if (!token) {
    return { ok: false, error: "Captcha is required." };
  }

  try {
    const form = new URLSearchParams();
    form.append("secret", process.env.TURNSTILE_SECRET_KEY!);
    form.append("response", token);
    if (remoteIp) form.append("remoteip", remoteIp);

    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const data = (await res.json()) as {
      success: boolean;
      "error-codes"?: string[];
    };
    if (!data.success) {
      return {
        ok: false,
        error: `Captcha verification failed (${(data["error-codes"] ?? []).join(", ") || "unknown"})`,
      };
    }
    return { ok: true };
  } catch (e) {
    // Network/transport failure — don't block legit submissions on a
    // Cloudflare blip. Log and pass.
    console.warn("[turnstile] verification network error, allowing through:", e);
    return { ok: true };
  }
}
