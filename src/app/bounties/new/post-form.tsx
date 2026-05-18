"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Kind = "recovery" | "info_recovery" | "info_arrest";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | {
      kind: "ok";
      publicId: string;
      bountyUrl: string;
      victimAccessToken: string;
      victimVerified: boolean;
    }
  | { kind: "err"; reason: string };

export function PostBountyForm({
  traceContext,
}: {
  traceContext: {
    publicId: string;
    prefilledEmail: string;
    lossUsd: number | null;
  } | null;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("recovery");
  const [email, setEmail] = useState(traceContext?.prefilledEmail ?? "");
  const [percentBps, setPercentBps] = useState<number>(1000); // 10% default
  const [flatAmount, setFlatAmount] = useState<number>(
    traceContext?.lossUsd
      ? Math.max(500, Math.min(50_000, Math.round(traceContext.lossUsd * 0.1)))
      : 5_000,
  );
  const [expiresInDays, setExpiresInDays] = useState<number>(60);
  const [description, setDescription] = useState("");
  const [policeReportFiled, setPoliceReportFiled] = useState(false);
  const [policeReportRef, setPoliceReportRef] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "submitting" });

    try {
      const res = await fetch("/api/bounties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hackTracePublicId: traceContext?.publicId,
          victimEmail: email,
          kind,
          recoveryPercentBps: kind === "recovery" ? percentBps : null,
          flatAmountUsdc: kind === "recovery" ? null : flatAmount,
          policeReportFiled,
          policeReportRef: policeReportFiled ? policeReportRef : null,
          expiresInDays,
          description,
          termsAccepted,
        }),
      });
      const data = (await res.json()) as
        | {
            ok: true;
            publicId: string;
            bountyUrl: string;
            victimAccessToken: string;
            victimVerified: boolean;
          }
        | { ok: false; error: string; details?: Array<{ field: string; reason: string }> };
      if (!res.ok || !data.ok) {
        const reason =
          "details" in data && data.details && data.details.length > 0
            ? data.details
                .map((d) => `${d.field}: ${d.reason}`)
                .join(", ")
            : ("error" in data && data.error) || "submit_failed";
        setStatus({ kind: "err", reason: String(reason) });
        return;
      }
      setStatus({
        kind: "ok",
        publicId: data.publicId,
        bountyUrl: data.bountyUrl,
        victimAccessToken: data.victimAccessToken,
        victimVerified: data.victimVerified,
      });
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
      <section className="rex-card p-4 sm:p-5 space-y-3 border border-[var(--rex-accent)]/40">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
          ● Bounty created · draft
        </div>
        <div className="text-sm text-[var(--rex-text-muted)]">
          Ref: <span className="font-mono">{status.publicId}</span>
        </div>
        <div className="text-[12px] text-[var(--rex-text-dim)] leading-relaxed">
          Your bounty is in <strong>draft</strong> state. You&apos;ll
          receive funding instructions by email — once USDC arrives in the
          custodial escrow wallet on Base AND your email is verified, the
          bounty flips to <strong>open</strong> and becomes visible to
          trusted-tier researchers.
        </div>

        <div className="border border-[var(--rex-warning)]/40 rounded p-3 space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-warning)]">
            ⚠ Save this access link — shown once
          </div>
          <div className="text-[11px] text-[var(--rex-text-dim)]">
            Until you verify your email, this is the only way back to your
            draft. Bookmark it. (We&apos;ll also email it to you.)
          </div>
          <code className="block text-[10px] font-mono text-[var(--rex-text-muted)] bg-[var(--rex-bg-elevated)] rounded p-2 break-all">
            {typeof window !== "undefined"
              ? `${window.location.origin}${status.bountyUrl}`
              : status.bountyUrl}
          </code>
        </div>

        {!status.victimVerified ? (
          <div className="text-[11px] text-[var(--rex-text-dim)] leading-relaxed">
            Your email isn&apos;t verified yet. Open the link above and
            complete the verification step — until then the bounty stays
            private even if it&apos;s funded.
          </div>
        ) : (
          <div className="text-[11px] text-[var(--rex-accent)] leading-relaxed">
            ✓ Email already verified via your session — once funded the
            bounty publishes automatically.
          </div>
        )}

        <a
          href={status.bountyUrl}
          className="inline-block text-[11px] font-mono uppercase tracking-widest px-3 py-2 rounded border border-[var(--rex-accent)]/40 text-[var(--rex-accent)] hover:bg-[var(--rex-accent)]/10 transition"
        >
          Open bounty page →
        </a>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rex-card p-4 sm:p-5 space-y-4">
      <label className="block space-y-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
          Bounty kind
        </span>
        <select
          value={kind}
          onChange={(e) => {
            const v = e.target.value as Kind;
            // info_arrest is "coming soon" — don't let it become the
            // active selection. The option is rendered as disabled below
            // so it's visible (we want creators to know it's planned)
            // but unselectable until legal sign-off.
            if (v !== "info_arrest") setKind(v);
          }}
          className="w-full text-sm font-mono bg-[var(--rex-bg-elevated)] border border-[var(--rex-border-subtle)] rounded p-2 text-[var(--rex-text)]"
        >
          <option value="recovery">
            Recovery — % of recovered funds
          </option>
          <option value="info_recovery">
            Info → Recovery — flat USDC for info that leads to recovery
          </option>
          <option value="info_arrest" disabled>
            Info → Arrest — coming soon (counsel review)
          </option>
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
          Victim email
          {traceContext ? (
            <span className="text-[var(--rex-warning)]">
              {" "}
              · must match the email on the trace
            </span>
          ) : null}
        </span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full text-sm font-mono bg-[var(--rex-bg-elevated)] border border-[var(--rex-border-subtle)] rounded p-2 text-[var(--rex-text)]"
        />
      </label>

      {kind === "recovery" ? (
        <label className="block space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
            % of recovered funds (1–50%)
          </span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={100}
              max={5000}
              step={100}
              value={percentBps}
              onChange={(e) => setPercentBps(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-base font-mono text-[var(--rex-text)] w-16 text-right">
              {(percentBps / 100).toFixed(0)}%
            </span>
          </div>
        </label>
      ) : (
        <label className="block space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
            Flat USDC amount (min $500)
          </span>
          <input
            type="number"
            min={500}
            max={1_000_000}
            step={100}
            required
            value={flatAmount}
            onChange={(e) => setFlatAmount(Number(e.target.value))}
            className="w-full text-sm font-mono bg-[var(--rex-bg-elevated)] border border-[var(--rex-border-subtle)] rounded p-2 text-[var(--rex-text)]"
          />
        </label>
      )}

      <label className="block space-y-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
          Expires in days (7–365)
        </span>
        <input
          type="number"
          min={7}
          max={365}
          required
          value={expiresInDays}
          onChange={(e) => setExpiresInDays(Number(e.target.value))}
          className="w-full text-sm font-mono bg-[var(--rex-bg-elevated)] border border-[var(--rex-border-subtle)] rounded p-2 text-[var(--rex-text)]"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
          Description — what info is wanted, what counts as success (min 40 chars)
        </span>
        <textarea
          required
          minLength={40}
          maxLength={8000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder="What was stolen, how, what you've already tried, what evidence would unlock the bounty (e.g., custodial address where the funds end up, doxx + recovery cooperation, attestation of arrest)."
          className="w-full text-sm font-mono bg-[var(--rex-bg-elevated)] border border-[var(--rex-border-subtle)] rounded p-2 text-[var(--rex-text)]"
        />
      </label>

      {kind === "info_arrest" ? (
        <div className="space-y-2 border border-[var(--rex-warning)]/40 rounded p-3">
          <label className="flex items-start gap-2 text-[12px] text-[var(--rex-text-muted)]">
            <input
              type="checkbox"
              checked={policeReportFiled}
              onChange={(e) => setPoliceReportFiled(e.target.checked)}
              className="mt-1"
            />
            <span>
              I attest that I have filed a police report. RexIntel does
              not verify this; I am responsible for the truthfulness of
              this statement. I understand that we may respond to lawful
              requests from law enforcement.
            </span>
          </label>
          {policeReportFiled ? (
            <input
              type="text"
              required
              placeholder="Case ref / jurisdiction (e.g., LA-FBI 2026-04331)"
              value={policeReportRef}
              onChange={(e) => setPoliceReportRef(e.target.value)}
              className="w-full text-sm font-mono bg-[var(--rex-bg-elevated)] border border-[var(--rex-border-subtle)] rounded p-2 text-[var(--rex-text)]"
            />
          ) : null}
        </div>
      ) : null}

      <label className="flex items-start gap-2 text-[12px] text-[var(--rex-text-muted)] border-t border-[var(--rex-border-subtle)] pt-3">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          className="mt-1"
        />
        <span>
          I accept the bounty terms: claims are sealed evidence packages
          adjudicated by a curator; I will be asked to ack the outcome
          before payout; bonds are slashed only on bad-faith verdicts; no
          platform fee.
        </span>
      </label>

      {status.kind === "err" ? (
        <div className="text-[12px] font-mono text-[var(--rex-warning)]">
          ⚠ {status.reason}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={status.kind === "submitting" || !termsAccepted}
        className="text-[11px] font-mono uppercase tracking-widest px-3 py-2 rounded border border-[var(--rex-accent)]/40 text-[var(--rex-accent)] hover:bg-[var(--rex-accent)]/10 transition disabled:opacity-40"
      >
        {status.kind === "submitting" ? "Creating…" : "Create draft bounty →"}
      </button>
    </form>
  );
}
