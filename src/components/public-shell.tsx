import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { HeroScene } from "@/components/hero-scene";
import { FooterSubscribe } from "@/components/footer-subscribe";

type ClassificationSegment = {
  text: string;
  /** Min breakpoint at which this segment becomes visible. Omit to always show. */
  show?: "sm" | "md";
};

export function PublicShell({
  classification,
  sceneHeight,
  children,
}: {
  classification: ClassificationSegment[];
  /** Height of the animated hero scene band. Omit to skip the scene. */
  sceneHeight?: string;
  children: React.ReactNode;
}) {
  const year = new Date().getFullYear();
  const transmissionId = `RX-${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  const showClass = (show?: "sm" | "md") =>
    show === "sm"
      ? "hidden sm:inline"
      : show === "md"
        ? "hidden md:inline"
        : "";

  return (
    <div className="min-h-screen tactical-bg relative overflow-hidden flex flex-col">
      {sceneHeight && <HeroScene height={sceneHeight} topOffset={100} />}

      <div className="classification-bar relative z-20">
        {classification.map((seg, i) => (
          <span key={i} className={showClass(seg.show)}>
            {i > 0 && <span className="sep mr-2">▾</span>}
            {seg.text}
          </span>
        ))}
      </div>

      <PublicHeader brandInScene={Boolean(sceneHeight)} />

      <div className="relative z-10 flex-1">{children}</div>

      <footer className="relative z-10 border-t border-[var(--rex-border-subtle)] py-6 px-6 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col gap-5">
          {/* Global newsletter capture — present on every public page, not
             just the landing route, so interior visits don't dead-end. */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-5 border-b border-dashed border-[var(--rex-border-subtle)]">
            <p className="text-sm text-[var(--rex-text-muted)] leading-relaxed max-w-md">
              One weekly briefing — events, jobs, grants and the signals worth
              tracking. No spam.
            </p>
            <FooterSubscribe />
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="mono-label flex items-center gap-3">
              <span>© {year} Rex Intel Services</span>
              <span className="text-[var(--rex-border)]">│</span>
              <Link href="/jobs" className="hover:text-[var(--rex-accent)] transition-colors">
                Jobs
              </Link>
              <span className="text-[var(--rex-border)]">│</span>
              <Link href="/submit" className="hover:text-[var(--rex-accent)] transition-colors">
                Submit
              </Link>
              <span className="text-[var(--rex-border)]">│</span>
              <span>All transmissions reserved</span>
            </div>
            <div className="mono-label flex items-center gap-3">
              <span className="pulse-dot" />
              <span>Briefing Room {transmissionId}</span>
              <span className="text-[var(--rex-border)]">│</span>
              <Link
                href="/login"
                className="hover:text-[var(--rex-accent)] transition-colors"
              >
                Operator Login ▸
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
