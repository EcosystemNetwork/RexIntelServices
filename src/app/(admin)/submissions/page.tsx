"use client";

import { useEffect, useState, useCallback } from "react";
import type { Submission, IntelPayload, EventPayload } from "@/lib/db/schema";

type StatusFilter = "pending" | "approved" | "rejected" | "spam";
type TypeFilter = "all" | "intel" | "event";

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
  }, [fetchData]);

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

      <div className="grid grid-cols-4 gap-4 mb-8">
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

      <div className="flex items-center gap-2 mb-4 text-xs font-mono">
        <span style={{ color: "var(--rex-text-dim)" }}>FILTER ▸</span>
        <FilterChip
          active={typeFilter === "all"}
          onClick={() => setTypeFilter("all")}
        >
          All
        </FilterChip>
        <FilterChip
          active={typeFilter === "intel"}
          onClick={() => setTypeFilter("intel")}
        >
          Intel
        </FilterChip>
        <FilterChip
          active={typeFilter === "event"}
          onClick={() => setTypeFilter("event")}
        >
          Events
        </FilterChip>
      </div>

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
              onToggle={() =>
                setExpandedId(expandedId === s.id ? null : s.id)
              }
              onReview={(action) => review(s.id, action)}
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
  onToggle,
  onReview,
}: {
  submission: Submission;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onReview: (action: "approve" | "reject" | "spam") => void;
}) {
  const headline =
    submission.type === "intel"
      ? (submission.payload as IntelPayload).headline
      : (submission.payload as EventPayload).name;

  const created = new Date(submission.createdAt).toLocaleString();
  const isPending = submission.status === "pending";

  return (
    <div className="rex-card overflow-hidden">
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
          {submission.type === "intel" ? (
            <IntelDetail payload={submission.payload as IntelPayload} />
          ) : (
            <EventDetail payload={submission.payload as EventPayload} />
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
