"use client";

import { useState } from "react";
import { TEMPLATES, type NewsletterTemplate } from "@/lib/email/templates";

export function TemplatePickerModal({
  currentId,
  onPick,
  onClose,
}: {
  currentId: string | null;
  onPick: (t: NewsletterTemplate) => void;
  onClose: () => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const previewTemplate =
    TEMPLATES.find((t) => t.id === hoveredId) ??
    TEMPLATES.find((t) => t.id === currentId) ??
    TEMPLATES[0];

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
          width: "min(1100px, 100%)",
          maxHeight: "90vh",
          background: "var(--rex-bg)",
        }}
      >
        <header
          className="flex items-center justify-between p-5 border-b"
          style={{ borderColor: "var(--rex-border-subtle)" }}
        >
          <div>
            <p
              className="text-[10px] uppercase tracking-widest mb-0.5"
              style={{ color: "var(--rex-text-dim)" }}
            >
              Template library
            </p>
            <h2 className="font-display text-xl text-white">
              Pick a starting point
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-xs hover:text-white"
            style={{ color: "var(--rex-text-dim)" }}
          >
            ✕ Close
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-0 overflow-hidden flex-1">
          <ul
            className="overflow-y-auto p-3 border-r"
            style={{ borderColor: "var(--rex-border-subtle)" }}
          >
            {TEMPLATES.map((t) => {
              const isCurrent = currentId === t.id;
              return (
                <li key={t.id}>
                  <button
                    onMouseEnter={() => setHoveredId(t.id)}
                    onFocus={() => setHoveredId(t.id)}
                    onClick={() => onPick(t)}
                    className="w-full text-left p-3 rounded-md border mb-2 hover:border-[var(--rex-accent)] transition-colors"
                    style={{
                      borderColor: isCurrent
                        ? "var(--rex-accent)"
                        : "var(--rex-border)",
                      background: isCurrent
                        ? "rgba(95,185,31,0.06)"
                        : "transparent",
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-sm text-white">
                        {t.name}
                      </span>
                      <span
                        className="text-[10px] uppercase tracking-wider font-mono"
                        style={{ color: "var(--rex-text-dim)" }}
                      >
                        {t.category}
                      </span>
                    </div>
                    <p
                      className="text-xs mt-1 leading-snug"
                      style={{ color: "var(--rex-text-muted)" }}
                    >
                      {t.description}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="overflow-y-auto flex flex-col">
            <div
              className="px-5 py-3 border-b text-xs font-mono"
              style={{
                borderColor: "var(--rex-border-subtle)",
                color: "var(--rex-text-muted)",
              }}
            >
              <span style={{ color: "var(--rex-text-dim)" }}>Subject:</span>{" "}
              <span className="text-white">
                {previewTemplate.subject || "(blank)"}
              </span>
            </div>
            <div
              className="flex-1 overflow-y-auto"
              style={{ background: "white" }}
            >
              <div
                dangerouslySetInnerHTML={{
                  __html: previewTemplate.htmlBody.replace(
                    /\{\{\s*firstName\s*\}\}/g,
                    "Alex",
                  ),
                }}
              />
            </div>
            <div
              className="p-4 border-t flex justify-end gap-2"
              style={{ borderColor: "var(--rex-border-subtle)" }}
            >
              <button
                onClick={() => onPick(previewTemplate)}
                className="rex-btn"
              >
                Use “{previewTemplate.name}”
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
