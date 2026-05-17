"use client";

import { useState } from "react";
import { track } from "@vercel/analytics";
import { Turnstile } from "@/components/turnstile";

// The 5 wedge personas the brief promises segment-targeted briefings to.
// Kept here (not imported from /lib/personas) so we surface only the
// strategic five on the public form — the broader 9-slug set in
// /lib/personas is what the server accepts for back-compat / power users.
const SIGNUP_PERSONAS: Array<{ slug: string; label: string }> = [
  { slug: "compliance", label: "Compliance / AML" },
  { slug: "exchange-risk", label: "Exchange / Trust & Safety" },
  { slug: "investigator", label: "Investigator / Researcher" },
  { slug: "gov-le", label: "Government / Law Enforcement" },
  { slug: "fund-risk", label: "Fund / Treasury Risk" },
];

/**
 * Subscribe form for the landing page. Holds all React state — extracted into
 * a client component so the surrounding page (which renders PublicShell) can
 * stay a server component. PublicShell pulls in next/headers via the location
 * pill, which can't be bundled into a client tree.
 */
export function SubscribeWidget({ transmissionId }: { transmissionId: string }) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [persona, setPersona] = useState("");
  // Honeypot — bots autofill any visible/known field. Real users never see this.
  const [website, setWebsite] = useState("");
  // Captcha token from Cloudflare Turnstile. Widget only renders + populates
  // this when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set; otherwise stays "" and
  // the server-side verifier no-ops.
  const [turnstileToken, setTurnstileToken] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          firstName,
          persona: persona || undefined,
          website,
          turnstileToken,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        try {
          track("subscribe_success", { source: "landing" });
        } catch {
          /* analytics is best-effort; never block UX */
        }
        setStatus("success");
        setMessage("Clearance granted. Next transmission inbound.");
        setEmail("");
        setFirstName("");
        setPersona("");
        setWebsite("");
      } else {
        setStatus("error");
        setMessage(data.error || "Transmission failed. Retry.");
      }
    } catch {
      setStatus("error");
      setMessage("Channel disrupted. Retry.");
    }
  }

  if (status === "success") {
    return (
      <div className="inline-flex items-center gap-3 px-5 py-3.5 rounded-sm border border-[rgba(95,185,31,0.35)] bg-[rgba(95,185,31,0.06)]">
        <svg
          className="w-4 h-4 text-[var(--rex-accent)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
        <span className="mono-label-accent text-[11px]">{message}</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubscribe} className="max-w-lg mx-auto">
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-10000px",
          width: "1px",
          height: "1px",
          overflow: "hidden",
        }}
      >
        <label htmlFor="website">Website (leave empty)</label>
        <input
          type="text"
          id="website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between mb-2.5">
        <span className="mono-label-accent">▸ Request Clearance</span>
        <span className="mono-label">No.{transmissionId}</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          placeholder="Operator name (opt.)"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="rex-input sm:max-w-[170px]"
          id="subscribe-first-name"
        />
        <input
          type="email"
          placeholder="secure.channel@domain"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rex-input flex-1"
          id="subscribe-email"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="rex-btn whitespace-nowrap"
          id="subscribe-submit"
        >
          {status === "loading" ? (
            <>
              <svg
                className="animate-spin w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Authorizing
            </>
          ) : (
            "Authorize ▸"
          )}
        </button>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <label
          htmlFor="subscribe-persona"
          className="mono-label whitespace-nowrap text-[10px]"
        >
          ▸ Operator Class
        </label>
        <select
          id="subscribe-persona"
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          className="rex-input flex-1 text-xs"
          aria-label="Your role (optional — helps us target briefings)"
        >
          <option value="">Unaffiliated / Other (optional)</option>
          {SIGNUP_PERSONAS.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {status === "error" && (
        <p className="mt-3 text-xs font-mono text-[var(--rex-danger)]">
          ✕ {message}
        </p>
      )}

      <Turnstile onToken={setTurnstileToken} className="mt-3 flex justify-center" />

      <p className="text-[11px] font-mono tracking-wider text-[var(--rex-text-dim)] mt-4">
        NO COST · WEEKLY TRANSMISSION · REVOKE ANYTIME
      </p>
    </form>
  );
}
