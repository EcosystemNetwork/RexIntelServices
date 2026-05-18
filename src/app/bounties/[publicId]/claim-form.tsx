"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "ok"; publicId: string; existed: boolean }
  | { kind: "err"; reason: string };

export function BountyClaimForm({
  bountyPublicId,
  bondAmountUsdc,
}: {
  bountyPublicId: string;
  bondAmountUsdc: number;
}) {
  const router = useRouter();
  const [narrative, setNarrative] = useState("");
  const [targets, setTargets] = useState("");
  const [suspectedEntity, setSuspectedEntity] = useState("");
  const [chain, setChain] = useState("ethereum");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "submitting" });

    const targetAddresses = targets
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch(
        `/api/bounties/${encodeURIComponent(bountyPublicId)}/claims`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            evidence: {
              narrative,
              targetAddresses,
              suspectedEntity: suspectedEntity || undefined,
              chain,
            },
          }),
        },
      );
      const data = (await res.json()) as
        | { ok: true; publicId: string; existed: boolean }
        | { ok: false; error: string; reason?: string };
      if (!res.ok || !data.ok) {
        const reason =
          ("reason" in data && data.reason) ||
          ("error" in data && data.error) ||
          "submit_failed";
        setStatus({ kind: "err", reason: String(reason) });
        return;
      }
      setStatus({ kind: "ok", publicId: data.publicId, existed: data.existed });
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
      <section className="rex-card p-4 sm:p-5 space-y-2 border border-[var(--rex-accent)]/40">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
          ● Claim {status.existed ? "already submitted" : "submitted"}
        </div>
        <div className="text-sm text-[var(--rex-text-muted)]">
          Ref: <span className="font-mono">{status.publicId}</span>
        </div>
        <div className="text-[12px] text-[var(--rex-text-dim)]">
          A curator will review your evidence. You&apos;ll receive an email
          when the verdict is in. Your $
          {bondAmountUsdc.toFixed(0)} bond is held until the verdict and
          refunded on any non-bad-faith outcome.
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rex-card p-4 sm:p-5 space-y-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-warning)]">
        ● Submit a claim — sealed evidence package
      </div>
      <div className="text-[11px] font-mono text-[var(--rex-text-dim)]">
        Only the victim and curator will read the contents. A $
        {bondAmountUsdc.toFixed(0)} USDC bond will be charged at submit —
        refunded on any non-bad-faith outcome.
      </div>

      <label className="block space-y-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
          Narrative <span className="text-[var(--rex-warning)]">(min 80 chars)</span>
        </span>
        <textarea
          required
          minLength={80}
          maxLength={16_000}
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          rows={6}
          placeholder="What did you find? How did you find it? What addresses, exchanges, on-chain artifacts do you have? Cite tx hashes."
          className="w-full text-sm font-mono bg-[var(--rex-bg-elevated)] border border-[var(--rex-border-subtle)] rounded p-2 text-white"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
          Target addresses (one per line; 0x… hex)
        </span>
        <textarea
          required
          value={targets}
          onChange={(e) => setTargets(e.target.value)}
          rows={3}
          placeholder="0xabc...&#10;0xdef..."
          className="w-full text-sm font-mono bg-[var(--rex-bg-elevated)] border border-[var(--rex-border-subtle)] rounded p-2 text-white"
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
            Suspected entity (optional)
          </span>
          <input
            type="text"
            value={suspectedEntity}
            onChange={(e) => setSuspectedEntity(e.target.value)}
            maxLength={200}
            placeholder="e.g., known drainer-as-a-service operator"
            className="w-full text-sm font-mono bg-[var(--rex-bg-elevated)] border border-[var(--rex-border-subtle)] rounded p-2 text-white"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
            Chain
          </span>
          <select
            value={chain}
            onChange={(e) => setChain(e.target.value)}
            className="w-full text-sm font-mono bg-[var(--rex-bg-elevated)] border border-[var(--rex-border-subtle)] rounded p-2 text-white"
          >
            <option value="ethereum">ethereum</option>
            <option value="base">base</option>
            <option value="arbitrum">arbitrum</option>
            <option value="optimism">optimism</option>
            <option value="polygon">polygon</option>
            <option value="bnb">bnb</option>
          </select>
        </label>
      </div>

      <div className="text-[11px] font-mono text-[var(--rex-text-dim)] border-t border-[var(--rex-border-subtle)] pt-3">
        <strong className="text-[var(--rex-warning)]">Two-strike policy:</strong>{" "}
        bad-faith or doxx-attempt verdicts slash your bond to the victim
        and burn a strike. Two strikes = permanent ban from the bounty
        surface. Submit only what you can defend.
      </div>

      {status.kind === "err" ? (
        <div className="text-[12px] font-mono text-[var(--rex-warning)]">
          ⚠ {status.reason}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={status.kind === "submitting"}
        className="text-[11px] font-mono uppercase tracking-widest px-3 py-2 rounded border border-[var(--rex-accent)]/40 text-[var(--rex-accent)] hover:bg-[var(--rex-accent)]/10 transition disabled:opacity-40"
      >
        {status.kind === "submitting"
          ? "Submitting…"
          : `Submit claim · charge $${bondAmountUsdc.toFixed(0)} bond →`}
      </button>
    </form>
  );
}
