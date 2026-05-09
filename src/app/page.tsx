"use client";

import Image from "next/image";
import { useState } from "react";
import { MarketIcon, SignalIcon, ShieldIcon } from "@/components/icons";
import { HeroScene } from "@/components/hero-scene";

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  // Honeypot — bots autofill any visible/known field. Real users never see this.
  const [website, setWebsite] = useState("");
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
        body: JSON.stringify({ email, firstName, website }),
      });
      const data = await res.json();

      if (res.ok) {
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
    <div className="min-h-screen tactical-bg relative overflow-hidden">
      {/* Animated hero background — sits behind the classification bar, nav,
          and main content. Sized to one viewport so it doesn't render
          beneath the cards/footer that scroll into view below. */}
      <HeroScene />

      {/* Classification banner */}
      <div className="classification-bar relative z-20">
        <span>● Classified // Eyes Only</span>
        <span className="sep hidden sm:inline">▾</span>
        <span className="hidden sm:inline">Crypto Intelligence Division</span>
        <span className="sep hidden md:inline">▾</span>
        <span className="hidden md:inline">Transmission {transmissionId}</span>
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-sm overflow-hidden bg-white/95 ring-1 ring-[var(--rex-accent)]/40 flex items-center justify-center">
            <Image
              src="/rex-mascot.jpg"
              alt=""
              width={80}
              height={80}
              priority
              className="w-full h-full object-cover object-top"
            />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-display text-lg font-semibold tracking-tight text-white">
              Rex Intel Services
            </span>
            <span className="mono-label mt-0.5 text-[9.5px]">
              Crypto Intelligence ／ DIV-001
            </span>
          </div>
        </div>
        <div className="flex items-center gap-5 text-xs font-mono uppercase tracking-widest">
          <a
            href="/intel"
            className="hover:text-white transition-colors"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Intel
          </a>
          <a
            href="/events"
            className="hover:text-white transition-colors"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Events
          </a>
          <a
            href="/submit"
            className="hover:text-white transition-colors"
            style={{ color: "var(--rex-accent)" }}
          >
            Submit ▸
          </a>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 max-w-3xl mx-auto px-6 pt-12 md:pt-20 pb-24 text-center">
        {/* Briefing meta — coordinate / status row */}
        <div className="animate-fade-in flex flex-wrap items-center justify-center gap-3 mb-10">
          <div className="briefing-meta">
            <span className="dot" />
            <span>Channel</span>
            <span className="v">OPEN</span>
          </div>
          <div className="briefing-meta">
            <span>File</span>
            <span className="v">{transmissionId}</span>
          </div>
          <div className="briefing-meta">
            <span>Cadence</span>
            <span className="v">Monthly · 1st</span>
          </div>
        </div>

        <h1 className="font-display text-5xl md:text-7xl font-semibold tracking-tight text-white leading-[1.05] mb-6 animate-fade-in animate-fade-in-delay-1">
          Crypto intelligence,
          <br />
          <span className="text-[var(--rex-accent)]">on the record.</span>
        </h1>

        <p className="text-base md:text-lg text-[var(--rex-text-muted)] leading-relaxed max-w-xl mx-auto mb-12 animate-fade-in animate-fade-in-delay-2">
          A monthly intelligence brief on the digital asset markets — on-chain
          signals, capital flows, and adversary moves. Compiled by analysts.
          Delivered without the noise.
        </p>

        {/* Signup form */}
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
              {/* Honeypot */}
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

              <p className="text-[11px] font-mono tracking-wider text-[var(--rex-text-dim)] mt-4">
                NO COST · ONE TRANSMISSION / MONTH · REVOKE ANYTIME
              </p>
            </form>
          )}
        </div>

        {/* Divisions */}
        <div className="mt-24 animate-fade-in animate-fade-in-delay-4">
          <div className="rex-divider mb-8">
            <span>Intelligence Divisions</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-left">
            <DivisionCard
              code="DIV-01"
              icon={<MarketIcon className="w-5 h-5" />}
              title="Market Analysis"
              desc="Capital rotation, liquidity maps, and structural reads on the digital asset complex."
            />
            <DivisionCard
              code="DIV-02"
              icon={<SignalIcon className="w-5 h-5" />}
              title="Alpha Signals"
              desc="On-chain anomalies and early indicators surfaced from the wires before consensus catches up."
            />
            <DivisionCard
              code="DIV-03"
              icon={<ShieldIcon className="w-5 h-5" />}
              title="Strategic Intel"
              desc="Adversary tradecraft, regulatory posture, and the strategic context behind the tape."
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[var(--rex-border-subtle)] py-6 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="mono-label flex items-center gap-3">
            <span>© {year} Rex Intel Services</span>
            <span className="text-[var(--rex-border)]">│</span>
            <span>All transmissions reserved</span>
          </div>
          <div className="mono-label flex items-center gap-3">
            <span className="pulse-dot" />
            <span>Briefing Room {transmissionId}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function DivisionCard({
  code,
  icon,
  title,
  desc,
}: {
  code: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rex-card-flat p-5 group cursor-default">
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
    </div>
  );
}
