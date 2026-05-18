import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { SUPPORTED_CHAINS } from "@/lib/chains";
import {
  fetchGraphData,
  fetchLostCryptoStats,
  fetchValueStats,
  type GraphFilters,
  type LostCryptoStats,
  type ValueStats,
} from "@/lib/graph-data";
import { GraphCanvas } from "./graph-canvas";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Address Graph · RexIntel",
  description:
    "Public graph of incident-tagged crypto intel and the addresses they reference. Co-occurrence edges surface clusters across separate investigations.",
};

const WINDOW_CHOICES = [
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
  { value: "365", label: "1y" },
  { value: "all", label: "All" },
] as const;

const KIND_CHOICES = [
  { value: "incident", label: "Incidents" },
  { value: "all", label: "Incidents + originals" },
] as const;

const VIEW_CHOICES = [
  { value: "incidents", label: "Incidents" },
  { value: "institutional", label: "Institutional" },
  { value: "combined", label: "Combined" },
] as const;

const CATEGORY_CHOICES = [
  { value: "", label: "Any" },
  { value: "sanctioned", label: "Sanctioned" },
  { value: "exchange", label: "Exchange" },
  { value: "mixer", label: "Mixer" },
  { value: "bridge", label: "Bridge" },
  { value: "foundation", label: "Foundation" },
  { value: "treasury", label: "DAO Treasury" },
  { value: "personality", label: "Personality" },
  { value: "market-maker", label: "Market Maker" },
  { value: "hack-source", label: "Hack Source" },
  { value: "hack-destination", label: "Hack Destination" },
  { value: "government-seized", label: "Govt. Seized" },
  { value: "lost", label: "Lost" },
  { value: "dormant", label: "Dormant" },
  { value: "validator", label: "Validator" },
  { value: "defi-protocol", label: "DeFi Protocol" },
  { value: "scam", label: "Scam" },
  { value: "mev-bot", label: "MEV Bot" },
] as const;

export default async function GraphPage({
  searchParams,
}: {
  searchParams: {
    window?: string;
    kind?: string;
    chain?: string;
    view?: string;
    category?: string;
    user_reported?: string;
  };
}) {
  const filters: GraphFilters = {
    window: searchParams.window ?? "90",
    kind: searchParams.kind ?? "incident",
    chain: searchParams.chain ?? null,
    view: searchParams.view ?? "incidents",
    category: searchParams.category ?? null,
    includeUserReported: searchParams.user_reported === "1",
  };
  const [data, lostStats, valueStats] = await Promise.all([
    fetchGraphData(filters),
    fetchLostCryptoStats(5),
    fetchValueStats(),
  ]);

  return (
    <PublicShell
      classification={[
        { text: "● Open Graph" },
        { text: "Crypto Intelligence", show: "sm" },
        { text: "Address Network", show: "md" },
      ]}
    >
      <main className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12 py-8 space-y-6">
        <header className="space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
            Public · Read-only · No fees
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-white">
            Address Graph
          </h1>
          <p className="text-sm text-[var(--rex-text-muted)] max-w-2xl leading-relaxed">
            Every incident-tagged intel piece, plus the addresses it names.
            Toggle <strong className="text-white">Institutional</strong> to
            overlay sanctioned wallets (OFAC, OFSI, EU), exchanges,
            foundations, mixers, bridges, market-makers, and famous
            lost/dormant coins. Co-occurrence edges show clusters. Click
            any node to open the source.
          </p>
        </header>

        <ValueCounterBlock stats={valueStats} />

        {lostStats.walletCount > 0 ? (
          <LostCryptoStatBlock stats={lostStats} />
        ) : null}

        <FilterBar
          window={filters.window ?? "90"}
          kind={filters.kind ?? "incident"}
          chain={filters.chain ?? ""}
          view={filters.view ?? "incidents"}
          category={filters.category ?? ""}
          includeUserReported={filters.includeUserReported === true}
        />

        <GraphCanvas data={data} />

        <div className="border-t border-[var(--rex-border-subtle)] pt-4 text-[11px] text-[var(--rex-text-dim)] font-mono leading-relaxed">
          Generated {new Date(data.meta.generatedAt).toUTCString()} · Data is
          built from approved community intel. See something missing?{" "}
          <a
            href="/submit"
            className="text-[var(--rex-accent)] underline decoration-dotted underline-offset-2 hover:text-white transition-colors"
          >
            Drop it on the wire ▸
          </a>
        </div>
      </main>
    </PublicShell>
  );
}

function FilterBar({
  window: windowValue,
  kind,
  chain,
  view,
  category,
  includeUserReported,
}: {
  window: string;
  kind: string;
  chain: string;
  view: string;
  category: string;
  includeUserReported: boolean;
}) {
  return (
    <form
      method="get"
      className="rex-card p-3 sm:p-4 flex flex-wrap items-end gap-3"
    >
      <FilterGroup label="View">
        <div className="flex gap-1">
          {VIEW_CHOICES.map((c) => (
            <RadioPill
              key={c.value}
              name="view"
              value={c.value}
              label={c.label}
              active={view === c.value}
            />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="Window">
        <div className="flex gap-1">
          {WINDOW_CHOICES.map((c) => (
            <RadioPill
              key={c.value}
              name="window"
              value={c.value}
              label={c.label}
              active={windowValue === c.value}
            />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="Kind">
        <div className="flex gap-1">
          {KIND_CHOICES.map((c) => (
            <RadioPill
              key={c.value}
              name="kind"
              value={c.value}
              label={c.label}
              active={kind === c.value}
            />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="Chain">
        <select
          name="chain"
          defaultValue={chain}
          className="rex-input text-xs min-w-[140px]"
        >
          <option value="">All chains</option>
          {SUPPORTED_CHAINS.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>
      </FilterGroup>

      <FilterGroup label="Category">
        <select
          name="category"
          defaultValue={category}
          className="rex-input text-xs min-w-[140px]"
        >
          {CATEGORY_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </FilterGroup>

      <FilterGroup label="Sources">
        <label
          className="flex items-center gap-2 cursor-pointer text-[11px]"
          style={{ color: "var(--rex-text-muted)" }}
          title="User-reported losses are firsthand victim claims, not verified by sanctions lists or curators. Off by default."
        >
          <input
            type="checkbox"
            name="user_reported"
            value="1"
            defaultChecked={includeUserReported}
            className="accent-[var(--rex-accent)]"
          />
          Include user-reported
        </label>
      </FilterGroup>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="submit"
          className="text-[10px] font-mono uppercase tracking-widest px-3 py-2 rounded-sm border border-[var(--rex-accent)] text-[var(--rex-accent)] hover:bg-[rgba(95,185,31,0.08)] transition-colors"
        >
          Apply ▸
        </button>
        <a
          href="/graph"
          className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] hover:text-white transition-colors"
        >
          Reset
        </a>
      </div>
    </form>
  );
}

const CATEGORY_LABEL: Record<string, string> = {
  lost: "Lost",
  "government-seized": "Gov-seized",
  sanctioned: "Sanctioned",
  "hack-source": "Hack source",
  "hack-destination": "Hack dest.",
  dormant: "Dormant",
  exchange: "Exchange",
  mixer: "Mixer",
  bridge: "Bridge",
  treasury: "Treasury",
  foundation: "Foundation",
  "defi-protocol": "DeFi",
  personality: "Personality",
  "market-maker": "Market maker",
  validator: "Validator",
  scam: "Scam",
  "mev-bot": "MEV bot",
  other: "Other",
};

function ValueCounterBlock({ stats }: { stats: ValueStats }) {
  // Highlight the top 4 categories with non-zero USD; collapse the rest into
  // "Other" so the header stays readable as the seed expands.
  const top = stats.byCategory.slice(0, 4);
  const restUsd = stats.byCategory
    .slice(4)
    .reduce((a, b) => a + b.totalUsd, 0);
  const restCount = stats.byCategory
    .slice(4)
    .reduce((a, b) => a + b.walletCount, 0);

  return (
    <section className="rex-card p-4 sm:p-5 bg-[rgba(95,185,31,0.04)] border-[var(--rex-accent)]/40">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
            ● Total value tracked on-chain
          </div>
          <div className="font-display text-3xl sm:text-4xl font-semibold text-white mt-1 tracking-tight">
            {formatUsdShort(stats.totalUsd)}
          </div>
          <div className="text-xs text-[var(--rex-text-muted)] mt-1 max-w-xl">
            Aggregate USD value at {stats.walletCount} priced address
            {stats.walletCount === 1 ? "" : "es"} (of {stats.addressCount}{" "}
            tracked total). Sums lost, government-seized, and other priced
            categories at last-snapshot prices — see the per-category and
            per-token breakdowns below.
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-2 shrink-0">
          {top.map((b) => (
            <div
              key={b.category}
              className="border-l border-[var(--rex-border-subtle)] pl-3"
            >
              <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
                {CATEGORY_LABEL[b.category] ?? b.category}
              </div>
              <div className="text-sm font-mono text-white">
                {formatUsdShort(b.totalUsd)}
              </div>
              <div className="text-[10px] font-mono text-[var(--rex-text-dim)]">
                {b.walletCount} addr
              </div>
            </div>
          ))}
          {restUsd > 0 ? (
            <div className="border-l border-[var(--rex-border-subtle)] pl-3">
              <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
                Other
              </div>
              <div className="text-sm font-mono text-white">
                {formatUsdShort(restUsd)}
              </div>
              <div className="text-[10px] font-mono text-[var(--rex-text-dim)]">
                {restCount} addr
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {stats.byToken.length > 0 ? (
        <div className="border-t border-[var(--rex-border-subtle)] mt-4 pt-3">
          <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] mb-2">
            By token — native amounts in priced addresses
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-2">
            {stats.byToken.slice(0, 6).map((t) => (
              <div
                key={t.symbol}
                className="border-l border-[var(--rex-border-subtle)] pl-3"
              >
                <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
                  {t.symbol}
                </div>
                <div className="text-sm font-mono text-white">
                  {formatTokenAmount(t.totalAmount)}
                </div>
                <div className="text-[10px] font-mono text-[var(--rex-text-dim)]">
                  {formatUsdShort(t.totalUsd)} · {t.walletCount} addr
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function formatTokenAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toFixed(4);
}

function LostCryptoStatBlock({ stats }: { stats: LostCryptoStats }) {
  return (
    <section className="rex-card p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
            ◯ Reported lost crypto
          </div>
          <div className="font-display text-2xl sm:text-3xl font-semibold text-white mt-1">
            {formatUsdShort(stats.totalUsd)}{" "}
            <span className="text-sm font-mono font-normal text-[var(--rex-text-muted)]">
              across {stats.walletCount} wallet
              {stats.walletCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="text-xs text-[var(--rex-text-muted)] mt-1 max-w-xl">
            Famous lost-key, frozen-contract, and dead-custodian cases tracked
            in the address graph. Sum of last-snapshot USD balances; native
            amounts in each case body. Excludes lost-by-architecture cases
            without published addresses (Howells HDD, Stefan Thomas IronKey).
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          {stats.byChain.slice(0, 3).map((c) => (
            <div
              key={c.chain}
              className="text-right border-l border-[var(--rex-border-subtle)] pl-3"
            >
              <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
                {c.chain}
              </div>
              <div className="text-sm font-mono text-white">
                {formatUsdShort(c.totalUsd)}
              </div>
              <div className="text-[10px] font-mono text-[var(--rex-text-dim)]">
                {c.walletCount} wallet{c.walletCount === 1 ? "" : "s"}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-[var(--rex-border-subtle)] pt-3">
        <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] mb-2">
          Top {stats.top.length} by USD value
        </div>
        <ul className="space-y-1.5">
          {stats.top.map((w) => (
            <li
              key={`${w.chain}:${w.address}`}
              className="flex items-baseline gap-3 text-xs"
            >
              <span className="font-mono text-[var(--rex-accent)] w-20 shrink-0 text-right">
                {formatUsdShort(w.balanceEstimateUsd)}
              </span>
              <span className="text-white truncate">
                {w.label ??
                  w.ownerName ??
                  `${w.chain}:${w.address.slice(0, 12)}…`}
              </span>
            </li>
          ))}
        </ul>
        <a
          href="/graph?view=institutional&category=lost"
          className="inline-block mt-3 text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)] hover:text-white transition-colors"
        >
          Open lost-coin overlay ▸
        </a>
      </div>
    </section>
  );
}

function formatUsdShort(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
        {label}
      </span>
      {children}
    </div>
  );
}

function RadioPill({
  name,
  value,
  label,
  active,
}: {
  name: string;
  value: string;
  label: string;
  active: boolean;
}) {
  return (
    <label
      className={`cursor-pointer text-[10px] font-mono uppercase tracking-widest px-2.5 py-1.5 rounded-sm border transition-colors ${
        active
          ? "border-[var(--rex-accent)] bg-[rgba(95,185,31,0.08)] text-white"
          : "border-[var(--rex-border-subtle)] text-[var(--rex-text-dim)] hover:border-[var(--rex-border)]"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={active}
        className="sr-only"
      />
      {label}
    </label>
  );
}
