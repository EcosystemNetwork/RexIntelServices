import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { SUPPORTED_CHAINS } from "@/lib/chains";
import { fetchGraphData, type GraphFilters } from "@/lib/graph-data";
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

export default async function GraphPage({
  searchParams,
}: {
  searchParams: { window?: string; kind?: string; chain?: string };
}) {
  const filters: GraphFilters = {
    window: searchParams.window ?? "90",
    kind: searchParams.kind ?? "incident",
    chain: searchParams.chain ?? null,
  };
  const data = await fetchGraphData(filters);

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
            Co-occurrence edges surface when two addresses appear in
            separate investigations — that's where clusters live. Click any
            node to open the source.
          </p>
        </header>

        <FilterBar
          window={filters.window ?? "90"}
          kind={filters.kind ?? "incident"}
          chain={filters.chain ?? ""}
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
}: {
  window: string;
  kind: string;
  chain: string;
}) {
  return (
    <form
      method="get"
      className="rex-card p-3 sm:p-4 flex flex-wrap items-end gap-3"
    >
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
