"use client";

import Link from "next/link";
import { useState } from "react";
import { track } from "@vercel/analytics";
import { MarketIcon, SignalIcon, ShieldIcon } from "@/components/icons";
import { PublicShell } from "@/components/public-shell";
import { Turnstile } from "@/components/turnstile";

export default function LandingForm() {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
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
          website,
          turnstileToken,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        // Conversion event. Vercel Analytics: appears in the funnel
        // dashboard alongside page views. No PII — just the fact a
        // signup completed.
        try {
          track("subscribe_success", { source: "landing" });
        } catch {
          /* analytics is best-effort; never block UX */
        }
        setStatus("success");
        setMessage("Clearance granted. Next transmission inbound.");
        setEmail("");
        setFirstName("");
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

  const year = new Date().getFullYear();
  const transmissionId = `RX-${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  return (
    <PublicShell
      sceneHeight="100vh"
      classification={[
        { text: "● Classified // Eyes Only" },
        { text: "Crypto Intelligence Division", show: "sm" },
        { text: `Transmission ${transmissionId}`, show: "md" },
      ]}
    >
      <main className="max-w-3xl mx-auto px-6 pt-12 sm:pt-16 md:pt-24 pb-24 text-center">
        <p className="font-display italic text-base sm:text-lg md:text-xl text-[var(--rex-text-muted)]/80 tracking-tight mb-5 animate-fade-in animate-fade-in-delay-1">
          We stay deep in the trenches so you don&apos;t have to...
        </p>

        <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-white mb-4 animate-fade-in animate-fade-in-delay-2">
          Intelligence,{" "}
          <span
            style={{
              background:
                "linear-gradient(135deg, var(--rex-accent), var(--rex-accent-2))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            delivered.
          </span>
        </h1>

        <p className="text-sm sm:text-base md:text-lg text-[var(--rex-text-muted)] leading-relaxed max-w-xl mx-auto mb-10 animate-fade-in animate-fade-in-delay-3">
          Crypto market intel, on-chain signals, and the events, grants,
          accelerators and pop-up cities the field is moving through — one
          weekly briefing, plus live boards.
        </p>

        <div className="animate-fade-in animate-fade-in-delay-3">
          {status === "success" ? (
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
          ) : (
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
          )}
        </div>

        <div className="mt-16 animate-fade-in animate-fade-in-delay-4">
          <div className="rex-divider mb-8">
            <span>Intelligence Divisions</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-left">
            <DivisionCard
              code="DIV-01"
              href="/intel"
              icon={<MarketIcon className="w-5 h-5" />}
              title="Intel Wire"
              desc="Tips, sightings, and analyst-flagged signals on the digital asset complex."
            />
            <DivisionCard
              code="DIV-02"
              href="/events"
              icon={<SignalIcon className="w-5 h-5" />}
              title="Field Calendar"
              desc="Conferences, hackathons, happy hours and closed-door sessions worth tracking."
            />
            <DivisionCard
              code="DIV-03"
              href="/intel?lane=cities"
              icon={<ShieldIcon className="w-5 h-5" />}
              title="Pop-Up Cities"
              desc="Multi-week residencies — Zuzalu-style gatherings for builders and researchers."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left mt-3">
            <DivisionCard
              code="DIV-04"
              href="/intel?lane=grants"
              icon={<MarketIcon className="w-5 h-5" />}
              title="Grants"
              desc="Active funding programs from protocols, foundations, and public-goods initiatives."
            />
            <DivisionCard
              code="DIV-05"
              href="/intel?lane=accelerators"
              icon={<SignalIcon className="w-5 h-5" />}
              title="Accelerators"
              desc="Accelerators and incubators currently accepting applications — crypto-native and broader founder programs."
            />
          </div>
        </div>
      </main>
    </PublicShell>
  );
}

function DivisionCard({
  code,
  href,
  icon,
  title,
  desc,
}: {
  code: string;
  href?: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="inline-flex items-center justify-center w-9 h-9 rounded-sm bg-[var(--rex-bg)] border border-[var(--rex-border-subtle)] text-[var(--rex-accent)] group-hover:border-[var(--rex-accent)] transition-all">
          {icon}
        </div>
        <span className="mono-label-accent text-[10px]">{code}</span>
      </div>
      <h3 className="font-display text-lg font-semibold text-white mb-1.5 tracking-tight">
        {title}
      </h3>
      <p className="text-[13px] text-[var(--rex-text-muted)] leading-relaxed">
        {desc}
      </p>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="rex-card-flat p-5 group block hover:bg-[var(--rex-surface-2)]">
        {body}
      </Link>
    );
  }
  return <div className="rex-card-flat p-5 group cursor-default">{body}</div>;
}
