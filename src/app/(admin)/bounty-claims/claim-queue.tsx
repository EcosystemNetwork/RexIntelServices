"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  BountyClaimEvidence,
  BountyClaimRejectionReason,
} from "@/lib/db/schema";
import { explorerUrl } from "@/lib/chains";

type ClaimRow = {
  claimPublicId: string;
  claimStatus: "submitted" | "under_review" | "needs_info";
  submittedAt: string;
  lastTouchedAt: string;
  claimantSubmitterId: string;
  claimantHandle: string | null;
  claimantSlug: string | null;
  claimantStrikes: number;
  claimantBannedAt: string | null;
  evidence: BountyClaimEvidence;
  bondAmountUsdc: string;
  bountyPublicId: string;
  bountyKind: "recovery" | "info_recovery" | "info_arrest";
  bountyStatus: string;
  bountyFlatAmountUsdc: string | null;
  bountyRecoveryPercentBps: number | null;
  bountyEscrowedAmountUsdc: string;
  bountyVictimEmail: string;
  bountyExpiresAt: string;
  bountyPoliceReportFiled: boolean;
};

type Verdict = "accepted" | "partial" | "rejected" | "needs_info";

const REJECTION_REASONS: { value: BountyClaimRejectionReason; label: string; strike: boolean }[] = [
  { value: "insufficient_evidence", label: "Insufficient evidence", strike: false },
  { value: "duplicate", label: "Duplicate", strike: false },
  { value: "out_of_scope", label: "Out of scope", strike: false },
  { value: "bad_faith", label: "Bad faith — STRIKE", strike: true },
  { value: "doxx_attempt", label: "Doxx attempt — STRIKE", strike: true },
];

export function ClaimQueue() {
  const [claims, setClaims] = useState<ClaimRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch("/api/admin/bounty-claims");
      const data = (await res.json()) as
        | { ok: true; claims: ClaimRow[] }
        | { ok: false; error: string };
      if (!res.ok || !data.ok) {
        setErr("error" in data ? data.error : "load_failed");
        return;
      }
      setClaims(data.claims);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "network_error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (err) {
    return (
      <section className="rex-card p-4 border border-[var(--rex-warning)]/40">
        <div className="text-[12px] font-mono text-[var(--rex-warning)]">
          ⚠ {err}
        </div>
      </section>
    );
  }
  if (!claims) {
    return (
      <section className="rex-card p-4 text-sm text-[var(--rex-text-muted)]">
        Loading…
      </section>
    );
  }
  if (claims.length === 0) {
    return (
      <section className="rex-card p-6 text-center text-sm text-[var(--rex-text-muted)]">
        No open claims. ✓
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {claims.map((c) => (
        <ClaimCard key={c.claimPublicId} claim={c} onReviewed={load} />
      ))}
    </section>
  );
}

function ClaimCard({
  claim,
  onReviewed,
}: {
  claim: ClaimRow;
  onReviewed: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [verdict, setVerdict] = useState<Verdict>("accepted");
  const [payoutAmount, setPayoutAmount] = useState<string>(
    suggestedPayout(claim),
  );
  const [rejectionReason, setRejectionReason] =
    useState<BountyClaimRejectionReason>("insufficient_evidence");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    const body: Record<string, unknown> = {
      verdict,
      curatorNotes: notes || undefined,
    };
    if (verdict === "rejected") body.rejectionReason = rejectionReason;
    if (verdict === "accepted" || verdict === "partial") {
      const n = Number(payoutAmount);
      if (!Number.isFinite(n) || n <= 0) {
        setError("payout amount must be > 0");
        setSubmitting(false);
        return;
      }
      body.payoutAmountUsdc = n;
    }
    try {
      const res = await fetch(
        `/api/admin/bounty-claims/${encodeURIComponent(claim.claimPublicId)}/review`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = (await res.json()) as
        | { ok: true }
        | { ok: false; error: string; reason?: string };
      if (!res.ok || !data.ok) {
        const reason =
          "reason" in data && data.reason
            ? data.reason
            : "error" in data
              ? data.error
              : "submit_failed";
        setError(String(reason));
        setSubmitting(false);
        return;
      }
      onReviewed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "network_error");
      setSubmitting(false);
    }
  }

  return (
    <article className="rex-card p-4 sm:p-5 space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-[var(--rex-warning)]/10 text-[var(--rex-warning)]">
              {claim.claimStatus}
            </span>
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
              {claim.bountyKind.replace("_", " ")}
            </span>
            <span
              className={`text-[10px] font-mono uppercase tracking-widest ${
                ageHours(claim.lastTouchedAt) > 48
                  ? "text-[var(--rex-warning)]"
                  : "text-[var(--rex-text-dim)]"
              }`}
              title={`last touched ${claim.lastTouchedAt}`}
            >
              · {humanAge(claim.lastTouchedAt)} since touch
            </span>
            {claim.bountyPoliceReportFiled ? (
              <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-warning)]">
                · Police report
              </span>
            ) : null}
          </div>
          <div className="text-sm font-mono text-white">
            <a
              href={`/bounties/${claim.bountyPublicId}`}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--rex-accent)] underline decoration-dotted underline-offset-2"
            >
              {claim.bountyPublicId}
            </a>{" "}
            <span className="text-[var(--rex-text-dim)]">·</span>{" "}
            {claim.bountyKind === "recovery"
              ? `${((claim.bountyRecoveryPercentBps ?? 0) / 100).toFixed(0)}% of recovered`
              : `$${Number(claim.bountyFlatAmountUsdc ?? 0).toLocaleString()} USDC`}{" "}
            <span className="text-[var(--rex-text-dim)]">·</span>{" "}
            escrow ${Number(claim.bountyEscrowedAmountUsdc).toFixed(0)}
          </div>
          <div className="text-[11px] font-mono text-[var(--rex-text-dim)]">
            victim: {claim.bountyVictimEmail}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
            Claimant
          </div>
          <div className="text-sm font-mono">
            {claim.claimantHandle ? (
              <a
                href={`/contributors/${claim.claimantSlug ?? ""}`}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--rex-accent)] underline decoration-dotted underline-offset-2"
              >
                @{claim.claimantHandle}
              </a>
            ) : (
              <span className="text-[var(--rex-text-dim)]">anonymous</span>
            )}
          </div>
          <div className="text-[10px] font-mono text-[var(--rex-text-dim)]">
            strikes: {claim.claimantStrikes}
            {claim.claimantBannedAt ? " · BANNED" : ""}
          </div>
          <div className="text-[10px] font-mono text-[var(--rex-text-dim)]">
            bond: ${Number(claim.bondAmountUsdc).toFixed(0)}
          </div>
        </div>
      </header>

      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-[11px] font-mono uppercase tracking-widest text-[var(--rex-accent)] underline decoration-dotted underline-offset-2"
      >
        {expanded ? "Hide evidence ↑" : "Show evidence ↓"}
      </button>

      {expanded ? (
        <div className="space-y-2 border-t border-[var(--rex-border-subtle)] pt-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] mb-1">
              Narrative
            </div>
            <div className="text-sm text-[var(--rex-text-muted)] whitespace-pre-wrap leading-relaxed">
              {claim.evidence.narrative}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] mb-1">
              Target addresses ({claim.evidence.targetAddresses.length})
              {claim.evidence.chain ? ` · ${claim.evidence.chain}` : ""}
            </div>
            <ul className="space-y-1">
              {claim.evidence.targetAddresses.map((a) => {
                const href = explorerUrl(claim.evidence.chain ?? "ethereum", a);
                return (
                  <li
                    key={a}
                    className="text-[11px] font-mono text-[var(--rex-text-muted)] break-all"
                  >
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--rex-accent)] underline decoration-dotted underline-offset-2 hover:decoration-solid"
                      >
                        {a}
                      </a>
                    ) : (
                      a
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          {claim.evidence.suspectedEntity ? (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] mb-1">
                Suspected entity
              </div>
              <div className="text-sm text-[var(--rex-text-muted)]">
                {claim.evidence.suspectedEntity}
              </div>
            </div>
          ) : null}
          {claim.evidence.attachmentUrls?.length ? (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] mb-1">
                Attachments
              </div>
              <ul className="space-y-1">
                {claim.evidence.attachmentUrls.map((u) => (
                  <li key={u} className="text-[11px] font-mono">
                    <a
                      href={u}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--rex-accent)] underline decoration-dotted underline-offset-2 break-all"
                    >
                      {u}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="border-t border-[var(--rex-border-subtle)] pt-3 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
          ● Verdict
        </div>
        <div className="flex flex-wrap gap-2">
          {(["accepted", "partial", "needs_info", "rejected"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVerdict(v)}
              className={`text-[11px] font-mono uppercase tracking-widest px-3 py-1.5 rounded border transition ${
                verdict === v
                  ? "border-[var(--rex-accent)] text-[var(--rex-accent)] bg-[var(--rex-accent)]/10"
                  : "border-[var(--rex-border-subtle)] text-[var(--rex-text-muted)]"
              }`}
            >
              {v.replace("_", " ")}
            </button>
          ))}
        </div>

        {verdict === "accepted" || verdict === "partial" ? (
          <label className="block space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
              Payout USDC (escrow available: ${Number(claim.bountyEscrowedAmountUsdc).toFixed(0)})
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
              className="w-full text-sm font-mono bg-[var(--rex-bg-elevated)] border border-[var(--rex-border-subtle)] rounded p-2 text-white"
            />
          </label>
        ) : null}

        {verdict === "rejected" ? (
          <label className="block space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
              Rejection reason
            </span>
            <select
              value={rejectionReason}
              onChange={(e) =>
                setRejectionReason(e.target.value as BountyClaimRejectionReason)
              }
              className="w-full text-sm font-mono bg-[var(--rex-bg-elevated)] border border-[var(--rex-border-subtle)] rounded p-2 text-white"
            >
              {REJECTION_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            {REJECTION_REASONS.find((r) => r.value === rejectionReason)?.strike ? (
              <div className="text-[10px] font-mono text-[var(--rex-warning)]">
                ⚠ This verdict issues a strike. Bond will be slashed to the victim.
              </div>
            ) : null}
          </label>
        ) : null}

        <label className="block space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
            Curator notes (private)
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full text-sm font-mono bg-[var(--rex-bg-elevated)] border border-[var(--rex-border-subtle)] rounded p-2 text-white"
          />
        </label>

        {error ? (
          <div className="text-[12px] font-mono text-[var(--rex-warning)]">
            ⚠ {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="text-[11px] font-mono uppercase tracking-widest px-3 py-2 rounded border border-[var(--rex-accent)]/40 text-[var(--rex-accent)] hover:bg-[var(--rex-accent)]/10 transition disabled:opacity-40"
        >
          {submitting ? "Submitting…" : "Submit verdict →"}
        </button>
      </div>
    </article>
  );
}

function ageHours(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (60 * 60 * 1000);
}

function humanAge(iso: string): string {
  const h = ageHours(iso);
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

function suggestedPayout(claim: ClaimRow): string {
  if (claim.bountyKind === "recovery") {
    // Recovery: suggest 0; curator must enter recovered amount.
    return "";
  }
  // Flat: suggest the full posted amount, capped at escrow.
  const posted = Number(claim.bountyFlatAmountUsdc ?? "0");
  const escrow = Number(claim.bountyEscrowedAmountUsdc);
  return Math.min(posted, escrow).toFixed(2);
}
