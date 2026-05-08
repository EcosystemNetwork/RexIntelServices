"use client";

import { useEffect, useState } from "react";

interface Subscriber {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  source: string | null;
  createdAt: string;
}

export default function SubscribersPage() {
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch(
      `/api/subscribers?limit=100&q=${encodeURIComponent(q)}`,
    );
    const data = await res.json();
    setSubs(data.subscribers);
    setTotal(data.total);
    setLoading(false);
  }

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="p-10 max-w-6xl">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <p
            className="text-xs uppercase tracking-widest mb-1"
            style={{ color: "var(--rex-text-dim)" }}
          >
            People
          </p>
          <h1 className="font-display text-4xl font-medium text-white">
            Subscribers
          </h1>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--rex-text-muted)" }}
          >
            {total.toLocaleString()} total
          </p>
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="rex-btn"
          id="import-csv-btn"
        >
          Import CSV
        </button>
      </header>

      <div className="mb-4">
        <input
          placeholder="Search by email or name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rex-input max-w-md"
          id="subscriber-search"
        />
      </div>

      <div className="rex-card">
        <table className="rex-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Status</th>
              <th>Source</th>
              <th>Added</th>
            </tr>
          </thead>
          <tbody>
            {loading && subs.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="text-center py-12"
                  style={{ color: "var(--rex-text-dim)" }}
                >
                  <span className="inline-flex items-center gap-2">
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
                    Loading…
                  </span>
                </td>
              </tr>
            ) : subs.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="text-center py-12"
                  style={{ color: "var(--rex-text-dim)" }}
                >
                  No subscribers found.
                </td>
              </tr>
            ) : (
              subs.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono text-xs text-white">{s.email}</td>
                  <td style={{ color: "var(--rex-text-muted)" }}>
                    {[s.firstName, s.lastName].filter(Boolean).join(" ") || (
                      <span style={{ color: "var(--rex-text-dim)" }}>—</span>
                    )}
                  </td>
                  <td>
                    <span className={`pill pill-${s.status}`}>{s.status}</span>
                  </td>
                  <td
                    className="text-xs"
                    style={{ color: "var(--rex-text-dim)" }}
                  >
                    {s.source || "—"}
                  </td>
                  <td
                    className="text-xs"
                    style={{ color: "var(--rex-text-dim)" }}
                  >
                    {new Date(s.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onComplete={load}
        />
      )}
    </div>
  );
}

function ImportModal({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState("csv_import");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("source", source);
    const res = await fetch("/api/subscribers/import", {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    setResult(data);
    setBusy(false);
    onComplete();
  }

  return (
    <div className="rex-modal-backdrop" onClick={onClose}>
      <div className="rex-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-medium text-white mb-1">
          Import CSV
        </h2>
        <p className="text-sm mb-4" style={{ color: "var(--rex-text-muted)" }}>
          File should have an{" "}
          <code
            className="font-mono text-xs px-1 py-0.5 rounded"
            style={{
              background: "var(--rex-surface-2)",
              color: "var(--rex-accent)",
            }}
          >
            email
          </code>{" "}
          column, plus optional{" "}
          <code
            className="font-mono text-xs px-1 py-0.5 rounded"
            style={{
              background: "var(--rex-surface-2)",
              color: "var(--rex-accent)",
            }}
          >
            first_name
          </code>{" "}
          and{" "}
          <code
            className="font-mono text-xs px-1 py-0.5 rounded"
            style={{
              background: "var(--rex-surface-2)",
              color: "var(--rex-accent)",
            }}
          >
            last_name
          </code>
          .
        </p>

        {result ? (
          <>
            <div
              className="rounded-lg p-3 text-sm font-mono text-xs whitespace-pre-wrap mb-4"
              style={{
                background: "var(--rex-surface-2)",
                color: "var(--rex-success)",
              }}
            >
              {JSON.stringify(result, null, 2)}
            </div>
            <button onClick={onClose} className="rex-btn w-full">
              Done
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label
                className="block text-xs uppercase tracking-wider mb-1.5"
                style={{ color: "var(--rex-text-muted)" }}
              >
                CSV file
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm"
                style={{ color: "var(--rex-text-muted)" }}
                required
                id="csv-file-input"
              />
            </div>
            <div>
              <label
                className="block text-xs uppercase tracking-wider mb-1.5"
                style={{ color: "var(--rex-text-muted)" }}
              >
                Source label
              </label>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="rex-input"
                id="import-source"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rex-btn-ghost"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!file || busy}
                className="rex-btn"
                id="import-submit"
              >
                {busy ? "Importing…" : "Import"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
