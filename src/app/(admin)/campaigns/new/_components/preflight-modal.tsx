"use client";

export function PreflightModal({
  loading,
  preflight,
  onSend,
  onClose,
  busy,
}: {
  loading: boolean;
  preflight: {
    ok: boolean;
    checks: Array<{
      id: string;
      label: string;
      severity: "ok" | "warn" | "block";
      message: string;
    }>;
    recipientCount: number;
  } | null;
  onSend: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  const blockers = preflight?.checks.filter((c) => c.severity === "block") ?? [];
  const warnings = preflight?.checks.filter((c) => c.severity === "warn") ?? [];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.78)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rex-card flex flex-col"
        style={{
          width: "min(700px, 100%)",
          maxHeight: "90vh",
          background: "var(--rex-bg)",
        }}
      >
        <header
          className="flex items-center justify-between p-5 border-b"
          style={{ borderColor: "var(--rex-border-subtle)" }}
        >
          <div>
            <p
              className="text-[10px] uppercase tracking-widest mb-0.5"
              style={{ color: "var(--rex-text-dim)" }}
            >
              Pre-send checklist
            </p>
            <h2 className="font-display text-xl text-white">
              {loading
                ? "Running checks…"
                : preflight?.ok
                  ? "Ready to send"
                  : "Issues found"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-xs hover:text-white"
            style={{ color: "var(--rex-text-dim)" }}
          >
            ✕ Close
          </button>
        </header>

        <div className="overflow-y-auto p-5 flex-1 space-y-2">
          {loading || !preflight ? (
            <p className="text-sm" style={{ color: "var(--rex-text-dim)" }}>
              Inspecting domain, list hygiene, audience…
            </p>
          ) : (
            preflight.checks.map((c) => {
              const color =
                c.severity === "ok"
                  ? "var(--rex-success)"
                  : c.severity === "warn"
                    ? "var(--rex-warning)"
                    : "var(--rex-danger)";
              const icon =
                c.severity === "ok" ? "✓" : c.severity === "warn" ? "!" : "✕";
              return (
                <div
                  key={c.id}
                  className="flex items-start gap-3 p-3 rounded-md border"
                  style={{
                    borderColor: "var(--rex-border-subtle)",
                    background:
                      c.severity === "block"
                        ? "rgba(248,113,113,0.05)"
                        : c.severity === "warn"
                          ? "rgba(251,191,36,0.04)"
                          : "transparent",
                  }}
                >
                  <span
                    className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                    style={{
                      background: color,
                      color: "var(--rex-bg)",
                    }}
                  >
                    {icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-medium"
                      style={{ color: "var(--rex-text)" }}
                    >
                      {c.label}
                    </div>
                    <div
                      className="text-xs mt-0.5"
                      style={{ color: "var(--rex-text-muted)" }}
                    >
                      {c.message}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <footer
          className="p-4 border-t flex items-center justify-between gap-3"
          style={{ borderColor: "var(--rex-border-subtle)" }}
        >
          <div
            className="text-xs font-mono"
            style={{ color: "var(--rex-text-dim)" }}
          >
            {preflight
              ? `${blockers.length} block${blockers.length === 1 ? "" : "s"} · ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`
              : ""}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rex-btn-ghost text-sm">
              Cancel
            </button>
            <button
              onClick={onSend}
              disabled={busy || !preflight || !preflight.ok}
              className="rex-btn"
              title={
                !preflight?.ok
                  ? "Resolve the blocking issues before sending"
                  : undefined
              }
            >
              {busy
                ? "Sending…"
                : preflight
                  ? `Send to ${preflight.recipientCount.toLocaleString()}`
                  : "Send"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
