"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PublicShell } from "@/components/public-shell";
import { Turnstile } from "@/components/turnstile";
import {
  PERSONA_SLUGS,
  PERSONA_LABELS,
  type PersonaSlug,
} from "@/lib/personas";

const TURNSTILE_ENABLED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

/**
 * Tokenized edit form. Loads the existing submission via GET, presents the
 * most-commonly-edited fields per submission type as controlled inputs, and
 * POSTs the merged payload back. Less-frequently-edited fields (tags,
 * tracks, sponsors, addresses) are preserved as-is from the loaded payload
 * so they don't get blown away on save.
 *
 * Out of scope for v1: rich array/tag editing — submitters can email if
 * they need to change those, and the admin can edit in the moderation UI.
 */

type LoadedSubmission = {
  id: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
  submitterHandle: string | null;
  publicId: string;
  editToken: string;
};

const SURFACE_LABEL: Record<string, string> = {
  event: "event",
  popup_city: "pop-up city",
  hackathon: "hackathon",
  grant: "grant program",
  accelerator: "accelerator",
  job: "job posting",
  intel: "intel submission",
};

const PUBLIC_PATH: Record<string, (publicId: string) => string> = {
  event: (id) => `/events/${id}`,
  popup_city: (id) => `/pop-up-cities/${id}`,
  hackathon: (id) => `/events/${id}`, // hackathons live as event rows
  grant: (id) => `/grants/${id}`,
  accelerator: (id) => `/accelerators/${id}`,
  job: (id) => `/jobs/${id}`,
  intel: (id) => `/intel/${id}`,
};

export default function EditForm({ token }: { token: string }) {
  const [loaded, setLoaded] = useState<LoadedSubmission | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  // Intel-only side-state. FIELD_DEFS doesn't model multi-selects, so we
  // keep personas out of the generic field map and patch them onto the
  // merged payload at save time. Non-intel types ignore this state.
  const [personas, setPersonas] = useState<PersonaSlug[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/submissions/edit/${token}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data.error ?? "Couldn't load this submission.");
          return;
        }
        const sub = data.submission as LoadedSubmission;
        setLoaded(sub);
        setFields(initialFields(sub.type, sub.payload));
        if (sub.type === "intel") {
          const raw = sub.payload.personas;
          if (Array.isArray(raw)) {
            setPersonas(
              raw.filter((p): p is PersonaSlug =>
                (PERSONA_SLUGS as readonly string[]).includes(p as string),
              ),
            );
          } else {
            setPersonas([]);
          }
        }
      } catch {
        if (!cancelled) setLoadError("Couldn't reach the server.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function update(key: string, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setSavedAt(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!loaded) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Merge the edited fields back into the original payload so anything
      // we don't expose (tags, sponsors, etc.) survives untouched.
      const nextPayload = mergePayload(loaded.type, loaded.payload, fields);
      if (loaded.type === "intel") {
        nextPayload.personas = personas.length ? personas : undefined;
      }
      const res = await fetch(`/api/submissions/edit/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: nextPayload, turnstileToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Save failed.");
        return;
      }
      setSavedAt(new Date());
      // Update the loaded payload so subsequent edits start from the saved state.
      setLoaded({ ...loaded, payload: nextPayload });
      // Captcha tokens are single-use — reset so a follow-up edit prompts a
      // fresh solve. Turnstile auto-renders the next widget on remount.
      setTurnstileToken("");
    } catch {
      setSaveError("Channel disrupted. Retry.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <PublicShell
        classification={[{ text: "● No Signal // Edit Link Invalid" }]}
      >
        <main className="max-w-xl mx-auto px-6 pt-16 md:pt-24 pb-24 text-center">
          <h1 className="font-display text-3xl text-[var(--rex-text)] mb-3">
            Edit link not valid.
          </h1>
          <p className="text-sm text-[var(--rex-text-muted)] mb-6">{loadError}</p>
          <Link href="/" className="rex-btn">
            Return to Briefing Room ▸
          </Link>
        </main>
      </PublicShell>
    );
  }

  if (!loaded) {
    return (
      <PublicShell classification={[{ text: "● Loading // Edit Channel" }]}>
        <main className="max-w-xl mx-auto px-6 pt-16 text-center">
          <p
            className="text-xs font-mono uppercase tracking-widest"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Loading submission…
          </p>
        </main>
      </PublicShell>
    );
  }

  const label = SURFACE_LABEL[loaded.type] ?? "submission";
  const publicHref = PUBLIC_PATH[loaded.type]?.(loaded.publicId);
  const fieldDefs = FIELD_DEFS[loaded.type] ?? [];
  // Intel has no FIELD_DEFS row today (the full intel body lives behind the
  // moderation UI), but we still want the form to be saveable for the
  // personas widget alone.
  const intelOnlyEditable = loaded.type === "intel";
  const hasEditableSurface = fieldDefs.length > 0 || intelOnlyEditable;

  return (
    <PublicShell
      classification={[
        { text: "● Secure Channel // Edit Submission" },
        { text: loaded.status.toUpperCase(), show: "sm" },
      ]}
    >
      <main className="max-w-2xl mx-auto px-6 pt-8 md:pt-12 pb-24">
        <div className="mb-6">
          <p
            className="text-xs uppercase tracking-widest mb-2"
            style={{ color: "var(--rex-text-dim)" }}
          >
            ▸ Editing your {label}
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-[var(--rex-text)] mb-2">
            {String(loaded.payload.name ?? loaded.payload.title ?? loaded.payload.headline ?? "Submission")}
          </h1>
          <p className="text-xs font-mono" style={{ color: "var(--rex-text-dim)" }}>
            Status:{" "}
            <span className="text-[var(--rex-accent)]">{loaded.status}</span>
            {publicHref && loaded.status === "approved" && (
              <>
                {" · "}
                <Link
                  href={publicHref}
                  className="text-[var(--rex-accent)] hover:underline"
                >
                  view public listing
                </Link>
              </>
            )}
          </p>
        </div>

        <form onSubmit={handleSave} className="rex-card p-6 space-y-4">
          {!hasEditableSurface ? (
            <p className="text-sm text-[var(--rex-text-muted)]">
              This submission type isn&apos;t editable here. Email an analyst
              and they&apos;ll update it for you.
            </p>
          ) : (
            <>
              {fieldDefs.map((f) => (
                <FieldRow
                  key={f.key}
                  def={f}
                  value={fields[f.key] ?? ""}
                  onChange={(v) => update(f.key, v)}
                />
              ))}

              {intelOnlyEditable && (
                <PersonaPicker
                  selected={personas}
                  onToggle={(slug) => {
                    setPersonas((cur) =>
                      cur.includes(slug)
                        ? cur.filter((s) => s !== slug)
                        : [...cur, slug],
                    );
                    setSavedAt(null);
                  }}
                />
              )}
            </>
          )}

          {hasEditableSurface && TURNSTILE_ENABLED && (
            <Turnstile onToken={setTurnstileToken} className="pt-2" />
          )}

          {hasEditableSurface && (
            <div className="flex items-center justify-between pt-2 border-t border-[var(--rex-border-subtle)]">
              <div className="text-[10px] font-mono" style={{ color: "var(--rex-text-dim)" }}>
                {savedAt ? (
                  <span className="text-[var(--rex-accent)]">
                    ✓ Saved {savedAt.toLocaleTimeString()}
                  </span>
                ) : (
                  "Changes save when you click Update."
                )}
              </div>
              <button
                type="submit"
                disabled={saving || (TURNSTILE_ENABLED && !turnstileToken)}
                className="rex-btn"
              >
                {saving ? "Saving…" : "Update ▸"}
              </button>
            </div>
          )}

          {saveError && (
            <p className="text-xs font-mono text-[var(--rex-danger)]">✕ {saveError}</p>
          )}
        </form>
      </main>
    </PublicShell>
  );
}

// ─── Field definitions per type ───────────────────────────────────────

type FieldKind = "text" | "textarea" | "url" | "datetime" | "number";

type FieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  maxLength?: number;
  rows?: number;
};

// Most-commonly-edited fields per type. The save merges these back into the
// loaded payload so non-listed fields survive intact.
const FIELD_DEFS: Record<string, FieldDef[]> = {
  event: [
    { key: "name", label: "Event Name", kind: "text", required: true, maxLength: 200 },
    { key: "startsAt", label: "Starts", kind: "datetime", required: true },
    { key: "endsAt", label: "Ends (opt.)", kind: "datetime" },
    { key: "venue", label: "Venue (opt.)", kind: "text", maxLength: 200 },
    { key: "city", label: "City", kind: "text", maxLength: 100 },
    { key: "country", label: "Country", kind: "text", maxLength: 100 },
    { key: "url", label: "Event URL", kind: "url" },
    { key: "prizeUsd", label: "Prize Pool USD — hackathons only (opt.)", kind: "number" },
    { key: "registrationDeadline", label: "Registration Deadline — hackathons only (opt.)", kind: "datetime" },
    { key: "description", label: "Description", kind: "textarea", maxLength: 1000, rows: 4 },
  ],
  popup_city: [
    { key: "name", label: "Name", kind: "text", required: true, maxLength: 200 },
    { key: "startsAt", label: "Starts", kind: "datetime", required: true },
    { key: "endsAt", label: "Ends", kind: "datetime", required: true },
    { key: "city", label: "City", kind: "text", maxLength: 100 },
    { key: "country", label: "Country", kind: "text", maxLength: 100 },
    { key: "venue", label: "Venue (opt.)", kind: "text", maxLength: 200 },
    { key: "url", label: "Event URL", kind: "url" },
    { key: "applyUrl", label: "Apply URL", kind: "url" },
    { key: "applicationDeadline", label: "Application Deadline (opt.)", kind: "datetime" },
    { key: "focus", label: "Focus (opt.)", kind: "text", maxLength: 200 },
    { key: "description", label: "Description", kind: "textarea", maxLength: 5000, rows: 5 },
  ],
  hackathon: [
    { key: "name", label: "Hackathon Name", kind: "text", required: true, maxLength: 200 },
    { key: "startsAt", label: "Starts", kind: "datetime", required: true },
    { key: "endsAt", label: "Ends", kind: "datetime", required: true },
    { key: "city", label: "City (opt.)", kind: "text", maxLength: 100 },
    { key: "country", label: "Country (opt.)", kind: "text", maxLength: 100 },
    { key: "url", label: "Event URL", kind: "url" },
    { key: "registrationUrl", label: "Register URL", kind: "url" },
    { key: "registrationDeadline", label: "Registration Deadline (opt.)", kind: "datetime" },
    { key: "prizePool", label: "Prize Pool (opt.)", kind: "text", maxLength: 200 },
    { key: "description", label: "Description", kind: "textarea", maxLength: 5000, rows: 5 },
  ],
  grant: [
    { key: "name", label: "Grant Name", kind: "text", required: true, maxLength: 200 },
    { key: "organization", label: "Organization", kind: "text", required: true, maxLength: 120 },
    { key: "organizationUrl", label: "Organization URL", kind: "url" },
    { key: "amount", label: "Amount (opt.)", kind: "text", maxLength: 200 },
    { key: "focus", label: "Focus (opt.)", kind: "text", maxLength: 200 },
    { key: "applyUrl", label: "Apply URL", kind: "url" },
    { key: "deadline", label: "Deadline (opt.)", kind: "datetime" },
    { key: "description", label: "Description", kind: "textarea", maxLength: 5000, rows: 5 },
  ],
  accelerator: [
    { key: "name", label: "Program Name", kind: "text", required: true, maxLength: 200 },
    { key: "organization", label: "Organization", kind: "text", required: true, maxLength: 120 },
    { key: "organizationUrl", label: "Organization URL", kind: "url" },
    { key: "duration", label: "Duration (opt.)", kind: "text", maxLength: 100 },
    { key: "investment", label: "Investment (opt.)", kind: "text", maxLength: 200 },
    { key: "location", label: "Location (opt.)", kind: "text", maxLength: 200 },
    { key: "focus", label: "Focus (opt.)", kind: "text", maxLength: 200 },
    { key: "applyUrl", label: "Apply URL", kind: "url" },
    { key: "nextDeadline", label: "Next Deadline (opt.)", kind: "datetime" },
    { key: "description", label: "Description", kind: "textarea", maxLength: 5000, rows: 5 },
  ],
  job: [
    { key: "title", label: "Role Title", kind: "text", required: true, maxLength: 200 },
    { key: "company", label: "Company", kind: "text", required: true, maxLength: 120 },
    { key: "companyUrl", label: "Company URL", kind: "url" },
    { key: "location", label: "Location (opt.)", kind: "text", maxLength: 200 },
    { key: "compensation", label: "Compensation (opt.)", kind: "text", maxLength: 200 },
    { key: "applyUrl", label: "Apply URL", kind: "url" },
    { key: "description", label: "Description", kind: "textarea", maxLength: 5000, rows: 5 },
  ],
};

function initialFields(
  type: string,
  payload: Record<string, unknown>,
): Record<string, string> {
  const defs = FIELD_DEFS[type] ?? [];
  const out: Record<string, string> = {};
  for (const def of defs) {
    const raw = payload[def.key];
    if (def.kind === "datetime") {
      out[def.key] = typeof raw === "string" ? isoToDatetimeLocal(raw) : "";
    } else if (def.kind === "number") {
      out[def.key] = typeof raw === "number" ? String(raw) : "";
    } else {
      out[def.key] = typeof raw === "string" ? raw : "";
    }
  }
  return out;
}

/**
 * Merge the edited fields back into the loaded payload. Fields not in
 * FIELD_DEFS keep their existing values. Date fields convert from local
 * datetime back to ISO UTC.
 */
function mergePayload(
  type: string,
  base: Record<string, unknown>,
  fields: Record<string, string>,
): Record<string, unknown> {
  const defs = FIELD_DEFS[type] ?? [];
  const out: Record<string, unknown> = { ...base };
  for (const def of defs) {
    const v = fields[def.key] ?? "";
    if (def.kind === "datetime") {
      out[def.key] = v ? new Date(v).toISOString() : undefined;
    } else if (def.kind === "url") {
      out[def.key] = v.trim() || undefined;
    } else if (def.kind === "number") {
      const trimmed = v.replace(/[,_$\s]/g, "");
      const n = trimmed ? Number(trimmed) : NaN;
      out[def.key] = Number.isFinite(n) && n >= 0 ? n : undefined;
    } else {
      const trimmed = v.trim();
      // Required fields stay as empty strings so the server validator
      // gives a clean error; optional fields drop to undefined.
      out[def.key] = def.required ? trimmed : trimmed || undefined;
    }
  }
  return out;
}

function FieldRow({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const label = (
    <label
      className="block mb-1.5 text-[10px] font-mono uppercase tracking-widest"
      style={{ color: "var(--rex-text-dim)" }}
    >
      {def.label}
    </label>
  );
  if (def.kind === "textarea") {
    return (
      <div>
        {label}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={def.required}
          maxLength={def.maxLength}
          rows={def.rows ?? 3}
          className="rex-input w-full resize-y"
        />
      </div>
    );
  }
  const inputType =
    def.kind === "datetime"
      ? "datetime-local"
      : def.kind === "url"
        ? "url"
        : def.kind === "number"
          ? "number"
          : "text";
  return (
    <div>
      {label}
      <input
        type={inputType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={def.required}
        maxLength={def.maxLength}
        className={`rex-input w-full ${def.kind === "url" ? "font-mono text-xs" : ""}`}
      />
    </div>
  );
}

function PersonaPicker({
  selected,
  onToggle,
}: {
  selected: PersonaSlug[];
  onToggle: (slug: PersonaSlug) => void;
}) {
  return (
    <div>
      <label
        className="block mb-1.5 text-[10px] font-mono uppercase tracking-widest"
        style={{ color: "var(--rex-text-dim)" }}
      >
        Personas
      </label>
      <div className="flex flex-wrap gap-1.5">
        {PERSONA_SLUGS.map((slug) => {
          const active = selected.includes(slug);
          return (
            <button
              key={slug}
              type="button"
              onClick={() => onToggle(slug)}
              className={`text-[11px] font-mono uppercase tracking-wider px-2 py-1 rounded-sm border transition-colors ${
                active
                  ? "border-[var(--rex-accent)] bg-[rgba(95,185,31,0.08)] text-[var(--rex-text)]"
                  : "border-[var(--rex-border-subtle)] text-[var(--rex-text-dim)] hover:border-[var(--rex-border)]"
              }`}
            >
              {PERSONA_LABELS[slug]}
            </button>
          );
        })}
      </div>
      <p
        className="mt-1.5 text-[10px] font-mono"
        style={{ color: "var(--rex-text-dim)" }}
      >
        Routes the weekly digest. Empty = all readers.
      </p>
    </div>
  );
}

function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
