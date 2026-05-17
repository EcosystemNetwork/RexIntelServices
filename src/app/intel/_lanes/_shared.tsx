import Link from "next/link";

/**
 * Shared lane-UI primitives: chips, empty states, the org logo box, the
 * featured tag, the "paste hint" banner, and the date-range formatter.
 * Lives under _lanes so each lane component can import a small surface
 * instead of reaching into page.tsx.
 */

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
      style={{ background: "var(--rex-bg)", borderColor: "var(--rex-border)" }}
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
        <span className={`font-display ${text} text-white`} aria-hidden="true">
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
