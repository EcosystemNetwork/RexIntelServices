"use client";

import { useEffect, useState } from "react";

interface Suppression {
  id: string;
  email: string;
  reason: string;
  notes: string | null;
  createdAt: string;
}

export default function SuppressionsPage() {
  const [rows, setRows] = useState<Suppression[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(
      `/api/suppressions?q=${encodeURIComponent(q)}&limit=500`,
    );
    const data = await res.json();
    setRows(data.suppressions ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [q]);

  async function remove(id: string, email: string) {
    if (
      !confirm(
        `Remove ${email} from the suppression list?\n\nOnly do this if you've confirmed the email is valid and the recipient consents — re-sending to a hard-bounced or complained address damages your sender reputation.`,
      )
    )
      return;
    const res = await fetch(`/api/suppressions/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("delete failed");
      return;
    }
    load();
  }

  return (
    <div className="p-10 max-w-5xl">
      <header className="mb-8 flex items-end justify-between flex-wrap gap-4">
        <div>
          <p
            className="text-xs uppercase tracking-widest mb-1"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Block list
          </p>
          <h1 className="font-display text-4xl font-medium text-white">
            Suppressions
          </h1>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--rex-text-muted)" }}
          >
            {total.toLocaleString()} suppressed · these emails are excluded from
            every send and import.
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="rex-btn">
          Add suppression
        </button>
      </header>

      <div className="mb-4">
        <input
          placeholder="Search email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rex-input max-w-md"
        />
      </div>

      <div className="rex-card">
        <table className="rex-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Reason</th>
              <th>Notes</th>
              <th>Added</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="text-center py-12"
                  style={{ color: "var(--rex-text-dim)" }}
                >
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="text-center py-12"
                  style={{ color: "var(--rex-text-dim)" }}
                >
                  No suppressions.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-xs text-white">{r.email}</td>
                  <td>
                    <span className={`pill pill-${pillForReason(r.reason)}`}>
                      {r.reason.replace("_", " ")}
                    </span>
                  </td>
                  <td
                    className="text-xs"
                    style={{ color: "var(--rex-text-muted)" }}
                  >
                    {r.notes || (
                      <span style={{ color: "var(--rex-text-dim)" }}>—</span>
                    )}
                  </td>
                  <td
                    className="text-xs"
                    style={{ color: "var(--rex-text-dim)" }}
                  >
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => remove(r.id, r.email)}
                      className="text-xs hover:text-[var(--rex-danger)]"
                      style={{ color: "var(--rex-text-dim)" }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddModal
          onClose={() => setShowAdd(false)}
          onComplete={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function pillForReason(reason: string): string {
  if (reason === "hard_bounce") return "bounced";
  if (reason === "complaint") return "complained";
  return "unsubscribed";
}

function AddModal({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: () => void;
}) {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("manual");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/suppressions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, reason, notes }),
    });
    setBusy(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setErr(e.error ?? "add failed");
      return;
    }
    onComplete();
  }

  return (
    <div className="rex-modal-backdrop" onClick={onClose}>
      <div className="rex-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-medium text-white mb-4">
          Add suppression
        </h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label
              className="block text-xs uppercase tracking-wider mb-1.5"
              style={{ color: "var(--rex-text-muted)" }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rex-input"
              required
              autoFocus
            />
          </div>
          <div>
            <label
              className="block text-xs uppercase tracking-wider mb-1.5"
              style={{ color: "var(--rex-text-muted)" }}
            >
              Reason
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rex-input"
            >
              <option value="manual">manual</option>
              <option value="hard_bounce">hard_bounce</option>
              <option value="complaint">complaint</option>
              <option value="unsubscribe_global">unsubscribe_global</option>
            </select>
          </div>
          <div>
            <label
              className="block text-xs uppercase tracking-wider mb-1.5"
              style={{ color: "var(--rex-text-muted)" }}
            >
              Notes (optional)
            </label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rex-input"
              maxLength={500}
            />
          </div>
          {err && (
            <div
              className="text-sm font-mono"
              style={{ color: "var(--rex-danger)" }}
            >
              {err}
            </div>
          )}
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
              disabled={!email || busy}
              className="rex-btn"
            >
              {busy ? "Adding…" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
