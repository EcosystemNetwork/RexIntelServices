"use client";

import { useEffect, useState } from "react";

interface Tag {
  id: string;
  name: string;
  subscriberCount: number;
}

export default function EmbedPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [source, setSource] = useState("embed-mysite");
  const [heading, setHeading] = useState("Subscribe to Rex Intel");
  const [subhead, setSubhead] = useState(
    "Intel briefings, incident alerts, investigation drops. No spam.",
  );
  const [cta, setCta] = useState("Subscribe");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((d) => setTags(d.tags ?? []));
  }, []);

  // Site origin — anchor everywhere the snippet would be installed.
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://rexintelservices.com";

  const dataAttrs: string[] = [];
  if (source) dataAttrs.push(`data-source="${escapeAttr(source)}"`);
  if (heading !== "Subscribe to Rex Intel")
    dataAttrs.push(`data-heading="${escapeAttr(heading)}"`);
  if (subhead) dataAttrs.push(`data-subhead="${escapeAttr(subhead)}"`);
  if (cta !== "Subscribe") dataAttrs.push(`data-cta="${escapeAttr(cta)}"`);
  if (tagIds.length > 0)
    dataAttrs.push(`data-tags="${tagIds.join(",")}"`);

  const snippet = `<div id="rex-signup" ${dataAttrs.join(" ")}></div>
<script src="${origin}/embed.js" async></script>`;

  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleTag(id: string) {
    setTagIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  return (
    <div className="p-10 max-w-6xl">
      <header className="mb-8">
        <p
          className="text-xs uppercase tracking-widest mb-1"
          style={{ color: "var(--rex-text-dim)" }}
        >
          Acquisition
        </p>
        <h1 className="font-display text-4xl font-medium text-white">
          Signup form embed
        </h1>
        <p
          className="text-sm mt-2"
          style={{ color: "var(--rex-text-muted)" }}
        >
          Paste this snippet into any HTML page (Squarespace, Wix, WordPress,
          static HTML, etc.) to drop a signup form on it. Subscribers are
          auto-tagged + sourced for segment targeting.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Field
            label="Source slug"
            hint="Subscribers from this embed are stored with this as their source. Use a unique slug per site so segments work."
          >
            <input
              value={source}
              onChange={(e) => setSource(e.target.value.replace(/[^a-z0-9-]/gi, "-"))}
              className="rex-input font-mono"
            />
          </Field>

          <Field label="Heading">
            <input
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              className="rex-input"
            />
          </Field>

          <Field label="Subhead">
            <input
              value={subhead}
              onChange={(e) => setSubhead(e.target.value)}
              className="rex-input"
            />
          </Field>

          <Field label="Button text">
            <input
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              className="rex-input"
            />
          </Field>

          <Field
            label="Auto-apply tags"
            hint="Every signup from this embed gets these tags. Useful for routing them into a specific segment."
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
                first.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => {
                  const on = tagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTag(t.id)}
                      className="px-2.5 py-1 rounded-full text-xs border"
                      style={{
                        borderColor: on
                          ? "var(--rex-accent)"
                          : "var(--rex-border)",
                        background: on
                          ? "rgba(95,185,31,0.12)"
                          : "transparent",
                        color: on
                          ? "var(--rex-accent)"
                          : "var(--rex-text-muted)",
                      }}
                    >
                      {on ? "✓ " : ""}
                      {t.name}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>

          <div className="rex-card p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-white">Snippet</h3>
              <button onClick={copy} className="rex-btn-ghost text-xs">
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
            <pre
              className="font-mono text-xs whitespace-pre-wrap break-all overflow-x-auto"
              style={{
                color: "var(--rex-text)",
                background: "var(--rex-surface)",
                padding: "12px",
                borderRadius: 4,
                lineHeight: 1.5,
              }}
            >
              {snippet}
            </pre>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-white">Preview</h2>
          <p className="text-xs" style={{ color: "var(--rex-text-dim)" }}>
            This is exactly what visitors will see on the host page.
          </p>
          <div className="rex-card p-6" style={{ background: "#f4f4f7" }}>
            {/* Render a static replica of what the embed JS produces.
                Source of truth is /embed.js — keep these visually in sync. */}
            <div
              style={{
                fontFamily:
                  "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif",
                maxWidth: 480,
                margin: "0 auto",
                padding: 24,
                background: "#0a0a0f",
                border: "1px solid #2a2a35",
                borderRadius: 8,
                color: "#e8e8ef",
              }}
            >
              <div
                style={{
                  fontFamily: "Courier New,monospace",
                  fontSize: 11,
                  letterSpacing: "0.22em",
                  color: "#5fb91f",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Rex Intel Services
              </div>
              <h3
                style={{
                  margin: "0 0 8px",
                  fontSize: 22,
                  fontWeight: 600,
                  color: "#e8e8ef",
                  lineHeight: 1.2,
                }}
              >
                {heading}
              </h3>
              <p
                style={{
                  margin: "0 0 18px",
                  fontSize: 14,
                  color: "#8888a0",
                  lineHeight: 1.5,
                }}
              >
                {subhead}
              </p>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                <input
                  placeholder="you@yourdomain.com"
                  readOnly
                  style={{
                    padding: "10px 12px",
                    background: "#111118",
                    border: "1px solid #2a2a35",
                    color: "#e8e8ef",
                    borderRadius: 4,
                    fontSize: 14,
                  }}
                />
                <input
                  placeholder="First name (optional)"
                  readOnly
                  style={{
                    padding: "10px 12px",
                    background: "#111118",
                    border: "1px solid #2a2a35",
                    color: "#e8e8ef",
                    borderRadius: 4,
                    fontSize: 14,
                  }}
                />
                <button
                  type="button"
                  style={{
                    padding: "11px 18px",
                    background: "#5fb91f",
                    color: "#0a0a0f",
                    border: 0,
                    borderRadius: 4,
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    fontFamily: "Courier New,monospace",
                  }}
                >
                  {cta}
                </button>
              </div>
            </div>
          </div>
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

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
