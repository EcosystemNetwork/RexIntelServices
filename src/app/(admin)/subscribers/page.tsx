"use client";

import { useEffect, useMemo, useState } from "react";

interface Subscriber {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  source: string | null;
  createdAt: string;
}

interface Tag {
  id: string;
  name: string;
  subscriberCount: number;
}

const STATUSES = [
  "active",
  "pending",
  "unsubscribed",
  "bounced",
  "complained",
] as const;
type Status = (typeof STATUSES)[number];

export default function SubscribersPage() {
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "">("");
  const [showImport, setShowImport] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tags, setTags] = useState<Tag[]>([]);

  const allChecked = subs.length > 0 && subs.every((s) => selected.has(s.id));
  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("limit", "100");
    if (q) sp.set("q", q);
    if (statusFilter) sp.set("status", statusFilter);
    return sp.toString();
  }, [q, statusFilter]);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/subscribers?${queryString}`);
    const data = await res.json();
    setSubs(data.subscribers);
    setTotal(data.total);
    setLoading(false);
    // Drop selections that no longer match the visible page
    setSelected((prev) => {
      const next = new Set<string>();
      const visibleIds = new Set(
        (data.subscribers as Subscriber[]).map((s) => s.id),
      );
      prev.forEach((id) => {
        if (visibleIds.has(id)) next.add(id);
      });
      return next;
    });
  }

  async function loadTags() {
    const res = await fetch("/api/tags");
    const data = await res.json();
    setTags(data.tags ?? []);
  }

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [queryString]);

  useEffect(() => {
    loadTags();
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(subs.map((s) => s.id)));
  }

  return (
    <div className="p-10 max-w-7xl">
      <header className="mb-8 flex items-end justify-between flex-wrap gap-4">
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
            {total.toLocaleString()} total{statusFilter && ` matching "${statusFilter}"`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={`/api/subscribers/export?${queryString}`}
            className="rex-btn-ghost"
          >
            Export CSV
          </a>
          <button
            onClick={() => setShowImport(true)}
            className="rex-btn-ghost"
            id="import-csv-btn"
          >
            Import CSV
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="rex-btn"
            id="add-subscriber-btn"
          >
            Add subscriber
          </button>
        </div>
      </header>

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <input
          placeholder="Search by email or name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rex-input flex-1 min-w-[280px] max-w-md"
          id="subscriber-search"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Status | "")}
          className="rex-input max-w-[180px]"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          ids={[...selected]}
          tags={tags}
          onClear={() => setSelected(new Set())}
          onDone={() => {
            setSelected(new Set());
            load();
          }}
        />
      )}

      <div className="rex-card">
        <table className="rex-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  aria-label="Select all on this page"
                />
              </th>
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
                  colSpan={6}
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
                  colSpan={6}
                  className="text-center py-12"
                  style={{ color: "var(--rex-text-dim)" }}
                >
                  No subscribers found.
                </td>
              </tr>
            ) : (
              subs.map((s) => (
                <tr key={s.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggle(s.id)}
                      aria-label={`Select ${s.email}`}
                    />
                  </td>
                  <td>
                    <button
                      onClick={() => setDetailId(s.id)}
                      className="font-mono text-xs text-white hover:text-[var(--rex-accent)] text-left"
                    >
                      {s.email}
                    </button>
                  </td>
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
      {showAdd && (
        <AddSubscriberModal
          onClose={() => setShowAdd(false)}
          onComplete={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
      {detailId && (
        <SubscriberDetailModal
          id={detailId}
          allTags={tags}
          onClose={() => setDetailId(null)}
          onChanged={() => {
            load();
            loadTags();
          }}
        />
      )}
    </div>
  );
}

function BulkBar({
  count,
  ids,
  tags,
  onClear,
  onDone,
}: {
  count: number;
  ids: string[];
  tags: Tag[];
  onClear: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function call(payload: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch("/api/subscribers/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, ids }),
    });
    setBusy(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "action failed");
      return;
    }
    onDone();
  }

  async function handleStatus(status: Status) {
    if (!confirm(`Set ${count} subscriber${count === 1 ? "" : "s"} to ${status}?`)) return;
    await call({ action: "set_status", status });
  }

  async function handleSuppress() {
    if (
      !confirm(
        `Suppress ${count} subscriber${count === 1 ? "" : "s"}?\n\nThey'll be moved to the global block list and cannot be re-imported.`,
      )
    )
      return;
    await call({ action: "suppress", reason: "manual" });
  }

  async function handleDelete() {
    if (
      !confirm(
        `Permanently delete ${count} subscriber${count === 1 ? "" : "s"}?\n\nThis removes them from the database. To prevent re-imports, use Suppress instead.`,
      )
    )
      return;
    await call({ action: "delete" });
  }

  async function handleTag(tagId: string) {
    await call({ action: "tag", tagId });
  }

  async function handleUntag(tagId: string) {
    await call({ action: "untag", tagId });
  }

  return (
    <div
      className="rex-card mb-4 p-3 flex items-center gap-2 flex-wrap"
      style={{ borderColor: "var(--rex-accent)" }}
    >
      <span className="text-sm font-medium text-white px-2">
        {count} selected
      </span>
      <button onClick={onClear} className="rex-btn-ghost text-xs">
        Clear
      </button>
      <span
        className="text-xs mx-2"
        style={{ color: "var(--rex-text-dim)" }}
      >
        |
      </span>
      <Dropdown label="Set status">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => handleStatus(s)}
            disabled={busy}
            className="block w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--rex-surface-2)]"
            style={{ color: "var(--rex-text)" }}
          >
            {s}
          </button>
        ))}
      </Dropdown>
      <Dropdown label="Add tag" disabled={tags.length === 0}>
        {tags.map((t) => (
          <button
            key={t.id}
            onClick={() => handleTag(t.id)}
            disabled={busy}
            className="block w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--rex-surface-2)]"
            style={{ color: "var(--rex-text)" }}
          >
            {t.name}
          </button>
        ))}
      </Dropdown>
      <Dropdown label="Remove tag" disabled={tags.length === 0}>
        {tags.map((t) => (
          <button
            key={t.id}
            onClick={() => handleUntag(t.id)}
            disabled={busy}
            className="block w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--rex-surface-2)]"
            style={{ color: "var(--rex-text)" }}
          >
            {t.name}
          </button>
        ))}
      </Dropdown>
      <button
        onClick={handleSuppress}
        disabled={busy}
        className="rex-btn-ghost text-xs"
      >
        Suppress
      </button>
      <button
        onClick={handleDelete}
        disabled={busy}
        className="rex-btn-ghost text-xs"
        style={{ color: "var(--rex-danger)" }}
      >
        Delete
      </button>
    </div>
  );
}

function Dropdown({
  label,
  children,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((s) => !s)}
        disabled={disabled}
        className="rex-btn-ghost text-xs"
      >
        {label} ▾
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute mt-1 z-20 min-w-[160px] rounded-lg border py-1 shadow-lg"
            style={{
              background: "var(--rex-surface)",
              borderColor: "var(--rex-border)",
            }}
            onClick={() => setOpen(false)}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}

function AddSubscriberModal({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: () => void;
}) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [source, setSource] = useState("manual");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const res = await fetch("/api/subscribers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        source: source.trim() || "manual",
      }),
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
          Add subscriber
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
              placeholder="alex@example.com"
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="block text-xs uppercase tracking-wider mb-1.5"
                style={{ color: "var(--rex-text-muted)" }}
              >
                First name
              </label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="rex-input"
              />
            </div>
            <div>
              <label
                className="block text-xs uppercase tracking-wider mb-1.5"
                style={{ color: "var(--rex-text-muted)" }}
              >
                Last name
              </label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="rex-input"
              />
            </div>
          </div>
          <div>
            <label
              className="block text-xs uppercase tracking-wider mb-1.5"
              style={{ color: "var(--rex-text-muted)" }}
            >
              Source
            </label>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="rex-input"
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

function SubscriberDetailModal({
  id,
  allTags,
  onClose,
  onChanged,
}: {
  id: string;
  allTags: Tag[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<{
    subscriber: Subscriber & {
      unsubscribeToken: string;
      confirmedAt: string | null;
      unsubscribedAt: string | null;
      metadata: Record<string, unknown> | null;
    };
    tags: { id: string; name: string }[];
    sends: Array<{
      id: string;
      campaignId: string;
      campaignName: string | null;
      campaignSubject: string | null;
      status: string;
      sentAt: string | null;
      openedAt: string | null;
      openCount: number | null;
      clickedAt: string | null;
      clickCount: number | null;
      bouncedAt: string | null;
    }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{
    firstName: string;
    lastName: string;
    status: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/subscribers/${id}`);
    const d = await res.json();
    setData(d);
    setEditing({
      firstName: d.subscriber.firstName ?? "",
      lastName: d.subscriber.lastName ?? "",
      status: d.subscriber.status,
    });
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, [id]);

  async function save() {
    if (!editing) return;
    setBusy(true);
    const res = await fetch(`/api/subscribers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    setBusy(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      alert(e.error ?? "save failed");
      return;
    }
    onChanged();
    load();
  }

  async function toggleTag(tagId: string, has: boolean) {
    const action = has ? "untag" : "tag";
    setBusy(true);
    const res = await fetch("/api/subscribers/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ids: [id], tagId }),
    });
    setBusy(false);
    if (!res.ok) {
      alert("tag update failed");
      return;
    }
    onChanged();
    load();
  }

  async function handleDelete() {
    if (
      !confirm(
        "Delete this subscriber? They can re-subscribe via the public form unless you suppress them instead.",
      )
    )
      return;
    setBusy(true);
    const res = await fetch(`/api/subscribers/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      alert("delete failed");
      return;
    }
    onChanged();
    onClose();
  }

  return (
    <div className="rex-modal-backdrop" onClick={onClose}>
      <div
        className="rex-modal"
        style={{ maxWidth: 720, maxHeight: "90vh", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        {loading || !data || !editing ? (
          <div
            className="py-12 text-center"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Loading…
          </div>
        ) : (
          <>
            <header className="mb-4">
              <h2 className="font-display text-2xl font-medium text-white">
                {data.subscriber.email}
              </h2>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--rex-text-dim)" }}
              >
                Joined {new Date(data.subscriber.createdAt).toLocaleString()} ·{" "}
                {data.subscriber.source || "no source"}
              </p>
            </header>

            <section className="mb-6">
              <h3
                className="text-xs uppercase tracking-wider mb-2"
                style={{ color: "var(--rex-text-muted)" }}
              >
                Profile
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={editing.firstName}
                  onChange={(e) =>
                    setEditing({ ...editing, firstName: e.target.value })
                  }
                  className="rex-input"
                  placeholder="First name"
                />
                <input
                  value={editing.lastName}
                  onChange={(e) =>
                    setEditing({ ...editing, lastName: e.target.value })
                  }
                  className="rex-input"
                  placeholder="Last name"
                />
              </div>
              <select
                value={editing.status}
                onChange={(e) =>
                  setEditing({ ...editing, status: e.target.value })
                }
                className="rex-input mt-3"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                onClick={save}
                disabled={busy}
                className="rex-btn mt-3"
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
            </section>

            <section className="mb-6">
              <h3
                className="text-xs uppercase tracking-wider mb-2"
                style={{ color: "var(--rex-text-muted)" }}
              >
                Tags
              </h3>
              {allTags.length === 0 ? (
                <p
                  className="text-sm"
                  style={{ color: "var(--rex-text-dim)" }}
                >
                  No tags defined yet — create one on the Tags page.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {allTags.map((t) => {
                    const has = data.tags.some((x) => x.id === t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => toggleTag(t.id, has)}
                        disabled={busy}
                        className="px-2.5 py-1 rounded-full text-xs border transition-colors"
                        style={{
                          borderColor: has
                            ? "var(--rex-accent)"
                            : "var(--rex-border)",
                          background: has
                            ? "rgba(99,102,241,0.15)"
                            : "transparent",
                          color: has
                            ? "var(--rex-accent)"
                            : "var(--rex-text-muted)",
                        }}
                      >
                        {has ? "✓ " : ""}
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="mb-6">
              <h3
                className="text-xs uppercase tracking-wider mb-2"
                style={{ color: "var(--rex-text-muted)" }}
              >
                Send history ({data.sends.length})
              </h3>
              {data.sends.length === 0 ? (
                <p
                  className="text-sm"
                  style={{ color: "var(--rex-text-dim)" }}
                >
                  No emails sent yet.
                </p>
              ) : (
                <div
                  className="rounded-lg border overflow-hidden"
                  style={{ borderColor: "var(--rex-border-subtle)" }}
                >
                  <table className="rex-table text-xs">
                    <thead>
                      <tr>
                        <th>Campaign</th>
                        <th>Status</th>
                        <th>Sent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sends.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <div className="text-white text-xs">
                              {s.campaignName ?? "—"}
                            </div>
                            <div
                              className="text-xs mt-0.5"
                              style={{ color: "var(--rex-text-dim)" }}
                            >
                              {s.openCount ? `opened ${s.openCount}× ` : ""}
                              {s.clickCount ? `clicked ${s.clickCount}× ` : ""}
                              {!s.openCount && !s.clickCount ? " " : ""}
                            </div>
                          </td>
                          <td>
                            <span className={`pill pill-${s.status}`}>
                              {s.status}
                            </span>
                          </td>
                          <td
                            className="text-xs"
                            style={{ color: "var(--rex-text-dim)" }}
                          >
                            {s.sentAt
                              ? new Date(s.sentAt).toLocaleDateString()
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div
              className="flex justify-between gap-2 pt-4 border-t"
              style={{ borderColor: "var(--rex-border-subtle)" }}
            >
              <button
                onClick={handleDelete}
                disabled={busy}
                className="rex-btn-ghost text-sm"
                style={{ color: "var(--rex-danger)" }}
              >
                Delete
              </button>
              <button onClick={onClose} className="rex-btn-ghost">
                Close
              </button>
            </div>
          </>
        )}
      </div>
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
                CSV / XLSX file
              </label>
              <input
                type="file"
                accept=".csv,.xlsx,.xlsm"
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
