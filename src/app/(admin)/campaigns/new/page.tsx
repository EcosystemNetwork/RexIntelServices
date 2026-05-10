"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Tag {
  id: string;
  name: string;
  subscriberCount: number;
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
    htmlBody: DEFAULT_TEMPLATE,
    targetTagIds: [] as string[],
  });
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
  const [count, setCount] = useState<RecipientCount | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(!!initialId);

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const readonly = READONLY_STATUSES.has(campaignStatus);

  // Load tags once
  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((d) => setTags(d.tags ?? []));
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
      });
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
    if (campaignId) {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
      body: JSON.stringify(form),
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

  async function send() {
    const id = campaignId ?? (await persist());
    if (!id) return;
    if (
      !confirm(
        `Send this campaign now to ${count?.count ?? "?"} recipient${count?.count === 1 ? "" : "s"}? This cannot be undone.`,
      )
    )
      return;

    setBusy(true);
    const res = await fetch(`/api/campaigns/${id}/send`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    setSendResult(data);
    if (res.ok) {
      setTimeout(() => router.push("/campaigns"), 2000);
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
            background: "rgba(251,191,36,0.08)",
            border: "1px solid rgba(251,191,36,0.3)",
            color: "var(--rex-text-muted)",
          }}
        >
          This campaign has already been {campaignStatus}. Editing is disabled —
          duplicate it to send a follow-up.
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
              tags.length === 0
                ? "No tags created yet. Sends to every active subscriber."
                : "Select tags to send only to those segments. Empty = all active subscribers."
            }
          >
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
                to enable segment targeting.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => {
                  const on = form.targetTagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTag(t.id)}
                      disabled={readonly}
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
            label="HTML body"
            hint="Use {{firstName}} for personalization. Links are auto-tracked."
          >
            <textarea
              value={form.htmlBody}
              onChange={(e) => update("htmlBody", e.target.value)}
              className="rex-input font-mono text-xs"
              style={{ height: "288px", resize: "vertical" }}
              disabled={readonly}
            />
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
              opens and clicks won't be counted.
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
                  onClick={send}
                  disabled={busy || !form.htmlBody || !form.fromEmail}
                  className="rex-btn"
                >
                  {busy
                    ? "Sending…"
                    : count
                      ? `Send to ${count.count.toLocaleString()} recipient${count.count === 1 ? "" : "s"}`
                      : "Send to all active subscribers"}
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
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-xs uppercase tracking-wider mb-1.5"
        style={{ color: "var(--rex-text-muted)" }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-xs mt-1" style={{ color: "var(--rex-text-dim)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

const DEFAULT_TEMPLATE = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;line-height:1.6;">
  <h1 style="font-size:28px;margin:0 0 16px;font-weight:600;">Hey {{firstName}},</h1>

  <p>Here's your monthly intelligence briefing from Rex Intel Services.</p>

  <h2 style="font-size:20px;margin:32px 0 8px;">Key Signals This Month</h2>
  <ul style="padding-left:20px;">
    <li><a href="https://example.com/signal1">Signal one</a> — brief analysis</li>
    <li><a href="https://example.com/signal2">Signal two</a> — brief analysis</li>
  </ul>

  <p style="margin-top:32px;">— The Rex Intel Services Team</p>
</div>`;
