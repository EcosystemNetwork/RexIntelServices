"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type TargetKind = "address" | "url" | "intel" | "question";

export function ForensicSubmitForm() {
  const router = useRouter();
  const [targetKind, setTargetKind] = useState<TargetKind>("address");
  const [target, setTarget] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const placeholder =
    targetKind === "address"
      ? "0x… drained or suspicious wallet"
      : targetKind === "url"
        ? "https:// scam site, X post, etherscan label page…"
        : targetKind === "intel"
          ? "Intel publicId (e.g. a3f0b71c) or headline keywords"
          : "Free-text question — e.g. 'who is behind 0x0000db5c8b03…?'";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setStatus("Spinning up ForensicAgent — this can take up to 2 minutes…");
    setBusy(true);
    try {
      const res = await fetch("/api/forensic/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetKind,
          target: target.trim(),
          chain: targetKind === "address" ? "ethereum" : undefined,
          submitterEmail: email.trim() || undefined,
        }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        publicId?: string;
        resultUrl?: string;
        status?: string;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.resultUrl) {
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setStatus("Case ready — opening report…");
      router.push(body.resultUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Investigation failed");
      setStatus(null);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] block mb-1">
          Target kind
        </label>
        <div className="flex flex-wrap gap-2">
          {(["address", "url", "intel", "question"] as TargetKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTargetKind(k)}
              disabled={busy}
              className={
                k === targetKind
                  ? "px-3 py-1 text-[11px] font-mono uppercase tracking-widest rounded border border-[var(--rex-accent)] text-[var(--rex-accent)] bg-[var(--rex-accent)]/10"
                  : "px-3 py-1 text-[11px] font-mono uppercase tracking-widest rounded border border-[var(--rex-border)] text-[var(--rex-text-muted)] hover:text-[var(--rex-text)]"
              }
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] block mb-1">
          Target
        </label>
        <input
          type="text"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rex-input w-full font-mono text-sm"
          disabled={busy}
          maxLength={500}
        />
      </div>

      <div>
        <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] block mb-1">
          Your email (optional — for case updates)
        </label>
        <input
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rex-input w-full text-sm"
          disabled={busy}
        />
      </div>

      <button
        type="submit"
        disabled={busy || target.trim().length === 0}
        className="rex-btn-primary w-full sm:w-auto"
      >
        {busy ? "Investigating…" : "Run ForensicAgent"}
      </button>

      {status && (
        <div className="text-[12px] text-[var(--rex-text-muted)]" role="status">
          {status}
        </div>
      )}
      {error && (
        <div className="text-[12px] text-red-400" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}
