import Link from "next/link";
import { PublicShell } from "@/components/public-shell";

/**
 * Wrapper for the resource-board pages (Grants / Accelerators / Pop-Up
 * Cities / Jobs). Provides a consistent header — kicker / H1 / sub-copy /
 * submit CTA — and a tightly-styled "paste-a-link" trust banner.
 *
 * Each board page only has to provide its own classification segments,
 * copy strings, and the rendered list body. Filtering controls (if any)
 * are also passed in by the caller since the predicates differ per type.
 */
export function ResourceListShell({
  classification,
  kicker,
  title,
  subtitle,
  submitHref,
  submitLabel = "+ Add ▸",
  pasteHint,
  filters,
  children,
}: {
  classification: { text: string; show?: "sm" | "md" }[];
  kicker: string; // "▸ Grants"
  title: string; // "Capital for builders."
  subtitle: string; // descriptive sentence
  submitHref: string; // /submit?type=grant
  submitLabel?: string;
  pasteHint?: React.ReactNode; // banner JSX (links etc.) — accept ReactNode
  filters?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <PublicShell classification={classification}>
      <main className="max-w-4xl mx-auto px-6 pt-8 md:pt-14 pb-24">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p
              className="text-xs uppercase tracking-widest mb-2"
              style={{ color: "var(--rex-text-dim)" }}
            >
              {kicker}
            </p>
            <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight text-white mb-3">
              {title}
            </h1>
            <p className="text-sm md:text-base text-[var(--rex-text-muted)] max-w-xl leading-relaxed">
              {subtitle}
            </p>
          </div>
          <Link href={submitHref} className="rex-btn whitespace-nowrap">
            {submitLabel}
          </Link>
        </div>

        {pasteHint && (
          <div
            className="mb-6 rounded-sm border border-dashed p-3 text-[11px] font-mono"
            style={{
              borderColor: "rgba(95,185,31,0.35)",
              background: "rgba(95,185,31,0.04)",
              color: "var(--rex-text-muted)",
            }}
          >
            <span className="text-[var(--rex-accent)]">▸</span> {pasteHint}
          </div>
        )}

        {filters && <div className="mb-6">{filters}</div>}

        {children}
      </main>
    </PublicShell>
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
