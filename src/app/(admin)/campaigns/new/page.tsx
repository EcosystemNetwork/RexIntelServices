"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { TEMPLATES, type NewsletterTemplate } from "@/lib/email/templates";
import type { TiptapNode } from "@/components/email-editor/serialize";
import { PreflightModal } from "./_components/preflight-modal";
import { TemplatePickerModal } from "./_components/template-picker-modal";
import { Field } from "./_components/field";

// Tiptap pulls ProseMirror + several extensions — keep it out of the
// composer's initial bundle so HTML-only campaign drafts don't pay for it.
const EmailEditor = dynamic(() => import("@/components/email-editor"), {
  ssr: false,
  loading: () => (
    <div
      className="text-sm p-4"
      style={{ color: "var(--rex-text-dim)" }}
    >
      Loading visual editor…
    </div>
  ),
});

interface Tag {
  id: string;
  name: string;
  subscriberCount: number;
}

interface Segment {
  id: string;
  name: string;
  description: string | null;
}

interface RecipientCount {
  count: number;
  activeTotal: number;
  excludedAlreadySent: number;
  excludedSuppressed: number;
}

const READONLY_STATUSES = new Set(["sending", "sent"]);

export default function CampaignComposerPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const initialId = sp.get("id");

  const [form, setForm] = useState({
    name: "",
    subject: "",
    fromName: "Rex Intel Services",
    fromEmail: "",
    replyTo: "",
    previewText: "",
    htmlBody: DEFAULT_BODY,
    targetTagIds: [] as string[],
    segmentId: "" as string,
    subjectB: "" as string,
    abSampleSize: 0 as number,
    abWinnerMetric: "open_rate" as "open_rate" | "click_rate",
  });
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  // Visual editor (Tiptap) vs raw HTML textarea. Visual is the default for
  // fresh drafts; HTML mode is the fallback when the body is a hand-written
  // template that the visual schema can't reconstruct.
  const [editorMode, setEditorMode] = useState<"visual" | "html">("html");
  const [bodyDoc, setBodyDoc] = useState<TiptapNode | null>(null);
  // Live send progress when the campaign is mid-flight. The async worker
  // increments sentCount tick-by-tick; we poll while status='sending'.
  const [progress, setProgress] = useState<{
    sentCount: number;
    recipientCount: number;
    status: string;
  } | null>(null);
  const [preflight, setPreflight] = useState<{
    ok: boolean;
    checks: Array<{
      id: string;
      label: string;
      severity: "ok" | "warn" | "block";
      message: string;
    }>;
    recipientCount: number;
  } | null>(null);
  const [showPreflight, setShowPreflight] = useState(false);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(initialId);
  const [campaignStatus, setCampaignStatus] = useState<string>("draft");
  const [busy, setBusy] = useState(false);
  const [sendResult, setSendResult] = useState<unknown>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<string>("");
  const [scheduleStatus, setScheduleStatus] = useState<
    "idle" | "scheduled" | "error"
  >("idle");
  const [tags, setTags] = useState<Tag[]>([]);
  const [segmentsList, setSegmentsList] = useState<Segment[]>([]);
  const [count, setCount] = useState<RecipientCount | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(!!initialId);

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const readonly = READONLY_STATUSES.has(campaignStatus);

  // Load tags + segments once
  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((d) => setTags(d.tags ?? []));
    fetch("/api/segments")
      .then((r) => r.json())
      .then((d) => setSegmentsList(d.segments ?? []));
  }, []);

  // Load existing campaign if ?id= is present
  useEffect(() => {
    if (!initialId) return;
    (async () => {
      const res = await fetch(`/api/campaigns/${initialId}`);
      if (!res.ok) {
        alert("could not load campaign");
        setLoadingExisting(false);
        return;
      }
      const { campaign } = await res.json();
      setForm({
        name: campaign.name,
        subject: campaign.subject,
        fromName: campaign.fromName,
        fromEmail: campaign.fromEmail,
        replyTo: campaign.replyTo ?? "",
        previewText: campaign.previewText ?? "",
        htmlBody: campaign.htmlBody,
        targetTagIds: campaign.targetTagIds ?? [],
        segmentId: campaign.segmentId ?? "",
        subjectB: campaign.subjectB ?? "",
        abSampleSize: campaign.abSampleSize ?? 0,
        abWinnerMetric: campaign.abWinnerMetric ?? "open_rate",
      });
      if (campaign.bodyDoc) {
        setBodyDoc(campaign.bodyDoc as TiptapNode);
        setEditorMode("visual");
      } else {
        setBodyDoc(null);
        setEditorMode("html");
      }
      setCampaignStatus(campaign.status);
      if (campaign.scheduledFor) {
        // datetime-local needs "YYYY-MM-DDTHH:mm" in local time
        const d = new Date(campaign.scheduledFor);
        const pad = (n: number) => String(n).padStart(2, "0");
        setScheduleAt(
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
        );
        if (campaign.status === "scheduled") setScheduleStatus("scheduled");
      }
      setLoadingExisting(false);
    })();
  }, [initialId]);

  // Poll the campaign while it's sending so the operator sees worker progress
  // tick-by-tick instead of watching a dead spinner. Stops the moment the
  // status transitions out of 'sending'.
  useEffect(() => {
    if (!campaignId || campaignStatus !== "sending") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (cancelled) return;
      if (!res.ok) return;
      const { campaign } = await res.json();
      setProgress({
        sentCount: campaign.sentCount ?? 0,
        recipientCount: campaign.recipientCount ?? 0,
        status: campaign.status,
      });
      if (campaign.status !== "sending") {
        setCampaignStatus(campaign.status);
        return;
      }
      timer = setTimeout(poll, 3000);
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [campaignId, campaignStatus]);

  // Refresh recipient count when the campaign exists or its tag-targeting changes
  useEffect(() => {
    if (!campaignId) {
      setCount(null);
      return;
    }
    setCountLoading(true);
    fetch(`/api/campaigns/${campaignId}/recipient-count`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setCount(null);
        else setCount(d);
      })
      .finally(() => setCountLoading(false));
  }, [campaignId, form.targetTagIds.join(",")]);

  async function persist(): Promise<string | null> {
    // Either create a draft (if no id yet) or PATCH the existing campaign.
    // bodyDoc rides alongside htmlBody — server treats htmlBody as the
    // source of truth at send time and bodyDoc as a round-trip aid for
    // re-opening the campaign in visual mode.
    const payload = { ...form, bodyDoc: editorMode === "visual" ? bodyDoc : null };
    if (campaignId) {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "save failed");
        return null;
      }
      return campaignId;
    }
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "save failed");
      return null;
    }
    setCampaignId(data.campaign.id);
    // Make subsequent navigations and reloads stay on this draft
    router.replace(`/campaigns/new?id=${data.campaign.id}`);
    return data.campaign.id;
  }

  async function saveDraft() {
    setBusy(true);
    await persist();
    setBusy(false);
  }

  async function openPreflight() {
    const id = campaignId ?? (await persist());
    if (!id) return;
    setPreflightLoading(true);
    setShowPreflight(true);
    const res = await fetch(`/api/campaigns/${id}/preflight`);
    const data = await res.json();
    setPreflight(data);
    setPreflightLoading(false);
  }

  async function send() {
    const id = campaignId ?? (await persist());
    if (!id) return;
    setShowPreflight(false);
    setBusy(true);
    const res = await fetch(`/api/campaigns/${id}/send`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    setSendResult(data);
    if (res.ok) {
      // Worker took the campaign. Flip local status to 'sending' so the
      // progress-polling effect spins up; stay on this page so the operator
      // watches sentCount climb instead of staring at the campaigns table.
      setCampaignStatus("sending");
      setProgress({
        sentCount: data.totalSent ?? 0,
        recipientCount: (data.totalSent ?? 0) + (data.remaining ?? 0),
        status: "sending",
      });
    }
  }

  async function schedule() {
    if (!scheduleAt) {
      setScheduleStatus("error");
      return;
    }
    const id = campaignId ?? (await persist());
    if (!id) return;

    setBusy(true);
    const iso = new Date(scheduleAt).toISOString();
    const res = await fetch(`/api/campaigns/${id}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledFor: iso }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      setScheduleStatus("scheduled");
      setCampaignStatus("scheduled");
      setSendResult({ scheduled: true, scheduledFor: iso, ...data });
    } else {
      setScheduleStatus("error");
      alert(data.error ?? "could not schedule");
    }
  }

  async function unschedule() {
    if (!campaignId) return;
    setBusy(true);
    const res = await fetch(`/api/campaigns/${campaignId}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledFor: null }),
    });
    setBusy(false);
    if (res.ok) {
      setScheduleStatus("idle");
      setCampaignStatus("draft");
      setScheduleAt("");
    }
  }

  async function sendTest() {
    setTestStatus(null);
    if (!testTo.trim()) {
      setTestStatus("Enter at least one email");
      return;
    }
    const id = campaignId ?? (await persist());
    if (!id) return;
    setBusy(true);
    const res = await fetch(`/api/campaigns/${id}/test-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: testTo
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    });
    const data = await res.json();
    setBusy(false);
    setTestStatus(
      res.ok ? `✓ Sent to ${data.sentTo?.join(", ")}` : `✗ ${data.error}`,
    );
  }

  async function duplicate() {
    if (!campaignId) {
      alert("Save the draft first");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/campaigns/${campaignId}/duplicate`, {
      method: "POST",
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      router.push(`/campaigns/new?id=${data.campaign.id}`);
    } else {
      alert(data.error ?? "duplicate failed");
    }
  }

  async function remove() {
    if (!campaignId) {
      router.push("/campaigns");
      return;
    }
    if (
      !confirm(
        "Delete this draft? This is permanent — already-sent campaigns can't be deleted.",
      )
    )
      return;
    setBusy(true);
    const res = await fetch(`/api/campaigns/${campaignId}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (res.ok) router.push("/campaigns");
    else {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "delete failed");
    }
  }

  function toggleTag(id: string) {
    setForm((f) => ({
      ...f,
      targetTagIds: f.targetTagIds.includes(id)
        ? f.targetTagIds.filter((x) => x !== id)
        : [...f.targetTagIds, id],
    }));
  }

  function applyTemplate(t: NewsletterTemplate) {
    // Replace the *body* unconditionally — the picker is an explicit user action.
    // Subject/previewText only overwrite when empty, so reopening the picker on a
    // half-edited draft doesn't blow away the subject line you just wrote.
    setForm((f) => ({
      ...f,
      htmlBody: t.htmlBody,
      subject: f.subject || t.subject,
      previewText: f.previewText || t.previewText,
    }));
    setAppliedTemplateId(t.id);
    setShowTemplatePicker(false);
  }

  function insertMergeTag(tag: "firstName" | "lastName" | "email") {
    const token = `{{${tag}}}`;
    const ta = bodyRef.current;
    if (!ta) {
      // No focus on the textarea — append at end.
      setForm((f) => ({ ...f, htmlBody: f.htmlBody + token }));
      return;
    }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const next = ta.value.slice(0, start) + token + ta.value.slice(end);
    setForm((f) => ({ ...f, htmlBody: next }));
    // Restore caret after the inserted token on next paint.
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  if (loadingExisting) {
    return (
      <div className="p-10" style={{ color: "var(--rex-text-dim)" }}>
        Loading…
      </div>
    );
  }

  return (
    <div className="p-10 max-w-6xl">
      <header className="mb-8 flex items-end justify-between flex-wrap gap-4">
        <div>
          <p
            className="text-xs uppercase tracking-widest mb-1"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Compose
          </p>
          <h1 className="font-display text-4xl font-medium text-white">
            {campaignId ? "Edit Campaign" : "New Campaign"}
          </h1>
          {campaignId && (
            <p
              className="text-xs mt-1 font-mono"
              style={{ color: "var(--rex-text-dim)" }}
            >
              <span className={`pill pill-${campaignStatus}`}>
                {campaignStatus}
              </span>
              <span className="ml-2">id: {campaignId.slice(0, 8)}…</span>
            </p>
          )}
        </div>
        {campaignId && (
          <div className="flex gap-2">
            <button
              onClick={duplicate}
              disabled={busy}
              className="rex-btn-ghost text-sm"
            >
              Duplicate
            </button>
            {!readonly && (
              <button
                onClick={remove}
                disabled={busy}
                className="rex-btn-ghost text-sm"
                style={{ color: "var(--rex-danger)" }}
              >
                Delete
              </button>
            )}
          </div>
        )}
      </header>

      {readonly && (
        <div
          className="mb-6 rounded-lg p-3 text-sm"
          style={{
            background:
              campaignStatus === "sending"
                ? "rgba(95,185,31,0.08)"
                : "rgba(251,191,36,0.08)",
            border:
              campaignStatus === "sending"
                ? "1px solid rgba(95,185,31,0.35)"
                : "1px solid rgba(251,191,36,0.3)",
            color: "var(--rex-text-muted)",
          }}
        >
          {campaignStatus === "sending" && progress ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <span style={{ color: "var(--rex-accent)" }} className="font-medium">
                  Sending in progress…
                </span>
                <span className="font-mono text-xs">
                  {progress.sentCount.toLocaleString()} /{" "}
                  {progress.recipientCount.toLocaleString()}{" "}
                  <span style={{ color: "var(--rex-text-dim)" }}>
                    (
                    {progress.recipientCount > 0
                      ? Math.round(
                          (progress.sentCount / progress.recipientCount) * 100,
                        )
                      : 0}
                    %)
                  </span>
                </span>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: "rgba(95,185,31,0.15)" }}
              >
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${progress.recipientCount > 0 ? (progress.sentCount / progress.recipientCount) * 100 : 0}%`,
                    background: "var(--rex-accent)",
                    boxShadow: "0 0 8px var(--rex-accent)",
                  }}
                />
              </div>
              <p className="text-xs" style={{ color: "var(--rex-text-dim)" }}>
                Worker resumes every minute. Safe to close this tab — the send
                continues in the background.
              </p>
            </div>
          ) : (
            <>
              This campaign has already been {campaignStatus}. Editing is
              disabled — duplicate it to send a follow-up.
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Field
            label="Internal name"
            hint="Just for your records — recipients won't see this"
          >
            <input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className="rex-input"
              placeholder="May 2026 Monthly Intel Briefing"
              disabled={readonly}
            />
          </Field>

          <Field label="Subject line">
            <input
              value={form.subject}
              onChange={(e) => update("subject", e.target.value)}
              className="rex-input"
              placeholder="The signals we're watching this month"
              disabled={readonly}
            />
          </Field>

          <Field
            label="Preview text"
            hint="Shown after subject in inbox preview"
          >
            <input
              value={form.previewText}
              onChange={(e) => update("previewText", e.target.value)}
              className="rex-input"
              disabled={readonly}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="From name">
              <input
                value={form.fromName}
                onChange={(e) => update("fromName", e.target.value)}
                className="rex-input"
                disabled={readonly}
              />
            </Field>
            <Field label="From email">
              <input
                value={form.fromEmail}
                onChange={(e) => update("fromEmail", e.target.value)}
                className="rex-input"
                placeholder="intel@yourdomain.com"
                disabled={readonly}
              />
            </Field>
          </div>

          <Field label="Reply-to (optional)">
            <input
              value={form.replyTo}
              onChange={(e) => update("replyTo", e.target.value)}
              className="rex-input"
              disabled={readonly}
            />
          </Field>

          <Field
            label="Audience"
            hint={
              form.segmentId
                ? "Targeting a saved segment. Tags below are ignored."
                : tags.length === 0
                ? "No tags created yet. Sends to every active subscriber."
                : "Pick a saved segment, or use tag union. Empty = all active subscribers."
            }
          >
            <select
              value={form.segmentId}
              onChange={(e) => update("segmentId", e.target.value)}
              className="rex-input mb-2"
              disabled={readonly}
            >
              <option value="">— No segment (use tags below) —</option>
              {segmentsList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.description ? ` · ${s.description}` : ""}
                </option>
              ))}
            </select>
            {tags.length === 0 ? (
              <div
                className="text-sm"
                style={{ color: "var(--rex-text-dim)" }}
              >
                <a
                  href="/tags"
                  className="underline hover:text-[var(--rex-accent)]"
                >
                  Create a tag
                </a>{" "}
                or{" "}
                <a
                  href="/segments"
                  className="underline hover:text-[var(--rex-accent)]"
                >
                  build a segment
                </a>{" "}
                to enable targeted sending.
              </div>
            ) : (
              <div
                className="flex flex-wrap gap-2"
                style={{ opacity: form.segmentId ? 0.4 : 1 }}
              >
                {tags.map((t) => {
                  const on = form.targetTagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTag(t.id)}
                      disabled={readonly || !!form.segmentId}
                      className="px-2.5 py-1 rounded-full text-xs border transition-colors"
                      style={{
                        borderColor: on
                          ? "var(--rex-accent)"
                          : "var(--rex-border)",
                        background: on
                          ? "rgba(99,102,241,0.15)"
                          : "transparent",
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
            )}
          </Field>

          <Field
            label="A/B subject test (optional)"
            hint="Variant B sent to half of the sample. After the wait window, the winner ships to the rest."
          >
            <input
              value={form.subjectB}
              onChange={(e) => update("subjectB", e.target.value)}
              className="rex-input"
              placeholder="Alternative subject line — leave empty to disable"
              disabled={readonly}
            />
            {form.subjectB && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <label
                    className="block text-[10px] uppercase tracking-wider mb-1"
                    style={{ color: "var(--rex-text-dim)" }}
                  >
                    Sample size
                  </label>
                  <input
                    type="number"
                    value={form.abSampleSize || ""}
                    onChange={(e) =>
                      update("abSampleSize", parseInt(e.target.value, 10) || 0)
                    }
                    className="rex-input"
                    placeholder="e.g. 600 (10% of 6k)"
                    disabled={readonly}
                  />
                </div>
                <div>
                  <label
                    className="block text-[10px] uppercase tracking-wider mb-1"
                    style={{ color: "var(--rex-text-dim)" }}
                  >
                    Winner metric
                  </label>
                  <select
                    value={form.abWinnerMetric}
                    onChange={(e) =>
                      update(
                        "abWinnerMetric",
                        e.target.value as "open_rate" | "click_rate",
                      )
                    }
                    className="rex-input"
                    disabled={readonly}
                  >
                    <option value="open_rate">Open rate</option>
                    <option value="click_rate">Click rate</option>
                  </select>
                </div>
              </div>
            )}
          </Field>

          <Field
            label="Email body"
            hint={
              editorMode === "visual"
                ? "Click anywhere to write. Use Insert ▾ for stat cards, CTA buttons, wallet chips, and merge tags."
                : "Pick a RexIntel template, paste your own HTML, or switch to Visual mode for block-based editing."
            }
          >
            <div
              className="flex flex-wrap items-center gap-2 mb-2 p-2 rounded-md border"
              style={{
                borderColor: "var(--rex-border-subtle)",
                background: "var(--rex-surface)",
              }}
            >
              <div
                className="flex rounded border overflow-hidden"
                style={{ borderColor: "var(--rex-border)" }}
              >
                {(["visual", "html"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      if (m === "visual" && !bodyDoc) {
                        // First switch to visual — confirm the textarea HTML
                        // will not be back-parsed (would be lossy for tables).
                        if (
                          form.htmlBody &&
                          !confirm(
                            "Switching to Visual mode starts with a blank document. Your current HTML body stays in HTML mode. Continue?",
                          )
                        )
                          return;
                      }
                      setEditorMode(m);
                    }}
                    disabled={readonly}
                    className="text-xs px-3 py-1"
                    style={{
                      background:
                        editorMode === m
                          ? "rgba(95,185,31,0.15)"
                          : "transparent",
                      color:
                        editorMode === m
                          ? "var(--rex-accent)"
                          : "var(--rex-text-muted)",
                      fontWeight: editorMode === m ? 700 : 400,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div
                className="w-px self-stretch"
                style={{ background: "var(--rex-border)" }}
              />
              <button
                type="button"
                onClick={() => setShowTemplatePicker(true)}
                disabled={readonly}
                className="rex-btn-ghost text-xs"
                style={{ padding: "4px 10px" }}
              >
                {appliedTemplateId
                  ? `✦ ${TEMPLATES.find((t) => t.id === appliedTemplateId)?.name ?? "Template"}`
                  : "✦ Use a template"}
              </button>
              {editorMode === "html" && (
                <>
                  <div
                    className="w-px self-stretch"
                    style={{ background: "var(--rex-border)" }}
                  />
                  <span
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: "var(--rex-text-dim)" }}
                  >
                    Insert
                  </span>
                  {(["firstName", "lastName", "email"] as const).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => insertMergeTag(tag)}
                      disabled={readonly}
                      className="text-xs font-mono px-2 py-1 rounded border"
                      style={{
                        borderColor: "var(--rex-border)",
                        color: "var(--rex-accent)",
                        background: "transparent",
                      }}
                    >
                      {`{{${tag}}}`}
                    </button>
                  ))}
                </>
              )}
            </div>
            {editorMode === "visual" ? (
              <EmailEditor
                initialDoc={bodyDoc}
                disabled={readonly}
                onChange={(doc, html) => {
                  setBodyDoc(doc);
                  update("htmlBody", html);
                }}
              />
            ) : (
              <textarea
                ref={bodyRef}
                value={form.htmlBody}
                onChange={(e) => update("htmlBody", e.target.value)}
                className="rex-input font-mono text-xs"
                style={{ height: "360px", resize: "vertical" }}
                disabled={readonly}
              />
            )}
          </Field>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl text-white">Preview</h2>
            <button
              type="button"
              onClick={() => setShowPreview((s) => !s)}
              className="text-xs hover:text-white transition-colors"
              style={{ color: "var(--rex-text-dim)" }}
            >
              {showPreview ? "Hide" : "Show"} rendered
            </button>
          </div>

          <div className="rex-card">
            <div
              className="p-4 text-sm border-b"
              style={{ borderColor: "var(--rex-border-subtle)" }}
            >
              <div
                className="text-xs mb-0.5"
                style={{ color: "var(--rex-text-dim)" }}
              >
                From
              </div>
              <div style={{ color: "var(--rex-text)" }}>
                {form.fromName} &lt;{form.fromEmail || "you@example.com"}&gt;
              </div>
              <div
                className="text-xs mt-2 mb-0.5"
                style={{ color: "var(--rex-text-dim)" }}
              >
                Subject
              </div>
              <div className="font-medium text-white">
                {form.subject || "(no subject)"}
              </div>
              {form.previewText && (
                <div
                  className="text-xs mt-1 italic"
                  style={{ color: "var(--rex-text-dim)" }}
                >
                  {form.previewText}
                </div>
              )}
            </div>
            <div className="p-4" style={{ background: "white" }}>
              {showPreview ? (
                <div
                  dangerouslySetInnerHTML={{
                    __html: form.htmlBody.replace(
                      /\{\{\s*firstName\s*\}\}/g,
                      "Alex",
                    ),
                  }}
                />
              ) : (
                <pre
                  className="text-xs whitespace-pre-wrap font-mono"
                  style={{ color: "#444" }}
                >
                  {form.htmlBody.slice(0, 600)}
                  {form.htmlBody.length > 600 && "…"}
                </pre>
              )}
            </div>
          </div>

          {/* Recipient count card */}
          <div className="rex-card p-4">
            <h3 className="text-sm font-medium text-white mb-2">Audience</h3>
            {!campaignId ? (
              <p
                className="text-xs"
                style={{ color: "var(--rex-text-dim)" }}
              >
                Save the draft to preview the recipient count.
              </p>
            ) : countLoading || !count ? (
              <p
                className="text-xs"
                style={{ color: "var(--rex-text-dim)" }}
              >
                Calculating…
              </p>
            ) : (
              <div className="space-y-1.5 text-sm">
                <div className="flex items-baseline justify-between">
                  <span style={{ color: "var(--rex-text-muted)" }}>
                    Will send to
                  </span>
                  <span
                    className="font-mono text-2xl text-white"
                    style={{ lineHeight: 1 }}
                  >
                    {count.count.toLocaleString()}
                  </span>
                </div>
                <div
                  className="flex items-baseline justify-between text-xs"
                  style={{ color: "var(--rex-text-dim)" }}
                >
                  <span>Active total in segment</span>
                  <span className="font-mono">
                    {count.activeTotal.toLocaleString()}
                  </span>
                </div>
                {count.excludedAlreadySent > 0 && (
                  <div
                    className="flex items-baseline justify-between text-xs"
                    style={{ color: "var(--rex-text-dim)" }}
                  >
                    <span>Skipped (already sent)</span>
                    <span className="font-mono">
                      {count.excludedAlreadySent.toLocaleString()}
                    </span>
                  </div>
                )}
                {count.excludedSuppressed > 0 && (
                  <div
                    className="flex items-baseline justify-between text-xs"
                    style={{ color: "var(--rex-text-dim)" }}
                  >
                    <span>Skipped (suppressed)</span>
                    <span className="font-mono">
                      {count.excludedSuppressed.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Test send card */}
          <div className="rex-card p-4">
            <h3 className="text-sm font-medium text-white mb-2">Test send</h3>
            <p
              className="text-xs mb-3"
              style={{ color: "var(--rex-text-dim)" }}
            >
              Send a one-off preview to up to 5 emails. Tracking is disabled —
              opens and clicks won&apos;t be counted.
            </p>
            <div className="flex gap-2">
              <input
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                className="rex-input flex-1"
                placeholder="you@yourdomain.com"
              />
              <button
                onClick={sendTest}
                disabled={busy || !form.htmlBody || !form.fromEmail}
                className="rex-btn-ghost whitespace-nowrap"
              >
                Test send
              </button>
            </div>
            {testStatus && (
              <div
                className="text-xs mt-2 font-mono"
                style={{
                  color: testStatus.startsWith("✓")
                    ? "var(--rex-success)"
                    : "var(--rex-danger)",
                }}
              >
                {testStatus}
              </div>
            )}
          </div>

          {/* Send / schedule card */}
          {!readonly && (
            <div className="rex-card p-4">
              <h3 className="text-sm font-medium text-white mb-3">Actions</h3>
              <div className="flex flex-col gap-2">
                <button
                  onClick={saveDraft}
                  disabled={busy || !form.name || !form.subject}
                  className="rex-btn-ghost"
                >
                  {campaignId ? "✓ Save changes" : "Save draft"}
                </button>
                <button
                  onClick={openPreflight}
                  disabled={busy || !form.htmlBody || !form.fromEmail}
                  className="rex-btn"
                >
                  {busy
                    ? "Sending…"
                    : count
                      ? `Review & send to ${count.count.toLocaleString()} recipient${count.count === 1 ? "" : "s"}`
                      : "Review & send"}
                </button>
              </div>

              <div
                className="mt-4 pt-4 border-t"
                style={{ borderColor: "var(--rex-border-subtle)" }}
              >
                <label
                  className="block text-xs uppercase tracking-wider mb-1.5"
                  style={{ color: "var(--rex-text-muted)" }}
                  htmlFor="schedule-at"
                >
                  Or schedule for later
                </label>
                <div className="flex gap-2">
                  <input
                    id="schedule-at"
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    className="rex-input flex-1"
                  />
                  {campaignStatus === "scheduled" ? (
                    <button
                      onClick={unschedule}
                      disabled={busy}
                      className="rex-btn-ghost whitespace-nowrap"
                    >
                      Unschedule
                    </button>
                  ) : (
                    <button
                      onClick={schedule}
                      disabled={
                        busy ||
                        !scheduleAt ||
                        !form.htmlBody ||
                        !form.fromEmail ||
                        !form.name ||
                        !form.subject
                      }
                      className="rex-btn-ghost whitespace-nowrap"
                    >
                      {scheduleStatus === "scheduled"
                        ? "✓ Scheduled"
                        : "Schedule"}
                    </button>
                  )}
                </div>
                <p
                  className="text-xs mt-2"
                  style={{ color: "var(--rex-text-dim)" }}
                >
                  Cron checks every 5 minutes — actual send may run up to 5 min
                  after the chosen time. Time is your local timezone.
                </p>
              </div>

              <p
                className="text-xs mt-3"
                style={{ color: "var(--rex-text-dim)" }}
              >
                Sends in batches of 100. Hard bounces and complaints are
                auto-suppressed.
              </p>
            </div>
          )}

          {sendResult ? (
            <div
              className="rex-card p-4"
              style={{
                borderColor: "rgba(52,211,153,0.3)",
                background: "rgba(52,211,153,0.05)",
              }}
            >
              <pre
                className="font-mono text-xs whitespace-pre-wrap"
                style={{ color: "var(--rex-success)" }}
              >
                {JSON.stringify(sendResult, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </div>

      {showTemplatePicker && (
        <TemplatePickerModal
          currentId={appliedTemplateId}
          onPick={applyTemplate}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}

      {showPreflight && (
        <PreflightModal
          loading={preflightLoading}
          preflight={preflight}
          onSend={send}
          onClose={() => setShowPreflight(false)}
          busy={busy}
        />
      )}
    </div>
  );
}

// Start every new draft on the blank scaffold. The picker lets the operator swap
// in any of the RexIntel-branded templates (intel briefing, incident alert, etc.).
const DEFAULT_BODY =
  TEMPLATES.find((t) => t.id === "blank")?.htmlBody ?? TEMPLATES[0].htmlBody;
