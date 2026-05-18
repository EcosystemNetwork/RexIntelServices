import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { TraceSubmitForm } from "./trace-form";

export const metadata: Metadata = {
  title: "Trace a Hacked Wallet · RexIntel",
  description:
    "Paste a drained wallet address. RexIntel walks the outbound flow on-chain, terminates at known exchanges/mixers/sanctioned addresses, and writes the result into the public attribution graph so every later trace gets stronger.",
};

export default function TraceLandingPage() {
  return (
    <PublicShell
      classification={[
        { text: "● Public · Read-only · No fees" },
        { text: "Victim Trace v1", show: "sm" },
        { text: "Ethereum Mainnet", show: "md" },
      ]}
    >
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
            ● Victim trace
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--rex-text)]">
            Where did the funds go?
          </h1>
          <p className="text-sm text-[var(--rex-text-muted)] max-w-2xl leading-relaxed">
            Paste a drained wallet. We walk the outbound flow on Ethereum
            mainnet — direct, internal, and ERC-20 transfers — terminating
            at known exchanges, mixers, bridges, sanctioned addresses, or
            after three hops. Every trace is stored in the public attribution
            graph (community-class layer) so the next person tracing a
            connected wallet starts with a stronger map.
          </p>
        </header>

        <section className="rex-card p-4 sm:p-5 space-y-4">
          <TraceSubmitForm />
        </section>

        <section className="rex-card p-4 sm:p-5 text-[12px] text-[var(--rex-text-muted)] space-y-2 leading-relaxed">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
            What v1 does and doesn&apos;t do
          </div>
          <ul className="list-disc ml-5 space-y-1">
            <li>Ethereum mainnet only. L2s and non-EVM chains come next.</li>
            <li>
              Up to 3 hops outbound. Terminal at known exchanges, mixers,
              bridges, sanctioned wallets, government seizures, or scams.
            </li>
            <li>
              ETH + ERC-20 transfers. No NFT trail, no mixer demixing, no
              cross-chain bridging in v1.
            </li>
            <li>
              Sub-threshold &quot;dust&quot; sends are skipped — drainer test
              pings don&apos;t pollute the trace.
            </li>
            <li>
              Result pages are public and shareable. Every counterparty
              becomes a node in the moat layer (toggle-controlled on the
              /graph view).
            </li>
          </ul>
        </section>
      </main>
    </PublicShell>
  );
}
