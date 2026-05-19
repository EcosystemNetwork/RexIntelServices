import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db, forensicCases } from "@/lib/db";
import type { ForensicReport, ForensicTranscriptStep } from "@/lib/db/schema";
import { PublicShell } from "@/components/public-shell";

export const dynamic = "force-dynamic";

async function loadCase(publicId: string) {
  const [row] = await db
    .select()
    .from(forensicCases)
    .where(eq(forensicCases.publicId, publicId))
    .limit(1);
  return row ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: { caseId: string };
}): Promise<Metadata> {
  const c = await loadCase(params.caseId);
  if (!c) return { title: "Case not found · RexIntel ForensicAgent" };
  const report = c.report as ForensicReport | null;
  const verdict = report?.verdict ?? c.status;
  return {
    title: `${c.target.slice(0, 40)}… · ${verdict} · RexIntel ForensicAgent`,
    description:
      report?.summary?.slice(0, 200) ??
      `RexIntel ForensicAgent investigation of ${c.target}.`,
  };
}

const VERDICT_TONE: Record<string, string> = {
  malicious: "text-red-400 border-red-500/40 bg-red-500/10",
  suspicious: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  clean: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  inconclusive: "text-[var(--rex-text-muted)] border-[var(--rex-border)] bg-transparent",
};

function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function fmtMs(ms?: number): string {
  if (!ms || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function citationHref(c: ForensicReport["citations"][number]): string | null {
  switch (c.kind) {
    case "rexintel_intel":
      return `/intel/${c.ref}`;
    case "rexintel_trace":
      return `/trace/${c.ref}`;
    case "external_url":
      return /^https?:\/\//.test(c.ref) ? c.ref : null;
    case "rexintel_attribution":
    default:
      return null;
  }
}

export default async function ForensicCasePage({
  params,
}: {
  params: { caseId: string };
}) {
  const c = await loadCase(params.caseId);
  if (!c) notFound();

  const report = c.report as ForensicReport | null;
  const transcript = (c.transcript ?? []) as ForensicTranscriptStep[];
  const verdict = report?.verdict ?? "—";
  const verdictTone =
    VERDICT_TONE[verdict] ?? VERDICT_TONE.inconclusive;

  return (
    <PublicShell
      classification={[
        { text: "● Public · Audit trail · Read-only" },
        { text: `Case ${c.publicId}`, show: "sm" },
        { text: c.modelId ?? "Gemini 2.5 Pro", show: "md" },
      ]}
    >
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
              ● ForensicAgent case
            </span>
            <span
              className={
                "text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border " +
                verdictTone
              }
            >
              {verdict}
            </span>
            {report ? (
              <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
                confidence {fmtPct(report.confidence)}
              </span>
            ) : (
              <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
                status {c.status}
              </span>
            )}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--rex-text)] break-all">
            {c.target}
          </h1>
          <div className="text-[12px] text-[var(--rex-text-muted)] font-mono">
            target_kind: {c.targetKind}
            {c.chain ? ` · chain: ${c.chain}` : ""} · iterations:{" "}
            {c.iterationsUsed}/{c.maxIterations} · tool calls: {c.toolCallCount}
          </div>
        </header>

        {report ? (
          <>
            <section className="rex-card p-4 sm:p-5 space-y-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
                Summary
              </div>
              <p className="text-sm text-[var(--rex-text)] leading-relaxed whitespace-pre-wrap">
                {report.summary}
              </p>
              {report.attributedTo && (
                <div className="text-[12px] text-[var(--rex-text-muted)]">
                  <span className="font-mono uppercase tracking-widest text-[10px] text-[var(--rex-text-dim)]">
                    Attributed to:
                  </span>{" "}
                  <span className="text-[var(--rex-text)]">{report.attributedTo}</span>
                </div>
              )}
            </section>

            {report.fundsFlow.length > 0 && (
              <section className="rex-card p-4 sm:p-5 space-y-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
                  Funds flow
                </div>
                <ul className="space-y-2 text-[13px]">
                  {report.fundsFlow.map((f, i) => (
                    <li key={i} className="font-mono text-[var(--rex-text-muted)] leading-relaxed">
                      <span className="text-[var(--rex-text)]">{f.from}</span>{" "}
                      → <span className="text-[var(--rex-text)]">{f.to}</span>
                      {f.via ? <span> via {f.via}</span> : null}
                      {f.amountUsd ? (
                        <span> · ${f.amountUsd.toLocaleString()}</span>
                      ) : null}
                      {f.note ? <span className="block ml-4">{f.note}</span> : null}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {report.citations.length > 0 && (
              <section className="rex-card p-4 sm:p-5 space-y-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
                  Citations ({report.citations.length})
                </div>
                <ul className="space-y-2 text-[13px]">
                  {report.citations.map((cite, i) => {
                    const href = citationHref(cite);
                    return (
                      <li key={i} className="text-[var(--rex-text-muted)] leading-relaxed">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--rex-text-dim)] mr-2">
                          {cite.kind}
                        </span>
                        {href ? (
                          <Link
                            href={href}
                            className="text-[var(--rex-accent)] underline hover:no-underline break-all"
                            target={cite.kind === "external_url" ? "_blank" : undefined}
                            rel={cite.kind === "external_url" ? "noopener noreferrer" : undefined}
                          >
                            {cite.ref}
                          </Link>
                        ) : (
                          <span className="text-[var(--rex-text)] font-mono break-all">
                            {cite.ref}
                          </span>
                        )}
                        <div className="text-[12px] text-[var(--rex-text)] mt-1">
                          {cite.claim}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {report.timeline.length > 0 && (
              <section className="rex-card p-4 sm:p-5 space-y-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
                  Timeline
                </div>
                <ul className="space-y-1 text-[13px]">
                  {report.timeline.map((t, i) => (
                    <li key={i} className="text-[var(--rex-text-muted)]">
                      {t.at ? (
                        <span className="font-mono text-[var(--rex-text-dim)] mr-2">
                          {t.at}
                        </span>
                      ) : null}
                      <span className="text-[var(--rex-text)]">{t.event}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {report.recommendedActions.length > 0 && (
              <section className="rex-card p-4 sm:p-5 space-y-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
                  Recommended actions
                </div>
                <ul className="list-disc ml-5 space-y-1 text-[13px] text-[var(--rex-text)]">
                  {report.recommendedActions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <section className="rex-card p-4 sm:p-5 space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
              Status
            </div>
            <p className="text-sm text-[var(--rex-text-muted)]">
              {c.status === "running"
                ? "ForensicAgent is still investigating. Refresh in a moment."
                : c.status === "failed"
                  ? `Investigation failed: ${c.failureReason ?? "unknown error"}`
                  : "No report available yet."}
            </p>
          </section>
        )}

        <section className="rex-card p-4 sm:p-5 space-y-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
            Agent transcript ({transcript.length} steps)
          </div>
          <ol className="space-y-3 text-[12px]">
            {transcript.map((step, i) => (
              <li key={i} className="border-l border-[var(--rex-border)] pl-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] mb-1">
                  {i + 1}. {step.kind}
                  {step.kind === "tool_call" ? ` · ${step.name}` : ""}
                  {step.kind === "tool_call" && step.ms != null
                    ? ` · ${fmtMs(step.ms)}`
                    : ""}
                </div>
                {step.kind === "user_prompt" || step.kind === "thought" ? (
                  <pre className="whitespace-pre-wrap font-mono text-[12px] text-[var(--rex-text-muted)]">
                    {step.text}
                  </pre>
                ) : step.kind === "tool_call" ? (
                  <details className="space-y-1">
                    <summary className="cursor-pointer text-[12px] text-[var(--rex-text-muted)] hover:text-[var(--rex-text)]">
                      args + result (click to expand)
                    </summary>
                    <pre className="whitespace-pre-wrap font-mono text-[11px] text-[var(--rex-text-muted)] bg-black/20 p-2 rounded mt-1 overflow-x-auto">
                      {`args: ${JSON.stringify(step.args, null, 2)}\n\nresult: ${JSON.stringify(step.result, null, 2)}`}
                      {step.error ? `\n\nerror: ${step.error}` : ""}
                    </pre>
                  </details>
                ) : (
                  <span className="text-[12px] text-[var(--rex-text-muted)]">
                    Final report submitted.
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>

        <footer className="text-[11px] text-[var(--rex-text-dim)] font-mono">
          ForensicAgent v1 · RexIntel attribution graph + intel corpus + victim
          trace · Gemini 2.5 Pro · Public read-only ·{" "}
          <Link href="/forensic" className="text-[var(--rex-accent)] underline">
            Run another investigation
          </Link>
        </footer>
      </main>
    </PublicShell>
  );
}
