import { getStickyLoc, getCurrentPath } from "@/lib/loc-context";

/**
 * "Scoped to {city}" indicator with a clear button that POSTs to
 * /api/loc/clear and round-trips back to the originating page.
 *
 * Server component — uses cookies()/headers() and is intentionally NOT
 * mounted inside PublicShell so the shell stays importable from client
 * components (landing form, submit form, etc.). Lane pages compose this
 * directly above their main content where it's visible.
 */
export function LocationPill() {
  const loc = getStickyLoc();
  if (!loc) return null;
  const back = getCurrentPath();
  return (
    <form
      method="post"
      action="/api/loc/clear"
      className="mb-4 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-sm text-[11px] font-mono"
      style={{
        background: "rgba(95,185,31,0.08)",
        border: "1px solid rgba(95,185,31,0.35)",
        color: "var(--rex-accent)",
      }}
      title={`Scoped to ${loc} — clear to see all`}
    >
      <input type="hidden" name="back" value={back} />
      <span aria-hidden>◉</span>
      <span className="uppercase tracking-widest text-[var(--rex-text-dim)]">Scoped:</span>
      <span>{loc}</span>
      <button
        type="submit"
        aria-label={`Clear location filter ${loc}`}
        className="hover:text-white transition-colors ml-1"
        style={{ color: "var(--rex-text-dim)" }}
      >
        ✕ Clear
      </button>
    </form>
  );
}
