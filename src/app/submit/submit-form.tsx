"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PublicShell } from "@/components/public-shell";

type Tab = "intel" | "event";
type FormStatus = "idle" | "loading" | "success" | "error";

export default function SubmitForm() {
  const [tab, setTab] = useState<Tab>("intel");
  // Compute on mount only — Date.now() at render time differs between SSR and
  // client and triggers a hydration mismatch on this purely cosmetic value.
  const [transmissionId, setTransmissionId] = useState("RX-DROP-------");
  useEffect(() => {
    setTransmissionId(`RX-DROP-${String(Date.now()).slice(-6)}`);
  }, []);

  return (
    <PublicShell
      sceneHeight="520px"
      classification={[
        { text: "● Classified // Drop Channel" },
        { text: "Source Intake / Anonymous OK", show: "sm" },
        { text: `Channel ${transmissionId}`, show: "md" },
      ]}
    >
      <main className="max-w-2xl mx-auto px-6 pt-8 md:pt-14 pb-24">
        <div className="mb-8 text-center">
          <p
            className="text-xs uppercase tracking-widest mb-2"
            style={{ color: "var(--rex-text-dim)" }}
          >
            ▸ Source Intake
          </p>
          <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight text-white mb-3">
            Drop the intel.
          </h1>
          <p className="text-sm md:text-base text-[var(--rex-text-muted)] max-w-md mx-auto leading-relaxed">
            Tip-offs, leaks, sightings, events worth our analysts' attention.
            Anonymous submissions accepted. Verified intel may be featured in
            the briefing.
          </p>
        </div>

        <div className="flex gap-2 mb-6 p-1 rounded-sm border border-[var(--rex-border-subtle)] bg-[var(--rex-surface)]">
          <TabButton active={tab === "intel"} onClick={() => setTab("intel")}>
            Submit Intel
          </TabButton>
          <TabButton active={tab === "event"} onClick={() => setTab("event")}>
            Submit Event
          </TabButton>
        </div>

        {tab === "intel" ? <IntelForm /> : <EventForm />}
      </main>
    </PublicShell>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 px-4 py-2 rounded-sm text-xs font-mono uppercase tracking-widest transition-all"
      style={{
        background: active ? "var(--rex-bg)" : "transparent",
        color: active ? "var(--rex-accent)" : "var(--rex-text-dim)",
        border: active
          ? "1px solid var(--rex-accent)"
          : "1px solid transparent",
      }}
    >
      {children}
    </button>
  );
}

function IntelForm() {
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [linksRaw, setLinksRaw] = useState("");
  const [sourcesRaw, setSourcesRaw] = useState("");
  const [severity, setSeverity] = useState<
    "" | "low" | "medium" | "high" | "critical"
  >("");
  const [category, setCategory] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [submitterHandle, setSubmitterHandle] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");

    const payload = {
      headline,
      body,
      links: splitLines(linksRaw),
      sources: splitLines(sourcesRaw),
      severity: severity || undefined,
      category: category.trim() || undefined,
      anonymous,
    };

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "intel",
          payload,
          submitterEmail: anonymous ? undefined : submitterEmail || undefined,
          submitterHandle: anonymous ? undefined : submitterHandle || undefined,
          website,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("success");
        setMessage(data.message);
      } else {
        setStatus("error");
        setMessage(data.error || "Transmission failed.");
      }
    } catch {
      setStatus("error");
      setMessage("Channel disrupted. Retry.");
    }
  }

  if (status === "success") {
    return <SuccessPanel message={message} />;
  }

  return (
    <form onSubmit={handleSubmit} className="rex-card p-6 space-y-4">
      <Honeypot value={website} onChange={setWebsite} />

      <div>
        <Label>Headline</Label>
        <input
          type="text"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          required
          minLength={5}
          maxLength={200}
          className="rex-input w-full"
          placeholder="One-line summary of the intel"
        />
      </div>

      <div>
        <Label>Body</Label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          minLength={20}
          maxLength={5000}
          rows={6}
          className="rex-input w-full resize-y"
          placeholder="What happened, who's involved, what we should look at, why it matters."
        />
        <Hint>{body.length}/5000</Hint>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Severity (opt.)</Label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as typeof severity)}
            className="rex-input w-full"
          >
            <option value="">—</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div>
          <Label>Category (opt.)</Label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            maxLength={60}
            className="rex-input w-full"
            placeholder="exchange-risk, exploit, sanctions…"
          />
        </div>
      </div>

      <div>
        <Label>Links (opt.)</Label>
        <textarea
          value={linksRaw}
          onChange={(e) => setLinksRaw(e.target.value)}
          rows={2}
          className="rex-input w-full font-mono text-xs"
          placeholder="https://… (one per line)"
        />
      </div>

      <div>
        <Label>Sources (opt.)</Label>
        <textarea
          value={sourcesRaw}
          onChange={(e) => setSourcesRaw(e.target.value)}
          rows={2}
          className="rex-input w-full font-mono text-xs"
          placeholder="On-chain tx hashes, primary docs, etc. (one per line)"
        />
      </div>

      <div className="border-t border-[var(--rex-border-subtle)] pt-4">
        <label className="flex items-center gap-2 mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
            className="accent-[var(--rex-accent)]"
          />
          <span className="text-sm text-[var(--rex-text-muted)]">
            Submit anonymously (recommended)
          </span>
        </label>

        {!anonymous && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email (opt.)</Label>
              <input
                type="email"
                value={submitterEmail}
                onChange={(e) => setSubmitterEmail(e.target.value)}
                className="rex-input w-full"
                placeholder="for follow-up only"
              />
            </div>
            <div>
              <Label>Handle (opt.)</Label>
              <input
                type="text"
                value={submitterHandle}
                onChange={(e) => setSubmitterHandle(e.target.value)}
                maxLength={80}
                className="rex-input w-full"
                placeholder="@yourcalling-card"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Hint>
          {anonymous
            ? "Your IP is logged for abuse prevention but not published."
            : "Email is shown only to RexIntel analysts."}
        </Hint>
        <button
          type="submit"
          disabled={status === "loading"}
          className="rex-btn"
        >
          {status === "loading" ? "Transmitting…" : "Transmit Intel ▸"}
        </button>
      </div>

      {status === "error" && (
        <p className="text-xs font-mono text-[var(--rex-danger)]">✕ {message}</p>
      )}
    </form>
  );
}

function EventForm() {
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [venue, setVenue] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState<
    "" | "conference" | "workshop" | "meetup" | "hackathon" | "other"
  >("");
  const [priceTier, setPriceTier] = useState<"" | "free" | "paid" | "invite">(
    "",
  );
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [submitterHandle, setSubmitterHandle] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");

    const payload = {
      name,
      startsAt: startsAt ? new Date(startsAt).toISOString() : "",
      endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
      venue: venue || undefined,
      city: city || undefined,
      country: country || undefined,
      url: url || undefined,
      description: description || undefined,
      eventType: eventType || undefined,
      priceTier: priceTier || undefined,
    };

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "event",
          payload,
          submitterEmail: submitterEmail || undefined,
          submitterHandle: submitterHandle || undefined,
          website,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("success");
        setMessage(data.message);
      } else {
        setStatus("error");
        setMessage(data.error || "Submission failed.");
      }
    } catch {
      setStatus("error");
      setMessage("Channel disrupted. Retry.");
    }
  }

  if (status === "success") {
    return <SuccessPanel message={message} />;
  }

  return (
    <form onSubmit={handleSubmit} className="rex-card p-6 space-y-4">
      <Honeypot value={website} onChange={setWebsite} />

      <div>
        <Label>Event Name</Label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={3}
          maxLength={200}
          className="rex-input w-full"
          placeholder="DevConnect Buenos Aires"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Starts</Label>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
            className="rex-input w-full"
          />
        </div>
        <div>
          <Label>Ends (opt.)</Label>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="rex-input w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Venue (opt.)</Label>
          <input
            type="text"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            maxLength={200}
            className="rex-input w-full"
          />
        </div>
        <div>
          <Label>City</Label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            maxLength={100}
            className="rex-input w-full"
          />
        </div>
        <div>
          <Label>Country</Label>
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            maxLength={100}
            className="rex-input w-full"
          />
        </div>
      </div>

      <div>
        <Label>URL</Label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="rex-input w-full font-mono text-xs"
          placeholder="https://…"
        />
      </div>

      <div>
        <Label>Description (opt.)</Label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={1000}
          className="rex-input w-full resize-y"
          placeholder="What's the event about, who should attend?"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Type</Label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as typeof eventType)}
            className="rex-input w-full"
          >
            <option value="">—</option>
            <option value="conference">Conference</option>
            <option value="workshop">Workshop</option>
            <option value="meetup">Meetup</option>
            <option value="hackathon">Hackathon</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <Label>Access</Label>
          <select
            value={priceTier}
            onChange={(e) => setPriceTier(e.target.value as typeof priceTier)}
            className="rex-input w-full"
          >
            <option value="">—</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
            <option value="invite">Invite-only</option>
          </select>
        </div>
      </div>

      <div className="border-t border-[var(--rex-border-subtle)] pt-4 grid grid-cols-2 gap-3">
        <div>
          <Label>Your Email (opt.)</Label>
          <input
            type="email"
            value={submitterEmail}
            onChange={(e) => setSubmitterEmail(e.target.value)}
            className="rex-input w-full"
            placeholder="for follow-up"
          />
        </div>
        <div>
          <Label>Handle / Org (opt.)</Label>
          <input
            type="text"
            value={submitterHandle}
            onChange={(e) => setSubmitterHandle(e.target.value)}
            maxLength={80}
            className="rex-input w-full"
            placeholder="who's submitting"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Hint>Reviewed before publication.</Hint>
        <button
          type="submit"
          disabled={status === "loading"}
          className="rex-btn"
        >
          {status === "loading" ? "Submitting…" : "Submit Event ▸"}
        </button>
      </div>

      {status === "error" && (
        <p className="text-xs font-mono text-[var(--rex-danger)]">✕ {message}</p>
      )}
    </form>
  );
}

function Honeypot({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
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
      <label htmlFor="website-trap">Website (leave empty)</label>
      <input
        type="text"
        id="website-trap"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block mb-1.5 text-[10px] font-mono uppercase tracking-widest"
      style={{ color: "var(--rex-text-dim)" }}
    >
      {children}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[10px] font-mono mt-1"
      style={{ color: "var(--rex-text-dim)" }}
    >
      {children}
    </p>
  );
}

function SuccessPanel({ message }: { message: string }) {
  return (
    <div className="rex-card p-8 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-4 bg-[rgba(95,185,31,0.1)] border border-[rgba(95,185,31,0.4)]">
        <svg
          className="w-5 h-5 text-[var(--rex-accent)]"
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
      </div>
      <h2 className="font-display text-xl text-white mb-2">Transmission received.</h2>
      <p className="text-sm text-[var(--rex-text-muted)] max-w-sm mx-auto">
        {message}
      </p>
      <Link
        href="/"
        className="inline-block mt-6 mono-label-accent hover:text-white transition-colors"
      >
        ← Return to Briefing Room
      </Link>
    </div>
  );
}

function splitLines(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}
