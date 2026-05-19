"use client";

import { useState, useEffect } from "react";

/**
 * Voting widget for any community submission detail page. The API routes
 * remain under /api/intel/vote/* for backwards compatibility, but the
 * server accepts any approved submission type (intel, capital, fellowship,
 * grant, perks, etc.) — loss_report is the only excluded type.
 *
 * One-click anonymous voting: POST /api/intel/vote/cast mints an anon
 * subscriber + signed cookie on first call, then records the vote. Caps
 * enforced server-side: 1 per submission, 3 per UTC month per cookie.
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
    "idle" | "loading" | "voted" | "cap-reached" | "error"
  >(initialVoted ? "voted" : "idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Honor ?voted=1 / ?vote=cap query params left over from the previous
  // magic-link confirm redirect (any old emails still in inboxes).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    let mutated = false;
    if (params.get("voted") === "1" && phase !== "voted") {
      setCount((c) => c + 1);
      setPhase("voted");
      params.delete("voted");
      mutated = true;
    }
    if (params.get("vote") === "cap" && phase !== "cap-reached") {
      setPhase("cap-reached");
      params.delete("vote");
      mutated = true;
    }
    if (mutated) {
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
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.alreadyVoted) {
          setPhase("voted");
        } else {
          setCount((c) => c + 1);
          setPhase("voted");
        }
        return;
      }
      if (res.status === 429 && data?.capReached) {
        setPhase("cap-reached");
        return;
      }
      setErrorMsg(data.error ?? "Vote failed.");
      setPhase("error");
    } catch {
      setErrorMsg("Network error. Try again.");
      setPhase("error");
    }
  }

  return (
    <div className="rex-card p-5">
      <div className="flex items-center gap-4">
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
            <div className="text-sm" style={{ color: "var(--rex-accent)" }}>
              ✓ Vote recorded. Thanks for the signal.
            </div>
          ) : phase === "cap-reached" ? (
            <div
              className="text-sm"
              style={{ color: "var(--rex-text-muted)" }}
            >
              Monthly vote limit reached (3/month). Resets at the start of
              next month UTC.
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handleVoteClick}
                disabled={phase === "loading"}
                className="rex-btn whitespace-nowrap"
              >
                {phase === "loading" ? "Voting…" : "▲ Vote"}
              </button>
              <p
                className="text-[10px] font-mono tracking-wider mt-2"
                style={{ color: "var(--rex-text-dim)" }}
              >
                ONE CLICK · 1 PER ENTRY · 3 PER MONTH
              </p>
              {errorMsg && (
                <p className="text-xs font-mono text-[var(--rex-danger)] mt-1">
                  ✕ {errorMsg}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
