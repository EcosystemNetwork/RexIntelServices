import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { fetchValueStats } from "@/lib/graph-data";
import { getGraphSummary } from "@/lib/expo-context";
import { ExpoDemo } from "./expo-demo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI & Big Data Expo NA · RexIntel",
  description:
    "RexIntel submission for the AI & Big Data Expo North America hackathon — Track 4 (Data & Intelligence). Live Gemini-powered investigator briefs and natural-language Q&A over a multi-source crypto address attribution graph.",
};

export default async function ExpoPage() {
  const [valueStats, summary] = await Promise.all([
    fetchValueStats({ includeUserReported: false }),
    getGraphSummary(),
  ]);

  return (
    <PublicShell
      classification={[
        { text: "● AI & Big Data Expo NA · 2026" },
        { text: "Track 4 · Data & Intelligence", show: "sm" },
        { text: "Powered by Gemini 2.5", show: "md" },
      ]}
    >
      <main className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12 py-10 space-y-10">
        <header className="space-y-3 max-w-3xl">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
            Hackathon submission · Live demo
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-white">
            Crypto investigations for the AI era.
          </h1>
          <p className="text-base text-[var(--rex-text-muted)] leading-relaxed">
            RexIntel turns multi-source crypto data — OFAC, OFSI, EU sanctions,
            L2Beat, curated industry labels, victim traces, community reports
            — into one address attribution graph. Gemini reads the graph and
            writes the brief.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Chip label={`${summary.totalAddresses.toLocaleString()} addresses`} />
            <Chip label={`${summary.totalIncidents.toLocaleString()} intel pieces`} />
            <Chip label={`$${shortUsd(valueStats.totalUsd)} priced on-chain`} />
            <Chip label={`${summary.topSources.length} attribution sources`} />
          </div>
        </header>

        <ExpoDemo
          topSources={summary.topSources}
          topCategories={summary.topCategories}
        />

        <section className="rex-card p-5 sm:p-6 space-y-4">
          <h2 className="font-display text-xl font-semibold text-white">
            What we built for the expo
          </h2>
          <div className="grid md:grid-cols-2 gap-4 text-sm text-[var(--rex-text-muted)] leading-relaxed">
            <BuildItem
              title="Gemini-powered investigator brief"
              body="Paste a wallet on any of 20 chains. We pull every attribution we have (sanctions list, curated label, incident link, community report) and Gemini 2.5 Flash writes the case-file brief — verdict, attribution, linked incidents, next steps."
            />
            <BuildItem
              title="Natural-language Q&A over the corpus"
              body="Ask in plain English. The corpus is approved intel + graph stats. Gemini cites every claim with a publicId — if the question isn't covered, it says so instead of hallucinating."
            />
            <BuildItem
              title="Industry vs. industry+community toggle"
              body="The moat. Compare what every other free service can show you (sanctions + curated only) against what community trace contributions add. Same graph, two trust modes."
            />
            <BuildItem
              title="Source provenance, not vibes"
              body="Every address node carries a primary_source enum (ofac · ofsi · eu-sanctions · l2beat · rexintel-curated · etherscan · victim-trace · community-loss-report · bounty-claim). Briefs cite the source, not the assertion."
            />
          </div>
        </section>

        <section className="rex-card p-5 sm:p-6 space-y-3">
          <h2 className="font-display text-xl font-semibold text-white">
            Why this fits Track 4
          </h2>
          <ul className="space-y-2 text-sm text-[var(--rex-text-muted)] leading-relaxed list-disc pl-5">
            <li>
              <strong className="text-white">RAG over multi-source data:</strong>{" "}
              Five public + two community attribution sources unified into one
              graph; Gemini does retrieval-augmented synthesis at query time.
            </li>
            <li>
              <strong className="text-white">AI-powered data pipelines:</strong>{" "}
              Cron harvesters (OFAC SDN, OFSI consolidated list, EU sanctions,
              L2Beat bridges/exchanges) re-ingest and dedupe nightly.
            </li>
            <li>
              <strong className="text-white">Analytics agent for NL querying:</strong>{" "}
              Plain-English questions against the indexed intel corpus with
              forced citations.
            </li>
            <li>
              <strong className="text-white">Anomaly detection:</strong> The{" "}
              <a className="text-[var(--rex-accent)] underline decoration-dotted" href="/trace">
                /trace
              </a>{" "}
              tool runs an outbound 3-hop BFS from a victim address, terminating at
              sanctioned/mixer/bridge/exchange categories and writing the trail
              back into the graph as community-class attributions.
            </li>
            <li>
              <strong className="text-white">Knowledge graph extraction:</strong>{" "}
              Address ↔ incident edges, owner-cluster edges, and co-occurrence
              edges all derived from approved community intel.
            </li>
          </ul>
        </section>

        <footer className="border-t border-[var(--rex-border-subtle)] pt-5 text-[11px] text-[var(--rex-text-dim)] font-mono leading-relaxed">
          Hackathon repo: production deployment.
          Models: <span className="text-white">gemini-2.5-flash</span> for live
          synthesis, <span className="text-white">gemini-2.5-pro</span>{" "}
          available for deeper analysis paths. API keys: free Google AI Studio
          tier — no billing required.
        </footer>
      </main>
    </PublicShell>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-sm border border-[var(--rex-border-subtle)] text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-muted)]">
      {label}
    </span>
  );
}

function BuildItem({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-l-2 border-[var(--rex-accent)] pl-3">
      <div className="text-[11px] font-mono uppercase tracking-widest text-[var(--rex-accent)] mb-1">
        {title}
      </div>
      <p>{body}</p>
    </div>
  );
}

function shortUsd(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n.toFixed(0)}`;
}
