import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { ForensicSubmitForm } from "./investigate-form";

export const metadata: Metadata = {
  title: "ForensicAgent — Autonomous AI Incident Response · RexIntel",
  description:
    "Paste a wallet, an incident URL, or a question. RexIntel ForensicAgent investigates the target against the public attribution graph + intel corpus + on-chain trace runner, and ships an auditable report with cited evidence.",
};

export default function ForensicLandingPage() {
  return (
    <PublicShell
      classification={[
        { text: "● Public · Read-only · No fees" },
        { text: "ForensicAgent v1", show: "sm" },
        { text: "Gemini 2.5 Pro · Function calling", show: "md" },
      ]}
    >
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
            ● RexIntel ForensicAgent
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--rex-text)]">
            Autonomous AI incident response, grounded in evidence.
          </h1>
          <p className="text-sm text-[var(--rex-text-muted)] max-w-2xl leading-relaxed">
            Paste a wallet, an incident URL, or a free-text question. The agent
            investigates using RexIntel&apos;s attribution graph, intel corpus,
            and the public on-chain trace runner — and ships a structured
            report with every claim cited. The full chain of tool calls is
            rendered publicly so the verdict is auditable end-to-end.
          </p>
        </header>

        <section className="rex-card p-4 sm:p-5 space-y-4">
          <ForensicSubmitForm />
        </section>

        <section className="rex-card p-4 sm:p-5 text-[12px] text-[var(--rex-text-muted)] space-y-3 leading-relaxed">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
            How v1 works
          </div>
          <ul className="list-disc ml-5 space-y-1">
            <li>
              <span className="text-[var(--rex-text)]">5 tools.</span>{" "}
              <code className="font-mono">lookup_address</code>,{" "}
              <code className="font-mono">search_intel</code>,{" "}
              <code className="font-mono">fetch_neighborhood</code>,{" "}
              <code className="font-mono">trace_outbound</code>,{" "}
              <code className="font-mono">cite_external</code>. The agent
              picks which to call, in what order, and reads the results before
              the next call.
            </li>
            <li>
              <span className="text-[var(--rex-text)]">Audit trail.</span>{" "}
              Every tool call + result + latency is persisted to the case
              record. The case page renders the transcript publicly so judges
              and analysts can review the agent&apos;s reasoning.
            </li>
            <li>
              <span className="text-[var(--rex-text)]">Cited claims only.</span>{" "}
              The agent is instructed to refuse uncited assertions. Every line
              in the final report points back to a RexIntel record or an
              external URL the agent declared up front.
            </li>
            <li>
              <span className="text-[var(--rex-text)]">Iteration cap.</span>{" "}
              The agent runs at most 12 tool turns per case. Investigations
              that need more depth get an inconclusive verdict and a
              human-handoff note rather than a confabulation.
            </li>
            <li>
              <span className="text-[var(--rex-text)]">Ethereum mainnet only.</span>{" "}
              v1 traces are EVM mainnet. L2s and non-EVM chains come next.
            </li>
          </ul>
        </section>
      </main>
    </PublicShell>
  );
}
