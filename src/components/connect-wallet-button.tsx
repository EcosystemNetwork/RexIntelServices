"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Public shape returned by /api/auth/circle/me and /complete. Kept narrow
// on purpose — anything sensitive stays server-side.
export type ContributorProfile = {
  id: string;
  slug: string;
  walletAddress: string | null;
  displayHandle: string | null;
  points: number;
  clearanceTier: "open" | "contributor" | "trusted" | "inner_circle";
};

type Phase =
  | "idle"
  | "collecting_email"
  | "sending_otp"
  | "collecting_code"
  | "verifying_code"
  | "initializing"
  | "awaiting_pin"
  | "completing"
  | "connected"
  | "error";

const TIER_LABEL: Record<ContributorProfile["clearanceTier"], string> = {
  open: "Open",
  contributor: "Contributor",
  trusted: "Trusted",
  inner_circle: "Inner Circle",
};

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// Minimal subset of the Circle Web SDK surface we actually call. Matches
// the runtime shape exported by `@circle-fin/w3s-pw-web-sdk` as of the
// version pinned in package.json — ChallengeResult has `{ type, status }`
// at the top level (no .data wrapper). The SDK also defines
// SignMessageResult / SignTransactionResult variants for other challenge
// types; we only consume the INITIALIZE/SET_PIN/CREATE_WALLET branch so
// the narrower shape below is sufficient.
interface CircleChallengeResult {
  type: string; // ChallengeType — INITIALIZE | SET_PIN | CREATE_WALLET | …
  status: string; // ChallengeStatus — COMPLETE | EXPIRED | FAILED | IN_PROGRESS | PENDING
}
interface CircleSdk {
  setAppSettings(args: { appId: string }): void;
  setAuthentication(args: {
    userToken: string;
    encryptionKey: string;
  }): void;
  execute(
    challengeId: string,
    onCompleted: (
      error: Error | undefined,
      result: CircleChallengeResult | undefined,
    ) => Promise<void> | void,
  ): void;
}

interface InitResponse {
  circleUserId: string;
  userToken: string;
  encryptionKey: string;
  challengeId: string | null;
  walletAddress: string | null;
  appId: string | null;
}

interface Props {
  onChange?: (contributor: ContributorProfile | null) => void;
  className?: string;
  compact?: boolean;
}

export default function ConnectWalletButton({
  onChange,
  className,
  compact = false,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [contributor, setContributor] = useState<ContributorProfile | null>(
    null,
  );
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Lazy-loaded SDK instance. Loaded only on the first connect attempt so
  // the package isn't pulled into the public-header bundle of every page.
  const sdkRef = useRef<CircleSdk | null>(null);
  async function getSdk(): Promise<CircleSdk> {
    if (sdkRef.current) return sdkRef.current;
    const mod = (await import("@circle-fin/w3s-pw-web-sdk")) as unknown as {
      W3SSdk: new () => CircleSdk;
    };
    const sdk = new mod.W3SSdk();
    sdkRef.current = sdk;
    return sdk;
  }

  // Hydrate from existing session cookie on mount.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/circle/me", { credentials: "same-origin" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 204) {
          onChange?.(null);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as { contributor: ContributorProfile };
        setContributor(data.contributor);
        setPhase("connected");
        onChange?.(data.contributor);
      })
      .catch(() => {
        /* network blip — silently leave the button in idle */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finalizeSession = useCallback(
    async (forEmail: string) => {
      setPhase("completing");
      const res = await fetch("/api/auth/circle/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: forEmail }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || "Failed to finalize session");
      }
      const data = (await res.json()) as { contributor: ContributorProfile };
      setContributor(data.contributor);
      setPhase("connected");
      onChange?.(data.contributor);
    },
    [onChange],
  );

  // Stage 3: hit /circle/init (consumes the email-verified cookie), drive
  // the Circle PIN UI, then finalize the session. Split out so both the
  // post-verify path and the "already onboarded" short-circuit reuse it.
  const runCircleInit = useCallback(
    async (forEmail: string) => {
      setPhase("initializing");
      const res = await fetch("/api/auth/circle/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: forEmail }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          reason?: string;
        };
        // 403 with reason=email_not_verified means the cookie wasn't there
        // — likely a stale session or someone hit /init directly. Bounce
        // them back to the OTP step rather than show a generic error.
        if (res.status === 403 && body.reason === "email_not_verified") {
          setErrorMsg("Email verification expired. Request a new code.");
          setPhase("collecting_email");
          return;
        }
        throw new Error(body.error || "init failed");
      }
      const init = (await res.json()) as InitResponse;

      if (!init.challengeId) {
        // Already onboarded — Circle has a wallet, mint our session.
        await finalizeSession(forEmail);
        return;
      }
      if (!init.appId) {
        throw new Error(
          "Circle appId missing — set NEXT_PUBLIC_CIRCLE_APP_ID in env.",
        );
      }

      const sdk = await getSdk();
      sdk.setAppSettings({ appId: init.appId });
      sdk.setAuthentication({
        userToken: init.userToken,
        encryptionKey: init.encryptionKey,
      });

      setPhase("awaiting_pin");
      sdk.execute(init.challengeId, async (err, result) => {
        if (err) {
          setErrorMsg(err.message || "PIN challenge failed");
          setPhase("error");
          return;
        }
        if (result?.status !== "COMPLETE") {
          setErrorMsg(
            `Challenge ended with status ${result?.status ?? "unknown"}`,
          );
          setPhase("error");
          return;
        }
        try {
          await finalizeSession(forEmail);
        } catch (e) {
          setErrorMsg(e instanceof Error ? e.message : "completion failed");
          setPhase("error");
        }
      });
    },
    [finalizeSession],
  );

  // Stage 1: user submits email → server emails a 6-digit code, UI swaps
  // to the code-entry field. We never call /circle/init here; that only
  // fires after the OTP is verified, otherwise anyone could front-run a
  // famous-name email.
  const submitEmail = useCallback(async () => {
    setErrorMsg(null);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMsg("Enter a valid email.");
      setPhase("error");
      return;
    }
    try {
      setPhase("sending_otp");
      const res = await fetch("/api/auth/email/request-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email }),
      });
      // /request-otp always 200s — even on rate-limit — to prevent email
      // enumeration. Branch on .ok only for network/5xx.
      if (!res.ok) throw new Error("Could not send code. Try again.");
      setPhase("collecting_code");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "unexpected error");
      setPhase("error");
    }
  }, [email]);

  // Stage 2: user types the 6-digit code → server verifies + sets the
  // email-verified cookie → we kick off the Circle init flow.
  const submitCode = useCallback(async () => {
    setErrorMsg(null);
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setErrorMsg("Enter the 6-digit code from your email.");
      return;
    }
    try {
      setPhase("verifying_code");
      const res = await fetch("/api/auth/email/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, code: trimmed }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setErrorMsg(body.error || "Code didn't match.");
        setPhase("collecting_code");
        return;
      }
      await runCircleInit(email);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "unexpected error");
      setPhase("error");
    }
  }, [code, email, runCircleInit]);

  const resendCode = useCallback(async () => {
    setErrorMsg(null);
    setCode("");
    setPhase("sending_otp");
    await fetch("/api/auth/email/request-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setPhase("collecting_code");
  }, [email]);

  const disconnect = useCallback(async () => {
    await fetch("/api/auth/circle/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    setContributor(null);
    setEmail("");
    setEmailExpanded(false);
    setPhase("idle");
    onChange?.(null);
  }, [onChange]);

  // ── CONNECTED ──────────────────────────────────────────────────────
  if (phase === "connected" && contributor) {
    if (compact) {
      return (
        <div
          className={`flex items-center gap-2 rounded-sm border border-[var(--rex-border-subtle)] bg-[var(--rex-surface-2)] px-2 py-1 text-[10px] font-mono ${className ?? ""}`}
          title={`${contributor.walletAddress ?? "(no wallet yet)"} · ${TIER_LABEL[contributor.clearanceTier]} · ${contributor.points} pts`}
        >
          <span className="text-white">
            {contributor.walletAddress
              ? truncate(contributor.walletAddress)
              : "signed in"}
          </span>
          <span className="text-[var(--rex-accent)] uppercase tracking-widest">
            {TIER_LABEL[contributor.clearanceTier]}
          </span>
          <button
            type="button"
            onClick={disconnect}
            aria-label="Sign out"
            className="text-[var(--rex-text-dim)] hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
      );
    }
    return (
      <div
        className={`flex items-center justify-between gap-3 rounded border border-[var(--rex-border-subtle)] bg-[var(--rex-bg-soft)] px-3 py-2 ${className ?? ""}`}
      >
        <div className="flex flex-col text-xs">
          <span className="font-mono text-white">
            {contributor.walletAddress
              ? truncate(contributor.walletAddress)
              : "signed in"}
          </span>
          <span className="text-[var(--rex-text-dim)]">
            {TIER_LABEL[contributor.clearanceTier]} · {contributor.points} pts
          </span>
        </div>
        <button
          type="button"
          onClick={disconnect}
          className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    );
  }

  const busy =
    phase === "sending_otp" ||
    phase === "verifying_code" ||
    phase === "initializing" ||
    phase === "awaiting_pin" ||
    phase === "completing";

  const busyLabel = (() => {
    if (phase === "sending_otp") return "Sending code…";
    if (phase === "verifying_code") return "Verifying…";
    if (phase === "initializing") return "Setting up…";
    if (phase === "awaiting_pin") return "Set your 6-digit PIN…";
    if (phase === "completing") return "Finishing up…";
    return null;
  })();

  // After OTP is sent, swap the email field for the code field. Stays
  // in code-entry mode through verify + Circle init + PIN — busyLabel
  // narrates each step inside the same UI panel.
  const inCodePhase =
    phase === "collecting_code" ||
    phase === "verifying_code" ||
    phase === "initializing" ||
    phase === "awaiting_pin" ||
    phase === "completing";

  // ── COMPACT (HEADER) ───────────────────────────────────────────────
  if (compact) {
    if (inCodePhase) {
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitCode();
          }}
          className={`flex items-center gap-1 ${className ?? ""}`}
        >
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            disabled={busy}
            autoFocus
            className="rex-input text-[10px] sm:text-[11px] h-7 w-20 px-2 font-mono tracking-widest"
          />
          <button
            type="submit"
            disabled={busy}
            className="text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-[var(--rex-accent)] hover:text-white transition-colors disabled:opacity-50"
          >
            {busyLabel ?? "Verify ▸"}
          </button>
          {errorMsg && (
            <span className="text-[10px] text-red-400 ml-1" role="alert">
              {errorMsg}
            </span>
          )}
        </form>
      );
    }
    // Collapsed: a single link that, on click, expands an inline email
    // input. Keeps the header thin until the user actually wants to sign in.
    if (!emailExpanded && phase === "idle") {
      return (
        <button
          type="button"
          onClick={() => {
            setEmailExpanded(true);
            setPhase("collecting_email");
          }}
          className={`text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-[var(--rex-accent)] hover:text-white transition-colors ${className ?? ""}`}
        >
          Sign in ▸
        </button>
      );
    }
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitEmail();
        }}
        className={`flex items-center gap-1 ${className ?? ""}`}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email"
          disabled={busy}
          autoFocus
          className="rex-input text-[10px] sm:text-[11px] h-7 w-32 px-2 font-mono"
        />
        <button
          type="submit"
          disabled={busy}
          className="text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-[var(--rex-accent)] hover:text-white transition-colors disabled:opacity-50"
        >
          {busyLabel ?? "Go ▸"}
        </button>
        {errorMsg && (
          <span className="text-[10px] text-red-400 ml-1" role="alert">
            {errorMsg}
          </span>
        )}
      </form>
    );
  }

  // ── FULL (IN-FORM) ─────────────────────────────────────────────────
  if (inCodePhase) {
    return (
      <div className={className}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitCode();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            disabled={busy}
            autoFocus
            className="rex-input flex-1 font-mono tracking-widest text-lg"
          />
          <button type="submit" disabled={busy} className="rex-btn whitespace-nowrap">
            {busyLabel ?? "Verify"}
          </button>
        </form>
        <p
          className="mt-2 text-[11px]"
          style={{ color: "var(--rex-text-dim)" }}
        >
          We sent a 6-digit code to <span className="font-mono">{email}</span>.
          {" "}
          <button
            type="button"
            onClick={resendCode}
            disabled={busy}
            className="underline hover:text-white transition-colors disabled:opacity-50"
          >
            Resend
          </button>{" "}
          or{" "}
          <button
            type="button"
            onClick={() => {
              setCode("");
              setErrorMsg(null);
              setPhase("collecting_email");
            }}
            disabled={busy}
            className="underline hover:text-white transition-colors disabled:opacity-50"
          >
            change email
          </button>
          .
        </p>
        {errorMsg && (
          <p className="mt-2 text-xs text-red-400" role="alert">
            {errorMsg}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitEmail();
        }}
        className="flex gap-2"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your email"
          disabled={busy}
          className="rex-input flex-1"
        />
        <button type="submit" disabled={busy} className="rex-btn whitespace-nowrap">
          {busyLabel ?? "Send code"}
        </button>
      </form>
      <p
        className="mt-2 text-[11px]"
        style={{ color: "var(--rex-text-dim)" }}
      >
        Enter your email — we&apos;ll send a 6-digit code, then provision
        a wallet for you (no seed phrase, no MetaMask). You&apos;ll set a
        6-digit PIN to confirm actions.
      </p>
      {errorMsg && (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
