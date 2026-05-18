import Link from "next/link";
import { sql, type SQL } from "drizzle-orm";
import { submissions } from "@/lib/db";

/**
 * Shared lane-UI primitives: chips, empty states, the org logo box, the
 * featured tag, the "paste hint" banner, and the date-range formatter.
 * Lives under _lanes so each lane component can import a small surface
 * instead of reaching into page.tsx.
 */

export type Sector = "web3" | "ai";

export function parseSector(v: string | undefined): Sector | null {
  return v === "web3" || v === "ai" ? v : null;
}

// Token-bounded sector regexes — Postgres POSIX `\y` is a word boundary, so
// "ai" matches in "AI / agents" but not in "obtained". Keep these lists in
// sync with the lane subtitle copy and the seeded examples; widening these
// re-buckets historical rows on the next read, so prefer additive edits.
const SECTOR_RE: Record<Sector, string> = {
  ai: String.raw`\y(ai|a\.i\.|llm|llms|ml|robot|robots|robotics|robotic|agentic|agents?|machine learning|generative|alignment|foundation model|embodied|deep learning|computer vision|nlp|gpu|frontier model|frontier models)\y`,
  web3: String.raw`\y(web3|crypto|blockchain|ethereum|solana|defi|nft|nfts|dao|daos|zk|zero[- ]knowledge|evm|bitcoin|onchain|rollup|rollups|l1|l2|stablecoin|stablecoins|mev|wallet|wallets|smart contracts?|tokeni[sz]ed?|tokeni[sz]ation|worldcoin|world id|world chain|world app|base chain|polkadot|cosmos|polygon|arbitrum|optimism|avalanche|near protocol|aptos|sui|starknet|cardano|tron|monad|berachain|sonic|cronos|filecoin|chainlink|gitcoin|uniswap|aave|maker dao|protocol guild)\y`,
};

/**
 * Build a sector-filter SQL clause that matches the regex against any of
 * the named payload fields plus the tags array. Tags are stored as a JSONB
 * array — casting `payload->>'tags'` returns the JSON-encoded string
 * (e.g. `["AI","robotics"]`), which works fine for keyword regex matching
 * because the values are still in the text. Returns `true` when sector is
 * null so callers can chain it unconditionally.
 */
export function sectorClause(sector: Sector | null, fields: string[]): SQL {
  if (!sector) return sql`true`;
  const re = SECTOR_RE[sector];
  const parts = [...fields, "tags"].map(
    (f) => sql`COALESCE(${submissions.payload}->>${f}, '') ~* ${re}`,
  );
  return sql`(${sql.join(parts, sql` OR `)})`;
}

/**
 * "Closing soon" — deadline field is within the next `days` window AND not
 * already past. `field` is the JSONB key holding the ISO deadline (e.g.
 * "deadline", "nextDeadline", "applicationDeadline"). Returns `true` when
 * not active so it composes cleanly with other clauses.
 */
export function closingSoonClause(
  active: boolean,
  field: string,
  days = 14,
): SQL {
  if (!active) return sql`true`;
  // `days` is internally controlled (never user input), so raw interpolation
  // into the interval literal is safe and avoids the `numeric || text`
  // coercion dance.
  const interval = sql.raw(`interval '${Math.max(1, Math.floor(days))} days'`);
  return sql`(${submissions.payload}->>${field}) IS NOT NULL AND (${submissions.payload}->>${field})::timestamptz BETWEEN now() AND now() + ${interval}`;
}

export function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="px-2.5 py-1 rounded-sm uppercase tracking-widest transition-all"
      style={{
        background: active ? "var(--rex-bg)" : "transparent",
        color: active ? "var(--rex-accent)" : "var(--rex-text-dim)",
        border: `1px solid ${active ? "var(--rex-accent)" : "var(--rex-border-subtle)"}`,
      }}
    >
      {children}
    </Link>
  );
}

/** Collapsible wrapper for lane filter rows. Native `<details>` so it works
 *  without client JS and survives SSR. Closed by default — `summary` shows the
 *  active filter state ("All" or e.g. "Web3 · Rolling") so users can see what
 *  is applied without opening it. */
export function FilterBar({
  summary,
  children,
}: {
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <details className="mb-6 group [&[open]_.rex-filter-chev]:rotate-90">
      <summary
        className="flex items-center gap-2 mb-3 text-xs font-mono cursor-pointer select-none list-none hover:text-white transition-colors"
        style={{ color: "var(--rex-text-muted)" }}
      >
        <span
          className="uppercase tracking-widest"
          style={{ color: "var(--rex-text-dim)" }}
        >
          FILTERS
        </span>
        <span
          className="rex-filter-chev inline-block transition-transform"
          style={{ color: "var(--rex-text-dim)" }}
          aria-hidden="true"
        >
          ▸
        </span>
        <span>{summary}</span>
      </summary>
      <div className="space-y-3">{children}</div>
    </details>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="border border-dashed rounded-lg p-12 text-center bg-grid"
      style={{
        borderColor: "var(--rex-border)",
        color: "var(--rex-text-dim)",
      }}
    >
      {children}
    </div>
  );
}

export function OrgLogo({
  src,
  org,
  size = "md",
}: {
  src: string | null;
  org: string;
  size?: "sm" | "md";
}) {
  const initial = (org || "?").trim().slice(0, 1).toUpperCase();
  const box = size === "sm" ? "w-6 h-6" : "w-10 h-10";
  const img = size === "sm" ? "w-4 h-4" : "w-7 h-7";
  const text = size === "sm" ? "text-[10px]" : "text-base";
  return (
    <div
      className={`flex-shrink-0 ${box} rounded-sm flex items-center justify-center border overflow-hidden`}
      style={{
        background: "var(--rex-logo-chip)",
        borderColor: "var(--rex-logo-chip-border)",
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`${org} logo`}
          width={size === "sm" ? 16 : 32}
          height={size === "sm" ? 16 : 32}
          loading="lazy"
          className={`${img} object-contain`}
        />
      ) : (
        <span
          className={`font-display ${text}`}
          style={{ color: "var(--rex-bg)" }}
          aria-hidden="true"
        >
          {initial}
        </span>
      )}
    </div>
  );
}

export function FeaturedTag() {
  return (
    <span
      className="px-1.5 py-0.5 rounded-sm"
      style={{
        background: "rgba(95,185,31,0.12)",
        color: "var(--rex-accent)",
        border: "1px solid rgba(95,185,31,0.45)",
      }}
    >
      ★ Featured
    </span>
  );
}

export function ClosedTag({ label = "Deadline passed" }: { label?: string }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded-sm"
      style={{
        background: "rgba(136,136,160,0.10)",
        color: "var(--rex-text-dim)",
        border: "1px solid rgba(136,136,160,0.30)",
      }}
    >
      ✕ {label}
    </span>
  );
}

/** Cheap server-side check used by grants/accelerators/perks cards so the
 *  "closed" badge shows without a query rewrite. Returns true if the date is
 *  parseable and already in the past. Empty / undefined / rolling → false. */
export function isDeadlinePassed(iso: string | undefined | null): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return t < Date.now();
}

/** Deadline chip with three modes:
 *  - Rolling (green) when `rolling=true` and no deadline beats it.
 *  - Urgent (amber) when the deadline is within `urgentDays` (default 14).
 *  - Neutral (blue) for deadlines further out.
 *  Past deadlines render nothing — callers should pair this with `ClosedTag`
 *  driven by `isDeadlinePassed`.
 *  `verb` is the imperative prefix ("Apply", "Register", "Closes"). */
export function DeadlineChip({
  deadline,
  rolling,
  verb = "Apply",
  urgentDays = 14,
}: {
  deadline?: string;
  rolling?: boolean;
  verb?: string;
  urgentDays?: number;
}) {
  const parsedMs = deadline ? Date.parse(deadline) : NaN;
  const hasDeadline = Number.isFinite(parsedMs) && parsedMs >= Date.now();
  if (!hasDeadline && !rolling) return null;

  if (hasDeadline) {
    const daysLeft = Math.ceil(
      (parsedMs - Date.now()) / (24 * 60 * 60 * 1000),
    );
    const urgent = daysLeft <= urgentDays;
    const label =
      daysLeft === 0
        ? `${verb} today`
        : daysLeft === 1
          ? `${verb} by tomorrow`
          : `${verb} by ${new Date(parsedMs).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    return (
      <span
        className="px-1.5 py-0.5 rounded-sm"
        style={
          urgent
            ? {
                background: "rgba(255,168,0,0.08)",
                color: "#ffb84d",
                border: "1px solid rgba(255,168,0,0.35)",
              }
            : {
                background: "rgba(31,168,224,0.06)",
                color: "var(--rex-accent-2)",
                border: "1px solid rgba(31,168,224,0.25)",
              }
        }
      >
        ✎ {label}
      </span>
    );
  }
  // rolling
  return (
    <span
      className="px-1.5 py-0.5 rounded-sm"
      style={{
        background: "rgba(95,185,31,0.08)",
        color: "var(--rex-accent)",
        border: "1px solid rgba(95,185,31,0.35)",
      }}
    >
      ↻ Rolling
    </span>
  );
}

export function PasteHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-6 rounded-sm border border-dashed p-3 text-[11px] font-mono"
      style={{
        borderColor: "rgba(95,185,31,0.35)",
        background: "rgba(95,185,31,0.04)",
        color: "var(--rex-text-muted)",
      }}
    >
      <span className="text-[var(--rex-accent)]">▸</span> {children}
    </div>
  );
}

export function formatRange(start: Date, end: Date): string {
  const sameMonth =
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const endLabel = sameMonth
    ? end.toLocaleDateString(undefined, { day: "numeric", year: "numeric" })
    : end.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
  return `${startLabel}–${endLabel}`;
}

/** Cache key for time-bucketed unstable_cache calls — flips daily so the
 *  "upcoming vs past" boundary moves forward without a manual flush. */
export function todayBucket(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Compact USD display: $850 → "$850", $12500 → "$12.5K", $1000000 → "$1M".
 *  Used on funding chips for fellowships / accelerators / hackathons. */
export function formatUsd(amount: number): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    const k = amount / 1_000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `$${amount}`;
}

/** Funding-floor filter buckets — shared between fellowships / accelerators
 *  so the chip set stays consistent across lanes. */
export const FUNDING_BUCKETS = [
  { value: 0, label: "All" },
  { value: 10000, label: "$10K+" },
  { value: 50000, label: "$50K+" },
  { value: 100000, label: "$100K+" },
  { value: 250000, label: "$250K+" },
  { value: 500000, label: "$500K+" },
] as const;

export type FundingFloor = (typeof FUNDING_BUCKETS)[number]["value"];

export function parseFundingFloor(v: string | undefined): FundingFloor {
  if (!v) return 0;
  const n = Number(v);
  const match = FUNDING_BUCKETS.find((b) => b.value === n);
  return match ? match.value : 0;
}
