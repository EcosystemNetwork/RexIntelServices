"use client";

import { useState, useEffect } from "react";
import { Turnstile } from "@/components/turnstile";

/**
 * Voting widget for the intel detail page.
 *
 * Three states:
 *   "idle"          — initial; shows current count + "Vote" button
 *   "needs-email"   — user clicked vote, no cookie; ask for email + Turnstile
 *   "check-email"   — magic-link email sent; show "check your inbox"
 *   "voted"         — vote recorded (either via cookie fast-path or after
 *                     this page renders with ?voted=1 in the URL)
 *
 * The cookie fast-path tries POST /api/intel/vote/cast first. If the
 * server says 401 (no/invalid cookie), we fall through to the magic-link
 * flow. This makes the second vote in the same browser one-click.
 */
export function VoteButton({
  publicId,
  initialCount,
  initialVoted = false,
}: {
  publicId: string;
  initialCount: number;
  initialVoted?: boolean;
}) {
  const [count, setCount] = useState(initialCount);
  const [phase, setPhase] = useState<
    "idle" | "needs-email" | "check-email" | "voted" | "loading" | "error"
  >(initialVoted ? "voted" : "idle");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // If the page loaded with ?voted=1 from the confirm-redirect, refresh
  // the count optimistically so the user sees their vote land instantly.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("voted") === "1" && phase !== "voted") {
      setCount((c) => c + 1);
      setPhase("voted");
      // Strip the param so a refresh doesn't keep counting.
      params.delete("voted");
      const url =
        window.location.pathname +
        (params.toString() ? `?${params.toString()}` : "") +
        window.location.hash;
      window.history.replaceState(null, "", url);
    }
  }, [phase]);

  async function handleVoteClick() {
    setErrorMsg("");
    setPhase("loading");
    try {
      const res = await fetch("/api/intel/vote/cast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.alreadyVoted) {
          setPhase("voted");
        } else {
          setCount((c) => c + 1);
          setPhase("voted");
        }
        return;
      }
      if (res.status === 401) {
        // No cookie — fall through to the magic-link flow.
        setPhase("needs-email");
        return;
      }
      const data = await res.json().catch(() => ({}));
      setErrorMsg(data.error ?? "Vote failed.");
      setPhase("error");
    } catch {
      setErrorMsg("Network error. Try again.");
      setPhase("error");
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setPhase("loading");
    try {
      const res = await fetch("/api/intel/vote/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicId,
          email,
          website,
          turnstileToken,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPhase("check-email");
      } else {
        setErrorMsg(data.error ?? "Couldn't send confirm email.");
        setPhase("needs-email");
      }
    } catch {
      setErrorMsg("Network error. Try again.");
      setPhase("needs-email");
    }
  }

  return (
    <div className="rex-card p-5">
      <div className="flex items-center gap-4 mb-3">
        <div className="text-center">
          <div className="font-display text-3xl font-semibold text-white tabular-nums">
            {count.toLocaleString()}
          </div>
          <div
            className="text-[10px] font-mono uppercase tracking-widest"
            style={{ color: "var(--rex-text-dim)" }}
          >
            {count === 1 ? "vote" : "votes"}
          </div>
        </div>

        <div className="flex-1">
          {phase === "voted" ? (
            <div
              className="text-sm"
              style={{ color: "var(--rex-accent)" }}
            >
              ✓ Vote recorded. Thanks for the signal.
            </div>
          ) : phase === "check-email" ? (
            <div className="text-sm" style={{ color: "var(--rex-accent)" }}>
              ✓ Check your inbox — click the confirm link to record your vote.
            </div>
          ) : phase === "needs-email" || phase === "loading" || phase === "error" ? (
            <p
              className="text-xs leading-relaxed"
              style={{ color: "var(--rex-text-muted)" }}
            >
              Confirm your email to vote. Counts toward this month's
              community prize pool.{" "}
              <a
                href="/intel/leaderboard"
                className="underline decoration-dotted underline-offset-2"
                style={{ color: "var(--rex-accent)" }}
              >
                How it works ▸
              </a>
            </p>
          ) : (
            <button
              type="button"
              onClick={handleVoteClick}
              className="rex-btn whitespace-nowrap"
            >
              ▲ Vote
            </button>
          )}
        </div>
      </div>

      {(phase === "needs-email" || phase === "loading" || phase === "error") && (
        <form onSubmit={handleEmailSubmit} className="space-y-2">
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "-10000px",
              width: "1px",
              height: "1px",
              overflow: "hidden",
            }}
          >
            <label htmlFor={`vote-hp-${publicId}`}>Website</label>
            <input
              type="text"
              id={`vote-hp-${publicId}`}
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              required
              placeholder="your@email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rex-input flex-1 text-sm"
            />
            <button
              type="submit"
              disabled={phase === "loading"}
              className="rex-btn whitespace-nowrap text-sm"
            >
              {phase === "loading" ? "Sending…" : "Send confirm ▸"}
            </button>
          </div>

          <Turnstile onToken={setTurnstileToken} className="mt-1" />

          {errorMsg && (
            <p className="text-xs font-mono text-[var(--rex-danger)]">
              ✕ {errorMsg}
            </p>
          )}

          <p
            className="text-[10px] font-mono tracking-wider mt-1"
            style={{ color: "var(--rex-text-dim)" }}
          >
            FIRST VOTE = ONE-CLICK EMAIL CONFIRM · 30-DAY BROWSER COOKIE
          </p>
        </form>
      )}
    </div>
  );
}
