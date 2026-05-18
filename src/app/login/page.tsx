"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PublicShell } from "@/components/public-shell";

// Minimal Magic Web SDK surface — same shape used in
// `src/components/connect-wallet-button.tsx`. Loaded lazily so the
// SDK isn't pulled into the public-page bundle.
interface MagicSdk {
  auth: {
    loginWithEmailOTP(args: { email: string }): Promise<string | null>;
  };
  user: {
    logout(): Promise<boolean>;
  };
}

type Phase = "idle" | "authenticating" | "error";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const sdkRef = useRef<MagicSdk | null>(null);
  async function getSdk(): Promise<MagicSdk> {
    if (sdkRef.current) return sdkRef.current;
    const publishableKey = process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY;
    if (!publishableKey) {
      throw new Error(
        "Magic is not configured. Set NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY.",
      );
    }
    const rpcUrl =
      process.env.NEXT_PUBLIC_MAGIC_RPC_URL ?? "https://mainnet.base.org";
    const chainId = Number(process.env.NEXT_PUBLIC_MAGIC_CHAIN_ID ?? "8453");
    const mod = (await import("magic-sdk")) as unknown as {
      Magic: new (
        key: string,
        opts: { network: { rpcUrl: string; chainId: number } },
      ) => MagicSdk;
    };
    const sdk = new mod.Magic(publishableKey, {
      network: { rpcUrl, chainId },
    });
    sdkRef.current = sdk;
    return sdk;
  }

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError("Enter a valid email.");
        setPhase("error");
        return;
      }
      try {
        setPhase("authenticating");
        const sdk = await getSdk();
        const didToken = await sdk.auth.loginWithEmailOTP({ email });
        if (!didToken) {
          // User dismissed the Magic modal — quietly return to idle.
          setPhase("idle");
          return;
        }
        const res = await fetch("/api/auth/operator/magic-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ didToken }),
        });
        if (!res.ok) {
          // Clean up the Magic-side session when the server rejects the
          // login (allowlist miss, rate limit, etc.) so a non-operator
          // attempt doesn't leave a dangling Magic session that would
          // skip the OTP modal on the next try.
          try {
            await sdk.user.logout();
          } catch {
            /* non-fatal */
          }
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(data.error ?? "Authentication failed");
          setPhase("error");
          return;
        }
        router.push("/dashboard");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unexpected error");
        setPhase("error");
      }
    },
    [email, router],
  );

  const busy = phase === "authenticating";

  return (
    <PublicShell
      classification={[
        { text: "● Restricted // Command Center" },
        { text: "Operator Authentication", show: "sm" },
      ]}
    >
      <main className="max-w-md mx-auto px-6 pt-12 md:pt-20 pb-24">
        <div className="rex-card p-8 animate-fade-in">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--rex-text)] mb-1">
            Welcome back
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--rex-text-muted)" }}>
            Sign in with your operator email. We&apos;ll send a one-time code.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                className="block text-[10px] font-mono uppercase tracking-widest mb-1.5"
                style={{ color: "var(--rex-text-dim)" }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={busy}
                autoComplete="email"
                className="rex-input w-full"
                id="login-email"
              />
            </div>

            {error && (
              <div
                className="text-sm px-3 py-2 rounded-sm font-mono"
                style={{
                  color: "var(--rex-danger)",
                  background: "rgba(248,113,113,0.1)",
                  border: "1px solid rgba(248,113,113,0.2)",
                }}
                role="alert"
              >
                ✕ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="rex-btn w-full"
              id="login-submit"
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <svg
                    className="animate-spin w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Check your email…
                </span>
              ) : (
                "Send sign-in code ▸"
              )}
            </button>
          </form>

          <p
            className="mt-4 text-[11px]"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Magic-Link OTP · no password to remember, no seed phrase.
          </p>
        </div>
      </main>
    </PublicShell>
  );
}
