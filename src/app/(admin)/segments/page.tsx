"use client";

import { useEffect, useState } from "react";

interface Tag {
  id: string;
  name: string;
  subscriberCount: number;
}
interface Segment {
  id: string;
  name: string;
  description: string | null;
  filterJson: {
    tagIds?: string[];
    statuses?: string[];
    sources?: string[];
    includeUnconfirmed?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

const STATUSES = ["active", "pending", "unsubscribed", "bounced", "complained"];

export default function SegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Segment | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [previews, setPreviews] = useState<Record<string, number>>({});

  async function load() {
    setLoading(true);
    const [s, t] = await Promise.all([
      fetch("/api/segments").then((r) => r.json()),
      fetch("/api/tags").then((r) => r.json()),
    ]);
    setSegments(s.segments ?? []);
    setTags(t.tags ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  // Resolve preview counts in parallel for every visible segment so the
  // table immediately shows audience sizes without a per-row click.
  useEffect(() => {
    if (segments.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        segments.map(async (s) => {
          const res = await fetch(`/api/segments/${s.id}/preview`);
          if (!res.ok) return [s.id, 0] as const;
          const { count } = await res.json();
          return [s.id, count] as const;
        }),
      );
      if (cancelled) return;
      setPreviews(Object.fromEntries(results));
    })();
    return () => {
      cancelled = true;
    };
  }, [segments]);

  async function deleteSegment(id: string) {
    if (!confirm("Delete this segment? Campaigns targeting it will fall back to all-active.")) return;
    await fetch(`/api/segments/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="p-10 max-w-6xl">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <p
            className="text-xs uppercase tracking-widest mb-1"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Targeting
          </p>
          <h1 className="font-display text-4xl font-medium text-white">
            Segments
          </h1>
          <p
            className="text-sm mt-2"
            style={{ color: "var(--rex-text-muted)" }}
          >
            Saved filter combinations you can target from any campaign — tag
            intersection, status union, source union.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="rex-btn"
        >
          New segment
        </button>
      </header>

      {loading ? (
        <div style={{ color: "var(--rex-text-dim)" }}>Loading…</div>
      ) : segments.length === 0 ? (
        <div
          className="border border-dashed rounded-lg p-16 text-center bg-grid"
          style={{
            borderColor: "var(--rex-border)",
            color: "var(--rex-text-dim)",
          }}
        >
          <p className="font-display text-xl mb-1 text-white">
            No segments yet
          </p>
          <p className="text-sm">
            Create one to target campaigns at saved audience criteria.
          </p>
        </div>
      ) : (
        <div className="rex-card">
          <table className="rex-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Filters</th>
                <th style={{ textAlign: "right" }}>Audience</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {segments.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="font-medium text-white">{s.name}</div>
                    {s.description && (
                      <div
                        className="text-xs mt-0.5"
                        style={{ color: "var(--rex-text-dim)" }}
                      >
                        {s.description}
                      </div>
                    )}
                  </td>
                  <td className="text-xs" style={{ color: "var(--rex-text-muted)" }}>
                    <FilterPreview filter={s.filterJson} tags={tags} />
                  </td>
                  <td
                    className="text-right font-mono"
                    style={{ color: "var(--rex-accent)" }}
                  >
                    {previews[s.id] === undefined
                      ? "—"
                      : previews[s.id].toLocaleString()}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <button
                      onClick={() => setEditing(s)}
                      className="text-xs hover:text-white mr-3"
                      style={{ color: "var(--rex-text-dim)" }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteSegment(s.id)}
                      className="text-xs hover:text-[var(--rex-danger)]"
                      style={{ color: "var(--rex-text-dim)" }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(showNew || editing) && (
        <SegmentEditor
          segment={editing}
          tags={tags}
          onSave={() => {
            setShowNew(false);
            setEditing(null);
            load();
          }}
          onClose={() => {
            setShowNew(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function FilterPreview({
  filter,
  tags,
}: {
  filter: Segment["filterJson"];
  tags: Tag[];
}) {
  const parts: string[] = [];
  if (filter.statuses && filter.statuses.length > 0) {
    parts.push(`status: ${filter.statuses.join(" / ")}`);
  } else {
    parts.push("status: active");
  }
  if (filter.tagIds && filter.tagIds.length > 0) {
    const names = filter.tagIds.map(
      (id) => tags.find((t) => t.id === id)?.name ?? id.slice(0, 6),
    );
    parts.push(`tags: ${names.join(" ∩ ")}`);
  }
  if (filter.sources && filter.sources.length > 0) {
    parts.push(`source: ${filter.sources.join(" / ")}`);
  }
  return <span>{parts.join("  ·  ")}</span>;
}

function SegmentEditor({
  segment,
  tags,
  onSave,
  onClose,
}: {
  segment: Segment | null;
  tags: Tag[];
  onSave: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(segment?.name ?? "");
  const [description, setDescription] = useState(segment?.description ?? "");
  const [tagIds, setTagIds] = useState<string[]>(segment?.filterJson.tagIds ?? []);
  const [statuses, setStatuses] = useState<string[]>(
    segment?.filterJson.statuses ?? ["active"],
  );
  const [sources, setSources] = useState<string>(
    (segment?.filterJson.sources ?? []).join(", "),
  );
  const [saving, setSaving] = useState(false);

  function toggleSet<T>(set: T[], v: T): T[] {
    return set.includes(v) ? set.filter((x) => x !== v) : [...set, v];
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    const filterJson = {
      tagIds,
      statuses,
      sources: sources
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const payload = { name: name.trim(), description, filterJson };
    if (segment) {
      await fetch(`/api/segments/${segment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setSaving(false);
    onSave();
  }

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
          width: "min(640px, 100%)",
          maxHeight: "90vh",
          background: "var(--rex-bg)",
        }}
      >
        <header
          className="flex items-center justify-between p-5 border-b"
          style={{ borderColor: "var(--rex-border-subtle)" }}
        >
          <h2 className="font-display text-xl text-white">
            {segment ? "Edit segment" : "New segment"}
          </h2>
          <button
            onClick={onClose}
            className="text-xs hover:text-white"
            style={{ color: "var(--rex-text-dim)" }}
          >
            ✕ Close
          </button>
        </header>

        <div className="overflow-y-auto p-5 flex-1 space-y-4">
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
              placeholder="e.g. compliance-buyers"
            />
          </div>
          <div>
            <label
              className="block text-xs uppercase tracking-wider mb-1.5"
              style={{ color: "var(--rex-text-muted)" }}
            >
              Description
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rex-input"
              placeholder="What's in this audience?"
            />
          </div>

          <div>
            <label
              className="block text-xs uppercase tracking-wider mb-1.5"
              style={{ color: "var(--rex-text-muted)" }}
            >
              Tags (intersect — subscriber must have ALL)
            </label>
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => {
                const on = tagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTagIds((s) => toggleSet(s, t.id))}
                    className="px-2.5 py-1 rounded-full text-xs border"
                    style={{
                      borderColor: on ? "var(--rex-accent)" : "var(--rex-border)",
                      background: on ? "rgba(95,185,31,0.12)" : "transparent",
                      color: on
                        ? "var(--rex-accent)"
                        : "var(--rex-text-muted)",
                    }}
                  >
                    {on ? "✓ " : ""}
                    {t.name}{" "}
                    <span style={{ opacity: 0.6 }}>({t.subscriberCount})</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label
              className="block text-xs uppercase tracking-wider mb-1.5"
              style={{ color: "var(--rex-text-muted)" }}
            >
              Status (union — any of these qualify)
            </label>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((st) => {
                const on = statuses.includes(st);
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatuses((s) => toggleSet(s, st))}
                    className="px-2.5 py-1 rounded-full text-xs border"
                    style={{
                      borderColor: on
                        ? "var(--rex-accent-2)"
                        : "var(--rex-border)",
                      background: on
                        ? "rgba(31,168,224,0.12)"
                        : "transparent",
                      color: on
                        ? "var(--rex-accent-2)"
                        : "var(--rex-text-muted)",
                    }}
                  >
                    {on ? "✓ " : ""}
                    {st}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label
              className="block text-xs uppercase tracking-wider mb-1.5"
              style={{ color: "var(--rex-text-muted)" }}
            >
              Sources (comma-separated; leave empty for any)
            </label>
            <input
              value={sources}
              onChange={(e) => setSources(e.target.value)}
              className="rex-input"
              placeholder="landing_page, import_2026_05, api"
            />
          </div>
        </div>

        <footer
          className="p-4 border-t flex justify-end gap-2"
          style={{ borderColor: "var(--rex-border-subtle)" }}
        >
          <button onClick={onClose} className="rex-btn-ghost text-sm">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="rex-btn"
          >
            {saving ? "Saving…" : segment ? "Save changes" : "Create segment"}
          </button>
        </footer>
      </div>
    </div>
  );
}
