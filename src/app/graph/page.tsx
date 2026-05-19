import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { SUPPORTED_CHAINS } from "@/lib/chains";
import {
  fetchGraphData,
  fetchHackedCryptoStats,
  fetchHackingCrews,
  fetchLostCryptoStats,
  fetchValueStats,
  type GraphFilters,
  type HackedCryptoStats,
  type HackingCrew,
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

const SEVERITY_CHOICES = [
  { value: "", label: "Any" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

const SOURCE_CHOICES = [
  { value: "", label: "Any" },
  { value: "ofac", label: "OFAC" },
  { value: "ofsi", label: "OFSI" },
  { value: "eu-sanctions", label: "EU sanctions" },
  { value: "rexintel-curated", label: "RexIntel curated" },
  { value: "rexintel-community", label: "RexIntel community" },
  { value: "defillama", label: "DefiLlama" },
  { value: "etherscan", label: "Etherscan" },
  { value: "incident", label: "Incident-derived" },
  { value: "community-loss-report", label: "Community loss report" },
  { value: "victim-trace", label: "Victim trace" },
  { value: "bounty-claim", label: "Bounty claim" },
] as const;

const OWNER_KIND_CHOICES = [
  { value: "", label: "Any" },
  { value: "exchange", label: "Exchange" },
  { value: "dao", label: "DAO" },
  { value: "foundation", label: "Foundation" },
  { value: "government", label: "Government" },
  { value: "individual", label: "Individual" },
  { value: "protocol", label: "Protocol" },
  { value: "market-maker", label: "Market maker" },
  { value: "criminal-group", label: "Criminal group" },
  { value: "estate", label: "Bankruptcy estate" },
  { value: "unknown", label: "Unknown" },
] as const;

const CONFIDENCE_CHOICES = [
  { value: "0", label: "Any" },
  { value: "50", label: "≥ 50" },
  { value: "70", label: "≥ 70" },
  { value: "90", label: "≥ 90" },
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
    severity?: string;
    source?: string;
    owner_kind?: string;
    min_confidence?: string;
    crew?: string;
  };
}) {
  const filters: GraphFilters = {
    window: searchParams.window ?? "all",
    kind: searchParams.kind ?? "all",
    chain: searchParams.chain ?? null,
    view: searchParams.view ?? "combined",
    category: searchParams.category ?? null,
    includeUserReported: searchParams.user_reported === "1",
    severity: searchParams.severity ?? null,
    source: searchParams.source ?? null,
    ownerKind: searchParams.owner_kind ?? null,
    minConfidence: searchParams.min_confidence
      ? Number(searchParams.min_confidence)
      : null,
    crew: searchParams.crew ?? null,
  };
  const includeUserReported = filters.includeUserReported === true;
  const [data, lostStats, valueStats, hackedStats, crews] = await Promise.all([
    fetchGraphData(filters),
    fetchLostCryptoStats(5, { includeUserReported }),
    fetchValueStats({ includeUserReported }),
    fetchHackedCryptoStats(),
    fetchHackingCrews(),
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
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--rex-text)]">
            Address Graph
          </h1>
          <p className="text-sm text-[var(--rex-text-muted)] max-w-2xl leading-relaxed">
            Every approved investigation and incident, plus the on-chain
            addresses each names. Toggle{" "}
            <strong className="text-[var(--rex-text)]">Institutional</strong>{" "}
            to overlay sanctioned wallets (OFAC, OFSI, EU), exchanges,
            foundations, mixers, bridges, market-makers, and famous
            lost/dormant coins. Co-occurrence edges show clusters. Click
            any node to open the source.
          </p>
        </header>

        <SourceModeBanner
          includeUserReported={includeUserReported}
          searchParams={searchParams}
        />

        <HackedCryptoBlock stats={hackedStats} />

        <ValueCounterBlock stats={valueStats} />

        {lostStats.walletCount > 0 ? (
          <LostCryptoStatBlock stats={lostStats} />
        ) : null}

        <QuickFilterChips searchParams={searchParams} />

        <FilterBar
          window={filters.window ?? "all"}
          kind={filters.kind ?? "all"}
          chain={filters.chain ?? ""}
          view={filters.view ?? "combined"}
          category={filters.category ?? ""}
          severity={filters.severity ?? ""}
          source={filters.source ?? ""}
          ownerKind={filters.ownerKind ?? ""}
          minConfidence={String(filters.minConfidence ?? 0)}
          includeUserReported={filters.includeUserReported === true}
          crew={filters.crew ?? ""}
          crewChoices={crews}
        />

        <GraphCanvas data={data} />

        <div className="border-t border-[var(--rex-border-subtle)] pt-4 text-[11px] text-[var(--rex-text-dim)] font-mono leading-relaxed">
          Generated {new Date(data.meta.generatedAt).toUTCString()} · Data is
          built from approved community intel. See something missing?{" "}
          <a
            href="/submit"
            className="text-[var(--rex-accent)] underline decoration-dotted underline-offset-2 hover:text-[var(--rex-text)] transition-colors"
          >
            Drop it on the wire ▸
          </a>
        </div>
      </main>
    </PublicShell>
  );
}

function SourceModeBanner({
  includeUserReported,
  searchParams,
}: {
  includeUserReported: boolean;
  searchParams: Record<string, string | undefined>;
}) {
  // Build the toggle-target URL by mirroring the rest of the search params and
  // flipping just user_reported. Preserves window/kind/chain/view/category so
  // a deep-linked view stays where the user left it after toggling.
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (!v) continue;
    if (k === "user_reported") continue;
    next.set(k, v);
  }
  if (!includeUserReported) next.set("user_reported", "1");
  const toggleHref = `/graph${next.toString() ? `?${next}` : ""}`;

  return (
    <div
      className="rex-card px-4 py-2.5 flex flex-wrap items-center gap-3 text-[11px] font-mono"
      style={{
        background: includeUserReported
          ? "rgba(95,185,31,0.05)"
          : "rgba(255,255,255,0.02)",
        borderColor: includeUserReported
          ? "rgba(95,185,31,0.35)"
          : "var(--rex-border-subtle)",
      }}
    >
      <span
        className="uppercase tracking-widest"
        style={{
          color: includeUserReported
            ? "var(--rex-accent)"
            : "var(--rex-text-dim)",
        }}
      >
        {includeUserReported ? "● Industry + community" : "○ Industry only"}
      </span>
      <span
        className="text-[10px]"
        style={{ color: "var(--rex-text-dim)" }}
      >
        {includeUserReported
          ? "Sanctions lists + curated + incidents + RexIntel community-reported losses."
          : "Sanctions lists + curated + incidents. No community-reported data."}
      </span>
      <a
        href={toggleHref}
        className="ml-auto px-2.5 py-1 rounded-sm border text-[10px] uppercase tracking-widest transition-colors"
        style={{
          color: "var(--rex-accent)",
          borderColor: "var(--rex-accent)",
        }}
      >
        {includeUserReported ? "Industry only ▸" : "+ Community ▸"}
      </a>
    </div>
  );
}

function FilterBar({
  window: windowValue,
  kind,
  chain,
  view,
  category,
  severity,
  source,
  ownerKind,
  minConfidence,
  includeUserReported,
  crew,
  crewChoices,
}: {
  window: string;
  kind: string;
  chain: string;
  view: string;
  category: string;
  severity: string;
  source: string;
  ownerKind: string;
  minConfidence: string;
  includeUserReported: boolean;
  crew: string;
  crewChoices: HackingCrew[];
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

      <FilterGroup label="Severity">
        <select
          name="severity"
          defaultValue={severity}
          className="rex-input text-xs min-w-[120px]"
        >
          {SEVERITY_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </FilterGroup>

      <FilterGroup label="Attribution">
        <select
          name="source"
          defaultValue={source}
          className="rex-input text-xs min-w-[160px]"
          title="Filter address nodes by their primary attribution source — OFAC, OFSI, EU sanctions, curated, etc."
        >
          {SOURCE_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </FilterGroup>

      <FilterGroup label="Owner kind">
        <select
          name="owner_kind"
          defaultValue={ownerKind}
          className="rex-input text-xs min-w-[140px]"
          title="Filter by what kind of entity owns the address — exchange, government, individual, etc."
        >
          {OWNER_KIND_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </FilterGroup>

      <FilterGroup label="Hacking crew">
        <select
          name="crew"
          defaultValue={crew}
          className="rex-input text-xs min-w-[180px]"
          title="Narrow the graph to addresses attributed to a specific hacking crew (Lazarus, Conti, etc.)."
        >
          <option value="">Any crew</option>
          {crewChoices.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name} ({c.addressCount})
            </option>
          ))}
        </select>
      </FilterGroup>

      <FilterGroup label="Min confidence">
        <div className="flex gap-1">
          {CONFIDENCE_CHOICES.map((c) => (
            <RadioPill
              key={c.value}
              name="min_confidence"
              value={c.value}
              label={c.label}
              active={minConfidence === c.value}
            />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="Sources">
        <label
          className="flex items-center gap-2 cursor-pointer text-[11px]"
          style={{ color: "var(--rex-text-muted)" }}
          title="Off: only authoritative industry sources (OFAC, OFSI, EU sanctions, DefiLlama, RexIntel curated, incident-derived). On: also include community-reported losses from victims and curated witnesses — the RexIntel moat. Compare the totals with this on vs off."
        >
          <input
            type="checkbox"
            name="user_reported"
            value="1"
            defaultChecked={includeUserReported}
            className="accent-[var(--rex-accent)]"
          />
          + Community sources
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
          className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] hover:text-[var(--rex-text)] transition-colors"
        >
          Reset
        </a>
      </div>
    </form>
  );
}

/**
 * One-click slice presets. Each chip rewrites the relevant filter
 * search-params and preserves the rest (window, source-mode toggle, etc.)
 * — so a user who has +community on or is in 90d window stays where they
 * were after picking a slice. Active-state highlights the chip whose
 * filter set fully matches the current URL.
 */
const QUICK_FILTERS: Array<{
  label: string;
  hint: string;
  // Partial-match against the current searchParams; missing keys are
  // treated as "default" (i.e. an unsetcategory matches "Any").
  params: Record<string, string>;
}> = [
  {
    label: "₿ Big BTC heists",
    hint: "Bitcoin-chain incidents + addresses",
    params: { chain: "bitcoin", view: "combined" },
  },
  {
    label: "🏛 Government-seized",
    hint: "DOJ / IRS / Bundeskriminalamt custody wallets",
    params: { category: "government-seized", view: "combined" },
  },
  {
    label: "⛔ OFAC sanctioned",
    hint: "US Treasury SDN-listed addresses",
    params: { source: "ofac", view: "combined" },
  },
  {
    label: "🇰🇵 DPRK / Lazarus",
    hint: "Every address attributed to Lazarus Group across crews",
    params: { crew: "Lazarus Group", view: "combined" },
  },
  {
    label: "🌀 Mixers",
    hint: "Tornado, Sinbad, Wasabi coordinators, Bitcoin Fog",
    params: { category: "mixer", view: "combined" },
  },
  {
    label: "💀 Lost coins",
    hint: "Mt. Gox, Howells HDD, IronKey, dormant Satoshi-era",
    params: { category: "lost", view: "combined" },
  },
  {
    label: "🏦 Exchange hacks",
    hint: "Bitfinex, KuCoin, Bybit, FTX-era hot-wallet drains",
    params: { category: "hack-source", view: "combined" },
  },
  {
    label: "🔥 Critical-severity",
    hint: "Only the highest-severity incidents",
    params: { severity: "critical", kind: "incident", view: "combined" },
  },
];

function QuickFilterChips({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  // A chip is active when every one of its params matches the current URL.
  // Build the per-chip target URL by merging the chip's params onto the
  // current ones (chip params override; everything else carries through).
  function buildHref(chipParams: Record<string, string>): string {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (!v) continue;
      // Don't carry over the same keys the chip is rewriting — chip wins.
      if (k in chipParams) continue;
      next.set(k, v);
    }
    for (const [k, v] of Object.entries(chipParams)) next.set(k, v);
    return `/graph${next.toString() ? `?${next}` : ""}`;
  }

  function isActive(chipParams: Record<string, string>): boolean {
    for (const [k, v] of Object.entries(chipParams)) {
      if (searchParams[k] !== v) return false;
    }
    return true;
  }

  return (
    <nav
      aria-label="Graph preset filters"
      className="flex flex-wrap items-center gap-1.5"
    >
      <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] mr-1">
        Slice:
      </span>
      {QUICK_FILTERS.map((chip) => {
        const active = isActive(chip.params);
        return (
          <a
            key={chip.label}
            href={buildHref(chip.params)}
            title={chip.hint}
            className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-sm border transition-colors"
            style={{
              borderColor: active
                ? "var(--rex-accent)"
                : "var(--rex-border-subtle)",
              background: active
                ? "rgba(95,185,31,0.10)"
                : "transparent",
              color: active
                ? "var(--rex-accent)"
                : "var(--rex-text-muted)",
            }}
          >
            {chip.label}
          </a>
        );
      })}
      <a
        href="/graph"
        className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] hover:text-[var(--rex-text)] transition-colors ml-1"
        title="Reset to default view"
      >
        Reset ↺
      </a>
    </nav>
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

function HackedCryptoBlock({ stats }: { stats: HackedCryptoStats }) {
  // Realised stolen-value across approved incident postmortems. Same source
  // and filter as the /intel headline counter — the two numbers must match.
  // Renders even at zero so the cross-page contract stays explicit; the
  // /intel surface hides at zero, but on /graph this is the orthogonal
  // counterpart to "current on-chain balance" below, so the framing is
  // worth keeping visible.
  if (stats.totalUsd <= 0 || stats.incidentCount === 0) return null;
  return (
    <section
      className="rex-card-flat px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2"
      style={{ borderColor: "rgba(248,113,113,0.30)" }}
    >
      <div>
        <div
          className="text-[10px] font-mono uppercase tracking-widest"
          style={{ color: "var(--rex-danger)" }}
        >
          ▸ Hacked crypto tracked (realised loss)
        </div>
        <div className="font-display text-2xl sm:text-3xl text-[var(--rex-text)] tabular-nums">
          {formatUsdShort(stats.totalUsd)}{" "}
          <span
            className="text-xs font-mono"
            style={{ color: "var(--rex-text-dim)" }}
          >
            across {stats.incidentCount.toLocaleString()} incident
            {stats.incidentCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <div className="flex-1 min-w-0 text-xs text-[var(--rex-text-muted)]">
        Sum of editorial <code className="font-mono">lossUsd</code> across
        every approved incident postmortem — the time-of-loss stolen-value
        footprint. Orthogonal to the on-chain balance counter below: a
        drained hack contributes here but $0 there; a seized custody wallet
        contributes there but $0 here.
      </div>
      <a
        href="/intel?kind=incident"
        className="text-[11px] font-mono uppercase tracking-widest"
        style={{ color: "var(--rex-danger)" }}
      >
        Open incidents ▸
      </a>
    </section>
  );
}

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
            ● Current on-chain balance at tracked addresses
          </div>
          <div className="font-display text-3xl sm:text-4xl font-semibold text-[var(--rex-text)] mt-1 tracking-tight">
            {formatUsdShort(stats.totalUsd)}
          </div>
          <div className="text-xs text-[var(--rex-text-muted)] mt-1 max-w-xl">
            Last-snapshot USD value sitting at {stats.walletCount} priced
            address{stats.walletCount === 1 ? "" : "es"} (of{" "}
            {stats.addressCount} tracked total) across{" "}
            <a
              href="/intel"
              className="text-[var(--rex-accent)] underline decoration-dotted underline-offset-2 hover:text-[var(--rex-text)] transition-colors"
            >
              {stats.stories.total.toLocaleString()} stor
              {stats.stories.total === 1 ? "y" : "ies"}
            </a>
            {stats.stories.incident + stats.stories.original > 0 ? (
              <>
                {" "}
                ({stats.stories.incident} incident
                {stats.stories.incident === 1 ? "" : "s"} ·{" "}
                {stats.stories.original} original
                {stats.stories.original === 1 ? "" : "s"} ·{" "}
                {stats.stories.tip} tip
                {stats.stories.tip === 1 ? "" : "s"})
              </>
            ) : null}
. Sums what is still on-chain at lost, government-seized,
            sanctioned, and other priced addresses — distinct from the
            realised-loss counter above, which sums what got stolen
            historically.
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
              <div className="text-sm font-mono text-[var(--rex-text)]">
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
              <div className="text-sm font-mono text-[var(--rex-text)]">
                {formatUsdShort(restUsd)}
              </div>
              <div className="text-[10px] font-mono text-[var(--rex-text-dim)]">
                {restCount} addr
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-[var(--rex-border-subtle)] mt-4 pt-3">
        <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] mb-2">
          Stories on file — every approved RexIntel piece
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
          <StoryTile
            label="All stories"
            value={stats.stories.total}
            accent
            href="/intel"
          />
          <StoryTile
            label="Incidents"
            value={stats.stories.incident}
            href="/intel?kind=incident"
          />
          <StoryTile
            label="Originals"
            value={stats.stories.original}
            href="/intel?kind=original"
          />
          <StoryTile
            label="Tips"
            value={stats.stories.tip}
            href="/intel?kind=tip"
          />
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
                <div className="text-sm font-mono text-[var(--rex-text)]">
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

function StoryTile({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: number;
  href: string;
  accent?: boolean;
}) {
  return (
    <a
      href={href}
      className="border-l border-[var(--rex-border-subtle)] pl-3 hover:border-[var(--rex-accent)] transition-colors group"
    >
      <div
        className="text-[9px] font-mono uppercase tracking-widest"
        style={{
          color: accent ? "var(--rex-accent)" : "var(--rex-text-dim)",
        }}
      >
        {label}
      </div>
      <div className="text-sm font-mono text-[var(--rex-text)] group-hover:text-[var(--rex-accent)] transition-colors">
        {value.toLocaleString()}
      </div>
      <div className="text-[10px] font-mono text-[var(--rex-text-dim)]">
        {value === 1 ? "piece" : "pieces"}
      </div>
    </a>
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
          <div className="font-display text-2xl sm:text-3xl font-semibold text-[var(--rex-text)] mt-1">
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
              <div className="text-sm font-mono text-[var(--rex-text)]">
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
              <span className="text-[var(--rex-text)] truncate">
                {w.label ??
                  w.ownerName ??
                  `${w.chain}:${w.address.slice(0, 12)}…`}
              </span>
            </li>
          ))}
        </ul>
        <a
          href="/graph?view=institutional&category=lost"
          className="inline-block mt-3 text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)] hover:text-[var(--rex-text)] transition-colors"
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
          ? "border-[var(--rex-accent)] bg-[rgba(95,185,31,0.08)] text-[var(--rex-text)]"
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
