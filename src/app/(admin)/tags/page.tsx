"use client";

import { useEffect, useState } from "react";

interface Tag {
  id: string;
  name: string;
  description: string | null;
  subscriberCount: number;
  createdAt: string;
}

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/tags");
    const data = await res.json();
    setTags(data.tags ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function rename(id: string, currentName: string) {
    const next = prompt("Rename tag", currentName);
    if (!next || next === currentName) return;
    const res = await fetch(`/api/tags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "rename failed");
      return;
    }
    load();
  }

  async function remove(id: string, count: number) {
    const msg =
      count > 0
        ? `Delete this tag and remove it from ${count} subscriber${count === 1 ? "" : "s"}?`
        : "Delete this tag?";
    if (!confirm(msg)) return;
    const res = await fetch(`/api/tags/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("delete failed");
      return;
    }
    load();
  }

  return (
    <div className="p-10 max-w-4xl">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <p
            className="text-xs uppercase tracking-widest mb-1"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Segments
          </p>
          <h1 className="font-display text-4xl font-medium text-white">Tags</h1>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--rex-text-muted)" }}
          >
            Group subscribers so you can send to a slice instead of the whole
            list.
          </p>
        </div>
        <button onClick={() => setShowNew(true)} className="rex-btn">
          New tag
        </button>
      </header>

      <div className="rex-card">
        <table className="rex-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th style={{ textAlign: "right" }}>Subscribers</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={4}
                  className="text-center py-12"
                  style={{ color: "var(--rex-text-dim)" }}
                >
                  Loading…
                </td>
              </tr>
            ) : tags.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="text-center py-12"
                  style={{ color: "var(--rex-text-dim)" }}
                >
                  No tags yet.
                </td>
              </tr>
            ) : (
              tags.map((t) => (
                <tr key={t.id}>
                  <td className="font-medium text-white">{t.name}</td>
                  <td style={{ color: "var(--rex-text-muted)" }}>
                    {t.description || (
                      <span style={{ color: "var(--rex-text-dim)" }}>—</span>
                    )}
                  </td>
                  <td
                    className="text-right font-mono text-xs"
                    style={{ color: "var(--rex-text-muted)" }}
                  >
                    {t.subscriberCount.toLocaleString()}
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => rename(t.id, t.name)}
                      className="text-xs hover:text-white mr-3"
                      style={{ color: "var(--rex-text-dim)" }}
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => remove(t.id, t.subscriberCount)}
                      className="text-xs hover:text-[var(--rex-danger)]"
                      style={{ color: "var(--rex-text-dim)" }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showNew && (
        <NewTagModal
          onClose={() => setShowNew(false)}
          onComplete={() => {
            setShowNew(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function NewTagModal({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    setBusy(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setErr(e.error ?? "create failed");
      return;
    }
    onComplete();
  }

  return (
    <div className="rex-modal-backdrop" onClick={onClose}>
      <div className="rex-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-medium text-white mb-4">
          New tag
        </h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label
              className="block text-xs uppercase tracking-wider mb-1.5"
              style={{ color: "var(--rex-text-muted)" }}
            >
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rex-input"
              placeholder="conferences"
              required
              autoFocus
            />
          </div>
          <div>
            <label
              className="block text-xs uppercase tracking-wider mb-1.5"
              style={{ color: "var(--rex-text-muted)" }}
            >
              Description (optional)
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rex-input"
              placeholder="Shown in the targeting picker"
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
              disabled={!name || busy}
              className="rex-btn"
            >
              {busy ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
