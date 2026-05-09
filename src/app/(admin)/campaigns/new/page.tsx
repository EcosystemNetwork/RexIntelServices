"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewCampaignPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    subject: "",
    fromName: "Rex Intel Services",
    fromEmail: "",
    replyTo: "",
    previewText: "",
    htmlBody: DEFAULT_TEMPLATE,
  });
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendResult, setSendResult] = useState<unknown>(null);
  const [showPreview, setShowPreview] = useState(false);

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function saveDraft() {
    setBusy(true);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      setCampaignId(data.campaign.id);
    } else {
      alert(data.error);
    }
  }

  async function send() {
    if (!campaignId) {
      await saveDraft();
      return;
    }
    if (
      !confirm(
        "Send this campaign now? This cannot be undone. Make sure you've previewed it.",
      )
    )
      return;

    setBusy(true);
    const res = await fetch(`/api/campaigns/${campaignId}/send`, {
      method: "POST",
    });
    const data = await res.json();
    setBusy(false);
    setSendResult(data);
    if (res.ok) {
      setTimeout(() => router.push("/campaigns"), 2000);
    }
  }

  return (
    <div className="p-10 max-w-5xl">
      <header className="mb-8">
        <p
          className="text-xs uppercase tracking-widest mb-1"
          style={{ color: "var(--rex-text-dim)" }}
        >
          Compose
        </p>
        <h1 className="font-display text-4xl font-medium text-white">
          New Campaign
        </h1>
      </header>

      <div className="grid grid-cols-2 gap-6">
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
              id="campaign-name"
            />
          </Field>

          <Field label="Subject line">
            <input
              value={form.subject}
              onChange={(e) => update("subject", e.target.value)}
              className="rex-input"
              placeholder="The signals we're watching this month"
              id="campaign-subject"
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
              id="campaign-preview"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="From name">
              <input
                value={form.fromName}
                onChange={(e) => update("fromName", e.target.value)}
                className="rex-input"
                id="campaign-from-name"
              />
            </Field>
            <Field label="From email">
              <input
                value={form.fromEmail}
                onChange={(e) => update("fromEmail", e.target.value)}
                className="rex-input"
                placeholder="intel@yourdomain.com"
                id="campaign-from-email"
              />
            </Field>
          </div>

          <Field label="Reply-to (optional)">
            <input
              value={form.replyTo}
              onChange={(e) => update("replyTo", e.target.value)}
              className="rex-input"
              id="campaign-reply-to"
            />
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
              id="campaign-html-body"
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

          <div className="rex-card p-4">
            <h3 className="text-sm font-medium text-white mb-3">Actions</h3>
            <div className="flex flex-col gap-2">
              <button
                onClick={saveDraft}
                disabled={busy || !form.name || !form.subject}
                className="rex-btn-ghost"
                id="save-draft-btn"
              >
                {campaignId ? "✓ Saved as draft" : "Save draft"}
              </button>
              <button
                onClick={send}
                disabled={busy || !form.htmlBody || !form.fromEmail}
                className="rex-btn"
                id="send-campaign-btn"
              >
                {busy ? "Sending…" : "Send to all active subscribers"}
              </button>
            </div>
            <p
              className="text-xs mt-3"
              style={{ color: "var(--rex-text-dim)" }}
            >
              Sends in batches of 100. Hard bounces and complaints are
              auto-suppressed.
            </p>
          </div>

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
