export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-xs uppercase tracking-wider mb-1.5"
        style={{ color: "var(--rex-text-muted)" }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-xs mt-1" style={{ color: "var(--rex-text-dim)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
