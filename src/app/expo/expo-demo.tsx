"use client";

import { Fragment, useState } from "react";
import { SUPPORTED_CHAINS } from "@/lib/chains";

type BriefResponse = {
  found: boolean;
  brief: string;
  context: {
    chain: string;
    address: string;
    label: string | null;
    category: string | null;
    ownerName: string | null;
    primarySource: string | null;
    confidence: number | null;
    balanceEstimateUsd: number | null;
    attributions: Array<{
      source: string;
      label: string | null;
      ownerName: string | null;
      confidence: number | null;
      sourceUrl: string | null;
    }>;
    incidents: Array<{
      publicId: string;
      headline: string;
      role: string;
    }>;
  };
  meta: { model: string; latencyMs: number };
};

type QueryResponse = {
  answer: string;
  citations: string[];
  meta: { model: string; latencyMs: number; contextSize: number };
};

// Example addresses we know exist in the graph — primed for the live stage
// demo so the speaker isn't typing 0x… by hand.
const EXAMPLES: Array<{
  chain: string;
  address: string;
  hint: string;
}> = [
  {
    chain: "ethereum",
    address: "0x8589427373D6D84E98730D7795D8f6f8731FDA16",
    hint: "Tornado Cash router · OFAC SDN",
  },
  {
    chain: "bitcoin",
    address: "1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF",
    hint: "Mt. Gox cold wallet · lost",
  },
  {
    chain: "ethereum",
    address: "0x0000000000000000000000000000000000000000",
    hint: "Burn address · not in graph",
  },
];

const PROMPTS: string[] = [
  "What are the largest hacks RexIntel has indexed in the last 90 days?",
  "Show me incidents involving DPRK or Lazarus.",
  "Which mixers are currently tracked in the address graph?",
  "Are there any lost-key incidents over $100M?",
];

export function ExpoDemo({
  topSources,
  topCategories,
}: {
  topSources: Array<{ source: string; count: number }>;
  topCategories: Array<{ category: string; count: number }>;
}) {
  return (
    <section className="space-y-10">
      <BriefDemo />
      <QueryDemo />
      <SourcesBlock sources={topSources} categories={topCategories} />
    </section>
  );
}

function BriefDemo() {
  const [chain, setChain] = useState("ethereum");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BriefResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!address.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/expo/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain, address: address.trim() }),
      });
      const j = (await r.json()) as BriefResponse & { error?: string };
      if (!r.ok || j.error) throw new Error(j.error ?? "Failed");
      setResult(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rex-card p-5 sm:p-6 space-y-5">
      <div className="space-y-1">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
          Demo · Gemini investigator brief
        </div>
        <h2 className="font-display text-2xl font-semibold text-white">
          Paste an address. Get a brief.
        </h2>
        <p className="text-sm text-[var(--rex-text-muted)] max-w-2xl leading-relaxed">
          We look up every attribution on the address (sanctions, curated,
          incidents, community), pass it to Gemini 2.5 Flash with a
          source-citing system prompt, and stream back a case-file brief.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <select
          value={chain}
          onChange={(e) => setChain(e.target.value)}
          className="rex-input text-sm min-w-[140px]"
        >
          {SUPPORTED_CHAINS.filter((c) => c.slug !== "other").map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x… or bc1… or So1…"
          className="rex-input text-sm flex-1 font-mono"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !address.trim()}
          className="text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 rounded-sm border border-[var(--rex-accent)] text-[var(--rex-accent)] hover:bg-[rgba(95,185,31,0.08)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "Querying ▸" : "Run brief ▸"}
        </button>
      </form>

      <div className="flex flex-wrap gap-2 text-[10px]">
        <span className="font-mono uppercase tracking-widest text-[var(--rex-text-dim)] pt-1">
          Try:
        </span>
        {EXAMPLES.map((ex) => (
          <button
            key={`${ex.chain}:${ex.address}`}
            type="button"
            onClick={() => {
              setChain(ex.chain);
              setAddress(ex.address);
            }}
            className="font-mono px-2 py-1 rounded-sm border border-dashed border-[var(--rex-border-subtle)] text-[var(--rex-text-muted)] hover:text-white hover:border-[var(--rex-accent)] transition-colors"
            title={ex.address}
          >
            {ex.hint} ▸
          </button>
        ))}
      </div>

      {error ? (
        <div className="text-xs font-mono text-red-400 border border-red-400/40 bg-red-400/5 px-3 py-2 rounded-sm">
          {error}
        </div>
      ) : null}

      {result ? <BriefResult result={result} /> : null}
    </div>
  );
}

function BriefResult({ result }: { result: BriefResponse }) {
  const ctx = result.context;
  return (
    <div className="border-t border-[var(--rex-border-subtle)] pt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono uppercase tracking-widest">
        <span
          className="px-2 py-0.5 rounded-sm border"
          style={{
            color: result.found ? "var(--rex-accent)" : "var(--rex-text-dim)",
            borderColor: result.found
              ? "var(--rex-accent)"
              : "var(--rex-border-subtle)",
          }}
        >
          {result.found ? "● Found in graph" : "○ Not in graph"}
        </span>
        <span className="text-[var(--rex-text-dim)]">
          {result.meta.model} · {result.meta.latencyMs}ms
        </span>
      </div>

      <pre className="text-sm text-white whitespace-pre-wrap font-sans leading-relaxed">
        {result.brief}
      </pre>

      {result.found ? (
        <details className="text-xs text-[var(--rex-text-muted)] font-mono">
          <summary className="cursor-pointer text-[var(--rex-accent)] uppercase tracking-widest text-[10px]">
            Raw context passed to Gemini ▾
          </summary>
          <div className="mt-3 space-y-3 pl-2 border-l border-[var(--rex-border-subtle)]">
            <KvBlock
              rows={[
                ["chain", ctx.chain],
                ["address", ctx.address],
                ["label", ctx.label ?? "—"],
                ["category", ctx.category ?? "—"],
                ["owner", ctx.ownerName ?? "—"],
                ["primary source", ctx.primarySource ?? "—"],
                [
                  "confidence",
                  ctx.confidence != null ? String(ctx.confidence) : "—",
                ],
                [
                  "balance USD",
                  ctx.balanceEstimateUsd != null
                    ? `$${ctx.balanceEstimateUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : "—",
                ],
              ]}
            />
            {ctx.attributions.length ? (
              <div>
                <div className="text-[9px] uppercase tracking-widest text-[var(--rex-text-dim)] mb-1">
                  Attributions ({ctx.attributions.length})
                </div>
                <ul className="space-y-1">
                  {ctx.attributions.map((a, i) => (
                    <li key={i} className="text-[var(--rex-text-muted)]">
                      <span className="text-[var(--rex-accent)]">
                        [{a.source}]
                      </span>{" "}
                      {a.label ?? a.ownerName ?? "(no label)"}
                      {a.confidence != null ? ` · ${a.confidence}` : ""}
                      {a.sourceUrl ? (
                        <>
                          {" · "}
                          <a
                            href={a.sourceUrl}
                            className="underline decoration-dotted"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            src
                          </a>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {ctx.incidents.length ? (
              <div>
                <div className="text-[9px] uppercase tracking-widest text-[var(--rex-text-dim)] mb-1">
                  Linked incidents ({ctx.incidents.length})
                </div>
                <ul className="space-y-1">
                  {ctx.incidents.map((i) => (
                    <li key={i.publicId}>
                      <a
                        href={`/intel/${i.publicId}`}
                        className="text-[var(--rex-accent)] underline decoration-dotted"
                      >
                        [{i.publicId}]
                      </a>{" "}
                      <span className="text-white">{i.headline}</span>{" "}
                      <span className="text-[var(--rex-text-dim)]">
                        · role={i.role}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function KvBlock({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[var(--rex-text-muted)]">
      {rows.map(([k, v]) => (
        <Fragment key={k}>
          <dt className="text-[9px] uppercase tracking-widest text-[var(--rex-text-dim)]">
            {k}
          </dt>
          <dd className="break-all">{v}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function QueryDemo() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (question.trim().length < 4) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/expo/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      const j = (await r.json()) as QueryResponse & { error?: string };
      if (!r.ok || j.error) throw new Error(j.error ?? "Failed");
      setResult(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rex-card p-5 sm:p-6 space-y-5">
      <div className="space-y-1">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
          Demo · Natural-language Q&A
        </div>
        <h2 className="font-display text-2xl font-semibold text-white">
          Ask the corpus anything.
        </h2>
        <p className="text-sm text-[var(--rex-text-muted)] max-w-2xl leading-relaxed">
          Plain-English questions over the approved intel corpus. Gemini cites
          every claim by publicId. If a question isn't covered by the indexed
          corpus, it says so — no hallucinated answers.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Which mixer-related incidents has RexIntel covered in 2026?"
          rows={2}
          className="rex-input text-sm font-sans resize-none"
          disabled={loading}
        />
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
            Try:
          </span>
          {PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setQuestion(p)}
              className="text-[10px] font-mono px-2 py-1 rounded-sm border border-dashed border-[var(--rex-border-subtle)] text-[var(--rex-text-muted)] hover:text-white hover:border-[var(--rex-accent)] transition-colors"
            >
              {p}
            </button>
          ))}
          <button
            type="submit"
            disabled={loading || question.trim().length < 4}
            className="ml-auto text-[11px] font-mono uppercase tracking-widest px-4 py-2 rounded-sm border border-[var(--rex-accent)] text-[var(--rex-accent)] hover:bg-[rgba(95,185,31,0.08)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Thinking ▸" : "Ask ▸"}
          </button>
        </div>
      </form>

      {error ? (
        <div className="text-xs font-mono text-red-400 border border-red-400/40 bg-red-400/5 px-3 py-2 rounded-sm">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="border-t border-[var(--rex-border-subtle)] pt-5 space-y-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
            {result.meta.model} · {result.meta.latencyMs}ms · {result.meta.contextSize} snippets
          </div>
          <pre className="text-sm text-white whitespace-pre-wrap font-sans leading-relaxed">
            {result.answer}
          </pre>
          {result.citations.length ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
                Citations:
              </span>
              {result.citations.map((id) => (
                <a
                  key={id}
                  href={`/intel/${id}`}
                  className="text-[10px] font-mono px-2 py-0.5 rounded-sm border border-[var(--rex-accent)] text-[var(--rex-accent)] hover:bg-[rgba(95,185,31,0.08)]"
                >
                  {id} ▸
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SourcesBlock({
  sources,
  categories,
}: {
  sources: Array<{ source: string; count: number }>;
  categories: Array<{ category: string; count: number }>;
}) {
  return (
    <div className="rex-card p-5 sm:p-6 space-y-5">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
          Under the hood
        </div>
        <h2 className="font-display text-2xl font-semibold text-white mt-1">
          The graph Gemini reads from.
        </h2>
      </div>
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] mb-2">
            Attribution sources
          </div>
          <ul className="space-y-1.5 text-sm font-mono">
            {sources.map((s) => (
              <li
                key={s.source}
                className="flex items-baseline gap-3 text-[var(--rex-text-muted)]"
              >
                <span className="text-[var(--rex-accent)] w-12 shrink-0 text-right">
                  {s.count.toLocaleString()}
                </span>
                <span className="text-white">{s.source}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] mb-2">
            Address categories
          </div>
          <ul className="space-y-1.5 text-sm font-mono">
            {categories.map((c) => (
              <li
                key={c.category}
                className="flex items-baseline gap-3 text-[var(--rex-text-muted)]"
              >
                <span className="text-[var(--rex-accent)] w-12 shrink-0 text-right">
                  {c.count.toLocaleString()}
                </span>
                <span className="text-white">{c.category}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-[var(--rex-border-subtle)] pt-3 text-[11px] font-mono text-[var(--rex-text-dim)] leading-relaxed">
        Cross-reference the full graph at{" "}
        <a className="text-[var(--rex-accent)] underline decoration-dotted" href="/graph">
          /graph
        </a>{" "}
        · run a live victim-flow trace at{" "}
        <a className="text-[var(--rex-accent)] underline decoration-dotted" href="/trace">
          /trace
        </a>{" "}
        · browse the intel corpus at{" "}
        <a className="text-[var(--rex-accent)] underline decoration-dotted" href="/intel">
          /intel
        </a>
        .
      </div>
    </div>
  );
}
