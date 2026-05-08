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
          <p className="text-xs uppercase tracking-widest text-neutral-500 mb-1">
            People
          </p>
          <h1 className="font-display text-4xl font-medium">Subscribers</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {total.toLocaleString()} total
          </p>
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="bg-black text-white text-sm px-4 py-2 rounded-md hover:bg-neutral-800"
        >
          Import CSV
        </button>
      </header>

      <div className="mb-4">
        <input
          placeholder="Search by email or name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-neutral-900"
        />
      </div>

      <div className="border border-neutral-200 rounded-lg overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Added</th>
            </tr>
          </thead>
          <tbody>
            {loading && subs.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-neutral-400">
                  Loading…
                </td>
              </tr>
            ) : subs.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-neutral-400">
                  No subscribers found.
                </td>
              </tr>
            ) : (
              subs.map((s) => (
                <tr key={s.id} className="border-t border-neutral-100">
                  <td className="px-4 py-3 font-mono text-xs">{s.email}</td>
                  <td className="px-4 py-3">
                    {[s.firstName, s.lastName].filter(Boolean).join(" ") || (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-neutral-500 text-xs">
                    {s.source || "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-500 text-xs">
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
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="font-display text-2xl font-medium mb-1">Import CSV</h2>
        <p className="text-sm text-neutral-500 mb-4">
          File should have an <code className="font-mono text-xs bg-neutral-100 px-1">email</code>{" "}
          column, plus optional <code className="font-mono text-xs bg-neutral-100 px-1">first_name</code>{" "}
          and <code className="font-mono text-xs bg-neutral-100 px-1">last_name</code>.
        </p>

        {result ? (
          <div className="bg-neutral-50 rounded p-3 text-sm font-mono text-xs whitespace-pre-wrap mb-4">
            {JSON.stringify(result, null, 2)}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-neutral-700 mb-1.5">
                CSV file
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-neutral-700 mb-1.5">
                Source label
              </label>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-md hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!file || busy}
                className="px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-neutral-800 disabled:opacity-50"
              >
                {busy ? "Importing…" : "Import"}
              </button>
            </div>
          </form>
        )}

        {result ? (
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-neutral-800"
          >
            Done
          </button>
        ) : null}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-50 text-green-700",
    pending: "bg-amber-50 text-amber-700",
    unsubscribed: "bg-neutral-100 text-neutral-700",
    bounced: "bg-red-50 text-red-700",
    complained: "bg-red-50 text-red-700",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs rounded font-medium ${
        styles[status] ?? "bg-neutral-100"
      }`}
    >
      {status}
    </span>
  );
}
