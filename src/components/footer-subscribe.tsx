"use client";

import { useState } from "react";
import { track } from "@vercel/analytics";
import { Turnstile } from "@/components/turnstile";

/**
 * Compact newsletter form rendered in the global footer. Same backend as the
 * landing-page subscribe widget, but stripped to a single email field so it
 * doesn't dominate the footer. Surfaced site-wide via PublicShell so every
 * lane / detail page has a capture surface, not just the homepage.
 *
 * Turnstile only renders when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set; otherwise
 * the form posts with an empty token and the server's verify step no-ops.
 */
export function FooterSubscribe({ source }: { source?: string }) {
  const [email, setEmail] = useState("");
  // Honeypot — see /api/subscribe.
  const [website, setWebsite] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  // Defer mounting the Turnstile widget until the user actually interacts with
  // the form. Otherwise the captcha banner renders on every page footer,
  // which is intrusive for read-only visitors.
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website, turnstileToken }),
      });
      const data = await res.json();
      if (res.ok) {
        try {
          track("subscribe_success", { source: source ?? "footer" });
        } catch {
          /* analytics best-effort */
        }
        setStatus("success");
        setMessage("Clearance granted. Next transmission inbound.");
        setEmail("");
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
      <div className="mono-label flex items-center gap-2 text-[var(--rex-accent)]">
        <span className="pulse-dot" />
        <span>{message}</span>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto"
    >
      <label
        htmlFor="footer-subscribe-email"
        className="mono-label whitespace-nowrap"
      >
        ▸ Weekly briefing
      </label>
      <div className="flex items-stretch gap-2 w-full sm:w-auto">
        <input
          id="footer-subscribe-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={() => setShowCaptcha(true)}
          placeholder="you@domain"
          autoComplete="email"
          className="rex-input flex-1 sm:w-56 text-sm"
          disabled={status === "loading"}
        />
        {/* Honeypot — hidden from real users, autofilled by bots. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="hidden"
          aria-hidden="true"
        />
        <button
          type="submit"
          disabled={status === "loading" || !email}
          className="rex-btn whitespace-nowrap"
        >
          {status === "loading" ? "Sending…" : "Subscribe ▸"}
        </button>
      </div>
      {/* Turnstile renders zero markup when no site key is configured. We
         also defer mount until the user focuses the email field so the captcha
         banner doesn't appear in every footer view. */}
      {showCaptcha && <Turnstile onToken={setTurnstileToken} />}
      {status === "error" && (
        <span className="mono-label text-red-400">{message}</span>
      )}
    </form>
  );
}
