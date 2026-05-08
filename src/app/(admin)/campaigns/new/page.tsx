"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewCampaignPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    subject: "",
    fromName: "Web3 Conferences",
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
        <p className="text-xs uppercase tracking-widest text-neutral-500 mb-1">
          Compose
        </p>
        <h1 className="font-display text-4xl font-medium">New campaign</h1>
      </header>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <Field label="Internal name" hint="Just for your records — recipients won't see this">
            <input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className="input"
              placeholder="Devcon SEA recap — Nov edition"
            />
          </Field>

          <Field label="Subject line">
            <input
              value={form.subject}
              onChange={(e) => update("subject", e.target.value)}
              className="input"
              placeholder="The 12 hackathons we're watching this month"
            />
          </Field>

          <Field label="Preview text" hint="Shown after subject in inbox preview">
            <input
              value={form.previewText}
              onChange={(e) => update("previewText", e.target.value)}
              className="input"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="From name">
              <input
                value={form.fromName}
                onChange={(e) => update("fromName", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="From email">
              <input
                value={form.fromEmail}
                onChange={(e) => update("fromEmail", e.target.value)}
                className="input"
                placeholder="hello@yourdomain.com"
              />
            </Field>
          </div>

          <Field label="Reply-to (optional)">
            <input
              value={form.replyTo}
              onChange={(e) => update("replyTo", e.target.value)}
              className="input"
            />
          </Field>

          <Field
            label="HTML body"
            hint="Use {{firstName}} for personalization. Links are auto-tracked."
          >
            <textarea
              value={form.htmlBody}
              onChange={(e) => update("htmlBody", e.target.value)}
              className="input font-mono text-xs h-72"
            />
          </Field>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">Preview</h2>
            <button
              type="button"
              onClick={() => setShowPreview((s) => !s)}
              className="text-xs text-neutral-500 hover:text-neutral-900"
            >
              {showPreview ? "Hide" : "Show"} rendered
            </button>
          </div>

          <div className="border border-neutral-200 rounded-lg overflow-hidden bg-white">
            <div className="border-b border-neutral-100 p-4 text-sm">
              <div className="text-xs text-neutral-500 mb-0.5">From</div>
              <div>
                {form.fromName} &lt;{form.fromEmail || "you@example.com"}&gt;
              </div>
              <div className="text-xs text-neutral-500 mt-2 mb-0.5">Subject</div>
              <div className="font-medium">{form.subject || "(no subject)"}</div>
              {form.previewText && (
                <div className="text-xs text-neutral-500 mt-1 italic">
                  {form.previewText}
                </div>
              )}
            </div>
            <div className="p-4 bg-white">
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
                <pre className="text-xs text-neutral-600 whitespace-pre-wrap font-mono">
                  {form.htmlBody.slice(0, 600)}
                  {form.htmlBody.length > 600 && "…"}
                </pre>
              )}
            </div>
          </div>

          <div className="border border-neutral-200 rounded-lg p-4 bg-white">
            <h3 className="text-sm font-medium mb-3">Actions</h3>
            <div className="flex flex-col gap-2">
              <button
                onClick={saveDraft}
                disabled={busy || !form.name || !form.subject}
                className="px-4 py-2 text-sm border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-50"
              >
                {campaignId ? "Saved as draft" : "Save draft"}
              </button>
              <button
                onClick={send}
                disabled={busy || !form.htmlBody || !form.fromEmail}
                className="px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-neutral-800 disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send to all active subscribers"}
              </button>
            </div>
            <p className="text-xs text-neutral-500 mt-3">
              Sends in batches of 100. Hard bounces and complaints are
              auto-suppressed.
            </p>
          </div>

          {sendResult ? (
            <div className="border border-green-200 bg-green-50 rounded-lg p-4 text-sm">
              <pre className="font-mono text-xs whitespace-pre-wrap">
                {JSON.stringify(sendResult, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid rgb(212 212 212);
          border-radius: 6px;
          font-size: 14px;
          outline: none;
          background: white;
        }
        .input:focus {
          border-color: rgb(23 23 23);
          box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.05);
        }
      `}</style>
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
      <label className="block text-xs uppercase tracking-wider text-neutral-700 mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-neutral-500 mt-1">{hint}</p>}
    </div>
  );
}

const DEFAULT_TEMPLATE = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;line-height:1.6;">
  <h1 style="font-size:28px;margin:0 0 16px;font-weight:600;">Hey {{firstName}},</h1>

  <p>Welcome to this week's roundup of web3 conferences and hackathons worth knowing about.</p>

  <h2 style="font-size:20px;margin:32px 0 8px;">Upcoming this month</h2>
  <ul style="padding-left:20px;">
    <li><a href="https://example.com/event1">Event one</a> — short description</li>
    <li><a href="https://example.com/event2">Event two</a> — short description</li>
  </ul>

  <p style="margin-top:32px;">— The team</p>
</div>`;
