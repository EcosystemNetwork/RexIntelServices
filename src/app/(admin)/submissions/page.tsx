"use client";

import { useEffect, useState, useCallback } from "react";
import type { Submission, IntelPayload, EventPayload } from "@/lib/db/schema";

type StatusFilter = "pending" | "approved" | "rejected" | "spam";
type TypeFilter =
  | "all"
  | "intel"
  | "event"
  | "hackathon"
  | "popup_city"
  | "grant"
  | "accelerator"
  | "job";

// Order + display labels for the type filter row. Keep this list aligned
// with the submission_type enum + public surface routes.
const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "intel", label: "Intel" },
  { key: "event", label: "Events" },
  { key: "hackathon", label: "Hacks" },
  { key: "popup_city", label: "Cities" },
  { key: "grant", label: "Grants" },
  { key: "accelerator", label: "Accel" },
  { key: "job", label: "Jobs" },
];

// Public listing path for a submission type — used by the "view" link on
// approved rows so a moderator can open the live listing in one click.
const PUBLIC_PATH: Record<string, (publicId: string) => string> = {
  intel: (id) => `/intel/${id}`,
  event: (id) => `/events/${id}`,
  hackathon: (id) => `/events/${id}`, // hackathons share the event detail page
  popup_city: (id) => `/pop-up-cities/${id}`,
  grant: (id) => `/grants/${id}`,
  accelerator: (id) => `/accelerators/${id}`,
  job: (id) => `/jobs/${id}`,
};

type Counts = {
  pending: number;
  approved: number;
  rejected: number;
  spam: number;
};

export default function SubmissionsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [rows, setRows] = useState<Submission[]>([]);
  const [counts, setCounts] = useState<Counts>({
    pending: 0,
    approved: 0,
    rejected: 0,
    spam: 0,
  });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Set of submission ids currently in flight, so the UI can disable their
  // action buttons and ignore double-clicks. Multiple rows can be reviewed
  // concurrently (rare, but possible) so we track per-id rather than a single
  // boolean.
  const [reviewing, setReviewing] = useState<Set<string>>(new Set());
  // Bulk selection — only meaningful when statusFilter is "pending" since
  // that's the only state with actionable rows. We auto-clear on view
  // change so the selection never targets the wrong page of rows.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ status: statusFilter });
    if (typeFilter !== "all") params.set("type", typeFilter);
    const res = await fetch(`/api/submissions?${params}`);
    const data = await res.json();
    setRows(data.submissions ?? []);
    setCounts(data.counts ?? { pending: 0, approved: 0, rejected: 0, spam: 0 });
    setLoading(false);
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    fetchData();
    // Reset bulk selection when the visible row set changes. Otherwise a
    // moderator who selected items then switched filters could trigger a
    // bulk action on rows they can't see.
    setSelected(new Set());
  }, [fetchData]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkReview(action: "approve" | "reject" | "spam") {
    if (selected.size === 0 || bulkBusy) return;
    const label = action === "approve" ? "approve" : action === "reject" ? "reject" : "mark as spam";
    const cap = label.charAt(0).toUpperCase() + label.slice(1);
    if (!confirm(`${cap} ${selected.size} submission${selected.size === 1 ? "" : "s"}?`)) {
      return;
    }
    setBulkBusy(true);
    try {
      const res = await fetch("/api/submissions/bulk-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), action }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Bulk action failed.");
      } else {
        setSelected(new Set());
        await fetchData();
      }
    } finally {
      setBulkBusy(false);
    }
  }

  async function review(id: string, action: "approve" | "reject" | "spam") {
    if (reviewing.has(id)) return;
    setReviewing((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/submissions/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setExpandedId(null);
        await fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Review failed");
      }
    } finally {
      setReviewing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  // Optimistic pin/unpin so the row's badge flips instantly. Server is the
  // source of truth — on error we revert + alert.
  async function toggleFeatured(id: string, next: boolean) {
    if (reviewing.has(id)) return;
    setReviewing((prev) => new Set(prev).add(id));
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, featured: next } : r)),
    );
    try {
      const res = await fetch(`/api/submissions/${id}/feature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured: next }),
      });
      if (!res.ok) {
        // Revert + surface error
        setRows((prev) =>
          prev.map((r) => (r.id === id ? { ...r, featured: !next } : r)),
        );
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Could not update featured flag");
      }
    } finally {
      setReviewing((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  }

  return (
    <div className="p-10 max-w-6xl">
      <header className="mb-8">
        <p
          className="text-xs uppercase tracking-widest mb-1"
          style={{ color: "var(--rex-text-dim)" }}
        >
          Moderation Queue
        </p>
        <h1 className="font-display text-4xl font-medium text-white">
          Submissions
        </h1>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatPill
          label="Pending"
          value={counts.pending}
          active={statusFilter === "pending"}
          accent
          onClick={() => setStatusFilter("pending")}
        />
        <StatPill
          label="Approved"
          value={counts.approved}
          active={statusFilter === "approved"}
          onClick={() => setStatusFilter("approved")}
        />
        <StatPill
          label="Rejected"
          value={counts.rejected}
          active={statusFilter === "rejected"}
          onClick={() => setStatusFilter("rejected")}
        />
        <StatPill
          label="Spam"
          value={counts.spam}
          active={statusFilter === "spam"}
          onClick={() => setStatusFilter("spam")}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4 text-xs font-mono">
        <span style={{ color: "var(--rex-text-dim)" }}>FILTER ▸</span>
        {TYPE_FILTERS.map((f) => (
          <FilterChip
            key={f.key}
            active={typeFilter === f.key}
            onClick={() => setTypeFilter(f.key)}
          >
            {f.label}
          </FilterChip>
        ))}
      </div>

      {statusFilter === "pending" && selected.size > 0 && (
        <div
          className="mb-4 flex items-center gap-2 p-3 rounded-sm border"
          style={{
            borderColor: "var(--rex-accent)",
            background: "rgba(95,185,31,0.06)",
          }}
        >
          <span className="text-[11px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
            {selected.size} selected ▸
          </span>
          <button
            type="button"
            onClick={() => bulkReview("approve")}
            disabled={bulkBusy}
            className="rex-btn"
            style={{ opacity: bulkBusy ? 0.5 : 1 }}
          >
            Approve all
          </button>
          <button
            type="button"
            onClick={() => bulkReview("reject")}
            disabled={bulkBusy}
            className="rex-btn"
            style={{ opacity: bulkBusy ? 0.5 : 1 }}
          >
            Reject all
          </button>
          <button
            type="button"
            onClick={() => bulkReview("spam")}
            disabled={bulkBusy}
            className="rex-btn"
            style={{
              borderColor: "var(--rex-danger)",
              color: "var(--rex-danger)",
              opacity: bulkBusy ? 0.5 : 1,
            }}
          >
            Mark spam
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            disabled={bulkBusy}
            className="ml-auto text-[11px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] hover:text-white transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {loading ? (
        <div
          className="border border-dashed rounded-lg p-12 text-center"
          style={{
            borderColor: "var(--rex-border)",
            color: "var(--rex-text-dim)",
          }}
        >
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div
          className="border border-dashed rounded-lg p-12 text-center bg-grid"
          style={{
            borderColor: "var(--rex-border)",
            color: "var(--rex-text-dim)",
          }}
        >
          No submissions in this view.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((s) => (
            <SubmissionRow
              key={s.id}
              submission={s}
              expanded={expandedId === s.id}
              busy={reviewing.has(s.id)}
              selectable={statusFilter === "pending"}
              selected={selected.has(s.id)}
              onToggle={() =>
                setExpandedId(expandedId === s.id ? null : s.id)
              }
              onToggleSelected={() => toggleSelected(s.id)}
              onReview={(action) => review(s.id, action)}
              onToggleFeatured={(next) => toggleFeatured(s.id, next)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatPill({
  label,
  value,
  active,
  accent,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rex-stat ${accent ? "accent" : ""} text-left transition-all`}
      style={{
        opacity: active ? 1 : 0.55,
        outline: active ? "1px solid var(--rex-accent)" : "none",
      }}
    >
      <div className="rex-stat-label">{label}</div>
      <div className="rex-stat-value">{value.toLocaleString()}</div>
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-sm uppercase tracking-widest transition-all"
      style={{
        background: active ? "var(--rex-bg)" : "transparent",
        color: active ? "var(--rex-accent)" : "var(--rex-text-dim)",
        border: `1px solid ${active ? "var(--rex-accent)" : "var(--rex-border-subtle)"}`,
      }}
    >
      {children}
    </button>
  );
}

function SubmissionRow({
  submission,
  expanded,
  busy,
  selectable,
  selected,
  onToggle,
  onToggleSelected,
  onReview,
  onToggleFeatured,
}: {
  submission: Submission;
  expanded: boolean;
  busy: boolean;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
  onToggleSelected: () => void;
  onReview: (action: "approve" | "reject" | "spam") => void;
  onToggleFeatured: (next: boolean) => void;
}) {
  const headline =
    submission.type === "intel"
      ? (submission.payload as IntelPayload).headline
      : (submission.payload as EventPayload).name;

  const created = new Date(submission.createdAt).toLocaleString();
  const isPending = submission.status === "pending";
  const isApproved = submission.status === "approved";
  // Intel doesn't sort by `featured` anywhere public, so hide the toggle
  // there — keeps the admin row uncluttered for the high-volume type.
  const canFeature = isApproved && submission.type !== "intel";

  return (
    <div className="rex-card overflow-hidden">
      {selectable && (
        <button
          type="button"
          onClick={(e) => {
            // Clicking the checkbox shouldn't toggle the row expansion.
            e.stopPropagation();
            onToggleSelected();
          }}
          aria-label={selected ? "Deselect" : "Select"}
          className="px-4 self-stretch flex items-center"
          style={{
            background: selected ? "rgba(95,185,31,0.06)" : "transparent",
            borderRight: "1px solid var(--rex-border-subtle)",
          }}
        >
          <span
            className="inline-flex items-center justify-center w-4 h-4 rounded-sm border"
            style={{
              borderColor: selected ? "var(--rex-accent)" : "var(--rex-border)",
              background: selected ? "var(--rex-accent)" : "transparent",
              color: "var(--rex-bg)",
              fontSize: 10,
              lineHeight: 1,
            }}
          >
            {selected ? "✓" : ""}
          </span>
        </button>
      )}
      <button
        onClick={onToggle}
        className="w-full text-left p-4 flex items-center gap-4 hover:bg-[var(--rex-surface-2)] transition-colors"
      >
        <span
          className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-sm"
          style={{
            background:
              submission.type === "intel"
                ? "rgba(95,185,31,0.1)"
                : "rgba(120,140,255,0.1)",
            color:
              submission.type === "intel"
                ? "var(--rex-accent)"
                : "var(--rex-accent-2)",
            border: `1px solid ${
              submission.type === "intel"
                ? "rgba(95,185,31,0.3)"
                : "rgba(120,140,255,0.3)"
            }`,
          }}
        >
          {submission.type}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-white text-sm font-medium truncate">
            {headline}
          </div>
          <div
            className="text-xs mt-0.5 font-mono"
            style={{ color: "var(--rex-text-dim)" }}
          >
            {created}
            {submission.submitterHandle &&
              ` · @${submission.submitterHandle}`}
            {submission.honeypotTripped && " · 🚫 honeypot"}
          </div>
        </div>
        {canFeature && (
          <button
            type="button"
            onClick={(e) => {
              // Don't toggle the row open/closed when clicking the star.
              e.stopPropagation();
              onToggleFeatured(!submission.featured);
            }}
            disabled={busy}
            title={submission.featured ? "Unpin from top of board" : "Pin to top of board"}
            aria-label={submission.featured ? "Unfeature" : "Feature"}
            className="text-base leading-none px-2 py-1 rounded-sm transition-colors"
            style={{
              color: submission.featured
                ? "var(--rex-accent)"
                : "var(--rex-text-dim)",
              opacity: busy ? 0.4 : 1,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {submission.featured ? "★" : "☆"}
          </button>
        )}
        <span
          className="text-xs font-mono"
          style={{ color: "var(--rex-text-dim)" }}
        >
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded && (
        <div
          className="p-5 border-t"
          style={{ borderColor: "var(--rex-border-subtle)" }}
        >
          {/* Per-type detail views. Intel and event have richly-formatted
              renderers; the other types (popup_city, hackathon, grant,
              accelerator, job) get a generic key/value fallback that
              walks the JSON payload — readable without bespoke layouts. */}
          {submission.type === "intel" ? (
            <IntelDetail payload={submission.payload as IntelPayload} />
          ) : submission.type === "event" ? (
            <EventDetail payload={submission.payload as EventPayload} />
          ) : (
            <GenericPayloadDetail
              payload={submission.payload as Record<string, unknown>}
            />
          )}

          <div
            className="mt-4 pt-4 border-t text-[11px] font-mono space-y-1"
            style={{
              borderColor: "var(--rex-border-subtle)",
              color: "var(--rex-text-dim)",
            }}
          >
            {submission.submitterEmail && (
              <div>
                Email: <span className="text-white">{submission.submitterEmail}</span>
              </div>
            )}
            {submission.ipAddress && <div>IP: {submission.ipAddress}</div>}
            {submission.userAgent && (
              <div className="truncate">UA: {submission.userAgent}</div>
            )}
          </div>

          {isApproved && PUBLIC_PATH[submission.type] && (
            <div className="mt-4 flex items-center gap-3 text-[11px] font-mono">
              <a
                href={PUBLIC_PATH[submission.type](submission.publicId)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--rex-accent)] hover:text-white transition-colors"
              >
                View public listing ▸
              </a>
              <span style={{ color: "var(--rex-border)" }}>│</span>
              <a
                href={`/submit/edit/${submission.editToken}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--rex-text-dim)" }}
                className="hover:text-[var(--rex-accent)] transition-colors"
              >
                Edit-as-submitter link ▸
              </a>
            </div>
          )}

          {isPending && (
            <div className="mt-5 flex items-center gap-2">
              <button
                onClick={() => onReview("approve")}
                disabled={busy}
                className="rex-btn"
                style={{
                  background: "var(--rex-accent)",
                  borderColor: "var(--rex-accent)",
                  color: "var(--rex-bg)",
                  opacity: busy ? 0.5 : 1,
                  cursor: busy ? "wait" : undefined,
                }}
              >
                {busy ? "Working…" : "Approve ▸"}
              </button>
              <button
                onClick={() => onReview("reject")}
                disabled={busy}
                className="rex-btn"
                style={{ opacity: busy ? 0.5 : 1, cursor: busy ? "wait" : undefined }}
              >
                Reject
              </button>
              <button
                onClick={() => onReview("spam")}
                disabled={busy}
                className="rex-btn"
                style={{
                  borderColor: "var(--rex-danger)",
                  color: "var(--rex-danger)",
                  opacity: busy ? 0.5 : 1,
                  cursor: busy ? "wait" : undefined,
                }}
              >
                Mark Spam
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IntelDetail({ payload }: { payload: IntelPayload }) {
  return (
    <div className="space-y-3 text-sm">
      <div>
        <Field label="Headline">{payload.headline}</Field>
      </div>
      <div>
        <Field label="Body">
          <pre className="whitespace-pre-wrap font-sans text-sm text-[var(--rex-text-muted)]">
            {payload.body}
          </pre>
        </Field>
      </div>
      {(payload.severity || payload.category) && (
        <div className="flex gap-6">
          {payload.severity && (
            <Field label="Severity">{payload.severity}</Field>
          )}
          {payload.category && (
            <Field label="Category">{payload.category}</Field>
          )}
        </div>
      )}
      {payload.links?.length ? (
        <Field label="Links">
          <ul className="space-y-1 font-mono text-xs">
            {payload.links.map((l, i) => (
              <li key={i}>
                <a
                  href={l}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--rex-accent)] hover:underline break-all"
                >
                  {l}
                </a>
              </li>
            ))}
          </ul>
        </Field>
      ) : null}
      {payload.sources?.length ? (
        <Field label="Sources">
          <ul className="space-y-1 font-mono text-xs">
            {payload.sources.map((l, i) => (
              <li key={i} className="text-[var(--rex-text-muted)] break-all">
                {l}
              </li>
            ))}
          </ul>
        </Field>
      ) : null}
    </div>
  );
}

function EventDetail({ payload }: { payload: EventPayload }) {
  const start = new Date(payload.startsAt).toLocaleString();
  const end = payload.endsAt ? new Date(payload.endsAt).toLocaleString() : null;
  return (
    <div className="space-y-3 text-sm">
      <Field label="Event">{payload.name}</Field>
      <div className="flex gap-6">
        <Field label="Starts">{start}</Field>
        {end && <Field label="Ends">{end}</Field>}
      </div>
      {(payload.venue || payload.city || payload.country) && (
        <Field label="Location">
          {[payload.venue, payload.city, payload.country]
            .filter(Boolean)
            .join(", ")}
        </Field>
      )}
      {(payload.eventType || payload.priceTier) && (
        <div className="flex gap-6">
          {payload.eventType && (
            <Field label="Type">{payload.eventType}</Field>
          )}
          {payload.priceTier && (
            <Field label="Access">{payload.priceTier}</Field>
          )}
        </div>
      )}
      {payload.url && (
        <Field label="URL">
          <a
            href={payload.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--rex-accent)] hover:underline font-mono text-xs break-all"
          >
            {payload.url}
          </a>
        </Field>
      )}
      {payload.description && (
        <Field label="Description">
          <p className="text-[var(--rex-text-muted)]">{payload.description}</p>
        </Field>
      )}
    </div>
  );
}

/**
 * Generic payload detail — walks an arbitrary JSON object and prints each
 * field. Used for the resource types (popup_city, hackathon, grant,
 * accelerator, job) that don't have a bespoke renderer. Order-of-keys is
 * whatever the validator emits, which is intentional (the order matches
 * what a submitter sees in the form).
 */
function GenericPayloadDetail({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const entries = Object.entries(payload).filter(([, v]) => {
    if (v === undefined || v === null || v === "") return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  });
  return (
    <div className="space-y-3 text-sm">
      {entries.map(([k, v]) => (
        <Field key={k} label={formatLabel(k)}>
          {renderPayloadValue(v)}
        </Field>
      ))}
    </div>
  );
}

function renderPayloadValue(v: unknown): React.ReactNode {
  if (Array.isArray(v)) {
    return (
      <ul className="space-y-1 font-mono text-xs">
        {v.map((item, i) => (
          <li key={i} className="break-all text-[var(--rex-text-muted)]">
            {typeof item === "string" ? item : JSON.stringify(item)}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof v === "boolean") {
    return (
      <span className="font-mono text-xs">{v ? "true" : "false"}</span>
    );
  }
  const str = typeof v === "string" ? v : JSON.stringify(v);
  // URLs get rendered as clickable links so moderators can open them.
  if (typeof v === "string" && /^https?:\/\//.test(v)) {
    return (
      <a
        href={v}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--rex-accent)] hover:underline break-all font-mono text-xs"
      >
        {v}
      </a>
    );
  }
  return (
    <pre className="whitespace-pre-wrap font-sans text-sm text-[var(--rex-text-muted)]">
      {str}
    </pre>
  );
}

function formatLabel(key: string): string {
  // camelCase / snake_case → "Camel Case" / "Snake Case"
  return key
    .replace(/[_-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        className="text-[10px] font-mono uppercase tracking-widest mb-1"
        style={{ color: "var(--rex-text-dim)" }}
      >
        {label}
      </div>
      <div className="text-white">{children}</div>
    </div>
  );
}
