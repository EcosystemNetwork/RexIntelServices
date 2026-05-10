"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-10 max-w-2xl">
      <p
        className="text-xs uppercase tracking-widest mb-1"
        style={{ color: "var(--rex-danger)" }}
      >
        Error
      </p>
      <h1 className="font-display text-3xl font-medium text-white mb-2">
        Something broke
      </h1>
      <p className="text-sm mb-5" style={{ color: "var(--rex-text-muted)" }}>
        {error.message || "Unexpected failure loading this view."}
      </p>
      {error.digest && (
        <p
          className="font-mono text-[11px] mb-5"
          style={{ color: "var(--rex-text-dim)" }}
        >
          ref: {error.digest}
        </p>
      )}
      <button onClick={reset} className="rex-btn">
        Retry ▸
      </button>
    </div>
  );
}
