"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Public shape returned by /api/auth/magic/me and /login. Kept narrow on
// purpose — anything sensitive stays server-side.
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
  | "authenticating" // Magic modal is showing / DID is being validated
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

// Minimal subset of the Magic Web SDK surface we actually call. Avoids a
// hard dependency on Magic's TS surface here — we type-check the values
// we use (`auth.loginWithEmailOTP`, `user.logout`) and treat the rest as
// opaque. The full SDK type lives in `magic-sdk` and is loaded lazily so
// the package isn't pulled into every page bundle.
interface MagicSdk {
  auth: {
    loginWithEmailOTP(args: { email: string }): Promise<string | null>;
  };
  user: {
    logout(): Promise<boolean>;
    isLoggedIn(): Promise<boolean>;
  };
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
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Lazy-loaded SDK instance. Loaded only on the first connect attempt so
  // the package isn't pulled into the public-header bundle of every page.
  const sdkRef = useRef<MagicSdk | null>(null);
  async function getSdk(): Promise<MagicSdk> {
    if (sdkRef.current) return sdkRef.current;
    const publishableKey = process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY;
    if (!publishableKey) {
      throw new Error(
        "NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY is not set — cannot init Magic SDK",
      );
    }
    const rpcUrl =
      process.env.NEXT_PUBLIC_MAGIC_RPC_URL ?? "https://mainnet.base.org";
    const chainId = Number(
      process.env.NEXT_PUBLIC_MAGIC_CHAIN_ID ?? "8453",
    );
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

  // Hydrate from existing session cookie on mount.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/magic/me", { credentials: "same-origin" })
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

  // Single-shot sign-in: open Magic's OTP modal for the supplied email,
  // wait for the DID token, hand it to our server to mint the session.
  const submitEmail = useCallback(async () => {
    setErrorMsg(null);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMsg("Enter a valid email.");
      setPhase("error");
      return;
    }
    try {
      setPhase("authenticating");
      const sdk = await getSdk();
      // Magic shows their iframe OTP modal here and resolves with a DID
      // token once the user enters the correct code. Returns null if the
      // user cancels — treat that as "back to idle" without an error.
      const didToken = await sdk.auth.loginWithEmailOTP({ email });
      if (!didToken) {
        setPhase("collecting_email");
        return;
      }
      const res = await fetch("/api/auth/magic/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ didToken }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || "Sign-in failed");
      }
      const data = (await res.json()) as { contributor: ContributorProfile };
      setContributor(data.contributor);
      setPhase("connected");
      onChange?.(data.contributor);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "unexpected error");
      setPhase("error");
    }
  }, [email, onChange]);

  const disconnect = useCallback(async () => {
    // Clear our own cookie first (cheap, server-side). Magic logout is
    // best-effort — a Magic-side network blip shouldn't trap the user in
    // the connected UI on our app.
    await fetch("/api/auth/magic/logout", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => null);
    try {
      const sdk = await getSdk();
      await sdk.user.logout();
    } catch {
      /* non-fatal */
    }
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

  const busy = phase === "authenticating";
  const busyLabel = busy ? "Check your email…" : null;

  // ── COMPACT (HEADER) ───────────────────────────────────────────────
  if (compact) {
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
          {busyLabel ?? "Sign in"}
        </button>
      </form>
      <p
        className="mt-2 text-[11px]"
        style={{ color: "var(--rex-text-dim)" }}
      >
        Enter your email — we&apos;ll send a one-time code. No seed phrase,
        no MetaMask. Your wallet is restored from your email every time.
      </p>
      {errorMsg && (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
