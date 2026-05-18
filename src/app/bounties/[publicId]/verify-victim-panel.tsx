"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Status =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "awaiting_code" }
  | { kind: "verifying_otp" }
  | { kind: "claiming_verification" }
  | { kind: "ok" }
  | { kind: "err"; reason: string };

/**
 * Two-step victim-verification flow for draft bounties:
 *
 *   1. Request an OTP for the bounty's victim email
 *      (POST /api/auth/email/request-otp)
 *   2. Submit the 6-digit code (POST /api/auth/email/verify-otp) — this
 *      drops the single-use `rex_email_verified` cookie.
 *   3. Submit the access token to POST /api/bounties/[id]/verify-victim,
 *      which consumes the OTP cookie + stamps victim_verified_at.
 *
 * Until verified, the /fund route refuses to flip the bounty to `open`
 * even after USDC arrives in escrow — protects against an attacker
 * posting a bounty in someone else's name (audit finding #5).
 */
export function VerifyVictimPanel({
  bountyPublicId,
  victimEmail,
  accessToken,
}: {
  bountyPublicId: string;
  victimEmail: string;
  accessToken: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function requestOtp() {
    setStatus({ kind: "requesting" });
    try {
      const res = await fetch("/api/auth/email/request-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: victimEmail }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setStatus({ kind: "err", reason: data.error ?? "otp_request_failed" });
        return;
      }
      setStatus({ kind: "awaiting_code" });
    } catch (err) {
      setStatus({
        kind: "err",
        reason: err instanceof Error ? err.message : "network_error",
      });
    }
  }

  async function verifyOtpAndClaim() {
    if (code.trim().length !== 6) {
      setStatus({ kind: "err", reason: "code must be 6 digits" });
      return;
    }
    setStatus({ kind: "verifying_otp" });
    try {
      const otp = await fetch("/api/auth/email/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: victimEmail, code: code.trim() }),
      });
      const otpData = (await otp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!otp.ok || !otpData.ok) {
        setStatus({
          kind: "err",
          reason: otpData.error ?? "otp_invalid",
        });
        return;
      }

      setStatus({ kind: "claiming_verification" });
      const verify = await fetch(
        `/api/bounties/${encodeURIComponent(bountyPublicId)}/verify-victim`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: accessToken }),
        },
      );
      const verifyData = (await verify.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!verify.ok || !verifyData.ok) {
        setStatus({
          kind: "err",
          reason: verifyData.error ?? "verify_failed",
        });
        return;
      }
      setStatus({ kind: "ok" });
      router.refresh();
    } catch (err) {
      setStatus({
        kind: "err",
        reason: err instanceof Error ? err.message : "network_error",
      });
    }
  }

  if (status.kind === "ok") {
    return (
      <section className="rex-card p-4 sm:p-5 border border-[var(--rex-accent)]/40 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
          ● Victim verified
        </div>
        <div className="text-sm text-[var(--rex-text-muted)]">
          Your email is verified. Once USDC arrives in escrow, the bounty
          will publish automatically.
        </div>
      </section>
    );
  }

  return (
    <section className="rex-card p-4 sm:p-5 border border-[var(--rex-warning)]/40 space-y-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-warning)]">
        ● Verify your email to publish this bounty
      </div>
      <div className="text-sm text-[var(--rex-text-muted)] leading-relaxed">
        Your bounty stays private until you prove control of{" "}
        <span className="font-mono text-white">{victimEmail}</span>. This
        protects victims from someone else posting a bounty in their name.
      </div>

      {status.kind === "idle" || status.kind === "requesting" ? (
        <button
          onClick={requestOtp}
          disabled={status.kind === "requesting"}
          className="text-[11px] font-mono uppercase tracking-widest px-3 py-2 rounded border border-[var(--rex-warning)]/40 text-[var(--rex-warning)] hover:bg-[var(--rex-warning)]/10 transition disabled:opacity-40"
        >
          {status.kind === "requesting" ? "Sending…" : "Send verification code →"}
        </button>
      ) : null}

      {status.kind === "awaiting_code" ||
      status.kind === "verifying_otp" ||
      status.kind === "claiming_verification" ||
      (status.kind === "err" && code.length > 0) ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="6-digit code"
            className="text-sm font-mono bg-[var(--rex-bg-elevated)] border border-[var(--rex-border-subtle)] rounded p-2 text-white w-32 tracking-widest"
          />
          <button
            onClick={verifyOtpAndClaim}
            disabled={
              status.kind === "verifying_otp" ||
              status.kind === "claiming_verification" ||
              code.length !== 6
            }
            className="text-[11px] font-mono uppercase tracking-widest px-3 py-2 rounded border border-[var(--rex-accent)]/40 text-[var(--rex-accent)] hover:bg-[var(--rex-accent)]/10 transition disabled:opacity-40"
          >
            {status.kind === "verifying_otp" || status.kind === "claiming_verification"
              ? "Verifying…"
              : "Verify →"}
          </button>
        </div>
      ) : null}

      {status.kind === "err" ? (
        <div className="text-[12px] font-mono text-[var(--rex-warning)]">
          ⚠ {status.reason}
        </div>
      ) : null}
    </section>
  );
}
