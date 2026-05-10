export default function AdminLoading() {
  return (
    <div
      className="p-10 flex items-center gap-3 text-sm font-mono"
      style={{ color: "var(--rex-text-dim)" }}
    >
      <svg
        className="animate-spin w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <span className="uppercase tracking-widest">Loading…</span>
    </div>
  );
}
