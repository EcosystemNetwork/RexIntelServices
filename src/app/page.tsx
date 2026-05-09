"use client";

import Image from "next/image";
import { useState } from "react";
import { MarketIcon, SignalIcon, ShieldIcon } from "@/components/icons";

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
        setMessage("You're in. Expect your first briefing soon.");
        setEmail("");
        setFirstName("");
        setWebsite("");
      } else {
        setStatus("error");
        setMessage(data.error || "Something went wrong. Try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Connection failed. Please try again.");
    }
  }

  return (
    <div className="min-h-screen hero-gradient relative overflow-hidden">
      {/* Decorative glow orbs */}
      <div className="glow-orb" style={{ top: "-200px", right: "-100px" }} />
      <div
        className="glow-orb"
        style={{ bottom: "-250px", left: "-150px", opacity: 0.5 }}
      />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/95 ring-1 ring-[var(--rex-border)] flex items-center justify-center">
            <Image
              src="/rex-mascot.jpg"
              alt=""
              width={80}
              height={80}
              priority
              className="w-full h-full object-cover object-top"
            />
          </div>
          <span className="font-display text-xl font-semibold tracking-tight text-white">
            Rex Intel Services
          </span>
        </div>
        <a
          href="/login"
          className="text-sm text-[var(--rex-text-muted)] hover:text-white transition-colors"
        >
          Admin →
        </a>
      </nav>

      {/* Hero */}
      <main className="relative z-10 max-w-3xl mx-auto px-6 pt-10 md:pt-16 pb-24 text-center">
        <div className="animate-fade-in mb-10 md:mb-14">
          <div className="rounded-2xl overflow-hidden border border-[var(--rex-border)] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]">
            <Image
              src="/rex-banner.png"
              alt="Rex Intel Services — Intelligence. Innovation. Impact."
              width={2000}
              height={667}
              priority
              sizes="(max-width: 768px) 100vw, 768px"
              className="w-full h-auto"
            />
          </div>
        </div>

        <div className="animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[var(--rex-border)] bg-[var(--rex-surface)] text-xs text-[var(--rex-text-muted)] mb-8">
            <span className="pulse-dot" />
            Monthly briefings — Delivered the 1st of each month
          </div>
        </div>

        <h1 className="font-display text-5xl md:text-7xl font-semibold tracking-tight text-white mb-6 animate-fade-in animate-fade-in-delay-1">
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

        <p className="text-lg md:text-xl text-[var(--rex-text-muted)] leading-relaxed max-w-2xl mx-auto mb-12 animate-fade-in animate-fade-in-delay-2">
          Curated market analysis, alpha signals, and strategic intel — condensed
          into one monthly briefing that cuts through the noise.
        </p>

        {/* Signup Form */}
        <div className="animate-fade-in animate-fade-in-delay-3">
          {status === "success" ? (
            <div className="inline-flex items-center gap-3 px-6 py-4 rounded-xl border border-[rgba(52,211,153,0.3)] bg-[rgba(52,211,153,0.08)]">
              <svg
                className="w-5 h-5 text-[var(--rex-success)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-[var(--rex-success)] font-medium">
                {message}
              </span>
            </div>
          ) : (
            <form onSubmit={handleSubscribe} className="max-w-lg mx-auto">
              {/* Honeypot — hidden from real users, irresistible to bots */}
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
              <div className="flex flex-col sm:flex-row gap-3 mb-3">
                <input
                  type="text"
                  placeholder="First name (optional)"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="rex-input sm:max-w-[160px]"
                  id="subscribe-first-name"
                />
                <input
                  type="email"
                  placeholder="your@email.com"
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
                        className="animate-spin w-4 h-4"
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
                      Joining…
                    </>
                  ) : (
                    "Get Intel →"
                  )}
                </button>
              </div>

              {status === "error" && (
                <p className="text-sm text-[var(--rex-danger)]">{message}</p>
              )}

              <p className="text-xs text-[var(--rex-text-dim)] mt-4">
                Free. Once a month. No spam. Unsubscribe anytime.
              </p>
            </form>
          )}
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-20 animate-fade-in animate-fade-in-delay-4">
          <FeatureCard
            icon={<MarketIcon className="w-7 h-7" />}
            title="Market Analysis"
            desc="Deep dives into trends, patterns, and emerging opportunities."
          />
          <FeatureCard
            icon={<SignalIcon className="w-7 h-7" />}
            title="Alpha Signals"
            desc="Early indicators and insights before they hit the mainstream."
          />
          <FeatureCard
            icon={<ShieldIcon className="w-7 h-7" />}
            title="Strategic Intel"
            desc="Actionable intelligence to inform your decision-making."
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[var(--rex-border-subtle)] py-8 px-6 text-center text-xs text-[var(--rex-text-dim)]">
        © {new Date().getFullYear()} Rex Intel Services. All rights reserved.
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rex-card p-6 text-left hover:border-[var(--rex-accent)] transition-all group cursor-default">
      <div className="mb-4 inline-flex items-center justify-center w-11 h-11 rounded-lg bg-[var(--rex-surface-2)] border border-[var(--rex-border-subtle)] group-hover:border-[var(--rex-accent)] group-hover:scale-105 transition-all">
        {icon}
      </div>
      <h3 className="font-display text-lg font-medium text-white mb-1 group-hover:text-[var(--rex-accent-hover)]">
        {title}
      </h3>
      <p className="text-sm text-[var(--rex-text-muted)] leading-relaxed">
        {desc}
      </p>
    </div>
  );
}
