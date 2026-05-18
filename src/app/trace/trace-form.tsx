"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TraceSubmitForm() {
  const router = useRouter();
  const [rootAddress, setRootAddress] = useState("");
  const [email, setEmail] = useState("");
  const [victimLabel, setVictimLabel] = useState("");
  const [lossUsd, setLossUsd] = useState("");
  const [lossTokenSymbol, setLossTokenSymbol] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setStatus("Submitting trace request…");
    setBusy(true);
    try {
      const res = await fetch("/api/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chain: "ethereum",
          rootAddress: rootAddress.trim(),
          submitterEmail: email.trim(),
          victimLabel: victimLabel.trim() || undefined,
          lossUsd: lossUsd ? Number(lossUsd) : undefined,
          lossTokenSymbol: lossTokenSymbol.trim() || undefined,
        }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        publicId?: string;
        resultUrl?: string;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.resultUrl) {
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setStatus("Trace complete — opening results…");
      router.push(body.resultUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trace failed");
      setStatus(null);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] block mb-1">
          Drained wallet (Ethereum address)
        </label>
        <input
          type="text"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="0x…"
          value={rootAddress}
          onChange={(e) => setRootAddress(e.target.value)}
          className="rex-input w-full font-mono text-sm"
          disabled={busy}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] block mb-1">
            Loss (USD, optional)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
            value={lossUsd}
            onChange={(e) => setLossUsd(e.target.value)}
            className="rex-input w-full text-sm"
            disabled={busy}
          />
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] block mb-1">
            Token drained (optional)
          </label>
          <input
            type="text"
            placeholder="USDC, ETH, etc."
            maxLength={16}
            value={lossTokenSymbol}
            onChange={(e) => setLossTokenSymbol(e.target.value)}
            className="rex-input w-full text-sm uppercase"
            disabled={busy}
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] block mb-1">
          Label (optional — shown publicly on the result page)
        </label>
        <input
          type="text"
          maxLength={200}
          placeholder='e.g. "Drained 2026-04-15, seed-phrase phish"'
          value={victimLabel}
          onChange={(e) => setVictimLabel(e.target.value)}
          className="rex-input w-full text-sm"
          disabled={busy}
        />
      </div>

      <div>
        <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] block mb-1">
          Your email (we don&apos;t publish it; needed to follow up)
        </label>
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rex-input w-full text-sm"
          disabled={busy}
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="text-[10px] font-mono uppercase tracking-widest px-4 py-2 rounded-sm border border-[var(--rex-accent)] text-[var(--rex-accent)] hover:bg-[rgba(95,185,31,0.08)] transition-colors disabled:opacity-50"
        >
          {busy ? "Tracing…" : "Run trace ▸"}
        </button>
        <span className="text-[11px] text-[var(--rex-text-dim)] font-mono">
          {busy ? "Walking outbound flow — may take 20–40 seconds." : "Result is public + shareable."}
        </span>
      </div>

      {status ? (
        <div className="text-[11px] font-mono text-[var(--rex-accent)]">
          {status}
        </div>
      ) : null}
      {error ? (
        <div className="text-[11px] font-mono text-[var(--rex-warning)]">
          {error}
        </div>
      ) : null}
    </form>
  );
}
