"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PublicShell } from "@/components/public-shell";
import {
  SUPPORTED_CHAINS,
  ADDRESS_ROLES,
  type ChainSlug,
  type AddressRoleSlug,
} from "@/lib/chains";

type Tab = "intel" | "event" | "popup_city" | "grant" | "accelerator" | "job";
type FormStatus = "idle" | "loading" | "success" | "error";

const TAB_LABELS: Record<Tab, string> = {
  event: "Event",
  popup_city: "Pop-Up City",
  grant: "Grant",
  accelerator: "Accelerator",
  job: "Job",
  intel: "Intel",
};
// Order is intentional — Event first (highest-volume), Intel last (most
// specialized / requires moderator review). Pop-up cities sit next to events
// because they share the same intake flow / lu.ma URLs.
const TAB_ORDER: Tab[] = ["event", "popup_city", "grant", "accelerator", "job", "intel"];

type AddressRow = {
  chain: ChainSlug;
  address: string;
  role: AddressRoleSlug;
  label: string;
};

const EMPTY_ADDRESS_ROW: AddressRow = {
  chain: "ethereum",
  address: "",
  role: "subject",
  label: "",
};

export default function SubmitForm() {
  const searchParams = useSearchParams();
  // Default tab is "event" — the lu.ma-paste flow is the primary growth path.
  // Other tabs are reachable via ?type=<slug>.
  const requested = searchParams?.get("type") ?? "";
  const initialTab: Tab = (TAB_ORDER as readonly string[]).includes(requested)
    ? (requested as Tab)
    : "event";
  const [tab, setTab] = useState<Tab>(initialTab);
  // Compute on mount only — Date.now() at render time differs between SSR and
  // client and triggers a hydration mismatch on this purely cosmetic value.
  const [transmissionId, setTransmissionId] = useState("RX-DROP-------");
  useEffect(() => {
    setTransmissionId(`RX-DROP-${String(Date.now()).slice(-6)}`);
  }, []);

  return (
    <PublicShell
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

        <div className="flex flex-wrap gap-1.5 mb-6 p-1 rounded-sm border border-[var(--rex-border-subtle)] bg-[var(--rex-surface)]">
          {TAB_ORDER.map((t) => (
            <TabButton key={t} active={tab === t} onClick={() => setTab(t)}>
              {TAB_LABELS[t]}
            </TabButton>
          ))}
        </div>

        {tab === "intel" && <IntelForm />}
        {tab === "event" && <EventForm />}
        {tab === "popup_city" && <PopupCityForm />}
        {tab === "grant" && <GrantForm />}
        {tab === "accelerator" && <AcceleratorForm />}
        {tab === "job" && <JobForm />}
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
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-sm text-[11px] font-mono uppercase tracking-widest transition-all min-w-[80px]"
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
  const [addressRows, setAddressRows] = useState<AddressRow[]>([]);
  const [status, setStatus] = useState<FormStatus>("idle");
  const [message, setMessage] = useState("");

  function updateAddressRow(idx: number, patch: Partial<AddressRow>) {
    setAddressRows((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    );
  }
  function addAddressRow() {
    setAddressRows((rows) => [...rows, { ...EMPTY_ADDRESS_ROW }]);
  }
  function removeAddressRow(idx: number) {
    setAddressRows((rows) => rows.filter((_, i) => i !== idx));
  }

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

    // Strip empty rows client-side so the server never sees half-filled
    // entries. Server re-validates regardless.
    const addressesToSend = addressRows
      .map((r) => ({
        chain: r.chain,
        address: r.address.trim(),
        role: r.role,
        label: r.label.trim() || undefined,
      }))
      .filter((r) => r.address.length >= 4);

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "intel",
          payload,
          addresses: addressesToSend.length ? addressesToSend : undefined,
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
        <div className="flex items-center justify-between mb-2">
          <Label>Addresses (opt.)</Label>
          <button
            type="button"
            onClick={addAddressRow}
            className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)] hover:text-white transition-colors"
          >
            + Add address
          </button>
        </div>
        {addressRows.length === 0 ? (
          <Hint>
            Tag any wallets / accounts referenced. Builds the cluster graph.
          </Hint>
        ) : (
          <div className="space-y-2">
            {addressRows.map((row, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 items-start"
              >
                <select
                  value={row.chain}
                  onChange={(e) =>
                    updateAddressRow(idx, {
                      chain: e.target.value as ChainSlug,
                    })
                  }
                  className="rex-input col-span-3 text-xs"
                  aria-label="Chain"
                >
                  {SUPPORTED_CHAINS.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={row.address}
                  onChange={(e) =>
                    updateAddressRow(idx, { address: e.target.value })
                  }
                  className="rex-input col-span-5 font-mono text-xs"
                  placeholder="0x… / bc1… / etc."
                  maxLength={200}
                  aria-label="Address"
                />
                <select
                  value={row.role}
                  onChange={(e) =>
                    updateAddressRow(idx, {
                      role: e.target.value as AddressRoleSlug,
                    })
                  }
                  className="rex-input col-span-3 text-xs"
                  aria-label="Role"
                >
                  {ADDRESS_ROLES.map((r) => (
                    <option key={r.slug} value={r.slug}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeAddressRow(idx)}
                  className="col-span-1 text-[var(--rex-text-dim)] hover:text-[var(--rex-danger)] transition-colors text-sm font-mono"
                  aria-label="Remove address row"
                  title="Remove"
                >
                  ✕
                </button>
                <input
                  type="text"
                  value={row.label}
                  onChange={(e) =>
                    updateAddressRow(idx, { label: e.target.value })
                  }
                  className="rex-input col-span-11 col-start-1 sm:col-start-4 sm:col-span-8 text-xs"
                  placeholder='Optional label — e.g. "alleged exploiter wallet"'
                  maxLength={120}
                  aria-label="Address label"
                />
              </div>
            ))}
          </div>
        )}
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
  // Honor ?eventType=hackathon (and any other valid eventType) so deep links
  // from /hackathons → /submit?type=event&eventType=hackathon land with the
  // dropdown pre-selected. Read-only; user can still change it after mount.
  const searchParams = useSearchParams();
  const requestedType = searchParams?.get("eventType") ?? "";
  const validEventTypes = [
    "conference",
    "workshop",
    "meetup",
    "hackathon",
    "other",
  ] as const;
  const initialEventType: (typeof validEventTypes)[number] | "" =
    (validEventTypes as readonly string[]).includes(requestedType)
      ? (requestedType as (typeof validEventTypes)[number])
      : "";

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
  >(initialEventType);
  const [priceTier, setPriceTier] = useState<"" | "free" | "paid" | "invite">(
    "",
  );
  const [imageUrl, setImageUrl] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [submitterHandle, setSubmitterHandle] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [message, setMessage] = useState("");

  // ── URL-paste prefill state ───────────────────────────────────────
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasteStatus, setPasteStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [pasteMessage, setPasteMessage] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);

  async function handleFetchUrl() {
    const target = pasteUrl.trim();
    if (!target) return;
    setPasteStatus("loading");
    setPasteMessage("");
    try {
      const res = await fetch("/api/events/parse-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPasteStatus("error");
        setPasteMessage(data.error || "Couldn't parse that URL.");
        return;
      }
      applyParsedPayload(data.payload || {});
      setAutoApprove(Boolean(data.trusted));
      setPasteStatus("success");
      setPasteMessage(
        data.trusted
          ? "✓ Filled from trusted source — will publish immediately."
          : "✓ Filled from URL — review and submit for moderation.",
      );
    } catch {
      setPasteStatus("error");
      setPasteMessage("Channel disrupted. Retry.");
    }
  }

  function applyParsedPayload(p: Record<string, unknown>) {
    if (typeof p.name === "string") setName(p.name);
    if (typeof p.startsAt === "string") setStartsAt(isoToDatetimeLocal(p.startsAt));
    if (typeof p.endsAt === "string") setEndsAt(isoToDatetimeLocal(p.endsAt));
    if (typeof p.venue === "string") setVenue(p.venue);
    if (typeof p.city === "string") setCity(p.city);
    if (typeof p.country === "string") setCountry(p.country);
    if (typeof p.url === "string") setUrl(p.url);
    if (typeof p.description === "string") setDescription(p.description);
    if (typeof p.imageUrl === "string") setImageUrl(p.imageUrl);
    if (
      typeof p.eventType === "string" &&
      ["conference", "workshop", "meetup", "hackathon", "other"].includes(
        p.eventType,
      )
    ) {
      setEventType(p.eventType as typeof eventType);
    }
  }

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
      imageUrl: imageUrl || undefined,
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

      <div className="border border-[var(--rex-accent)]/30 bg-[var(--rex-accent)]/[0.04] rounded-sm p-4">
        <Label>Got a lu.ma / Eventbrite link?</Label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="url"
            value={pasteUrl}
            onChange={(e) => setPasteUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleFetchUrl();
              }
            }}
            className="rex-input flex-1"
            placeholder="https://lu.ma/your-event"
            disabled={pasteStatus === "loading"}
          />
          <button
            type="button"
            onClick={handleFetchUrl}
            disabled={pasteStatus === "loading" || !pasteUrl.trim()}
            className="rex-btn whitespace-nowrap"
          >
            {pasteStatus === "loading" ? "Fetching…" : "Auto-fill ▸"}
          </button>
        </div>
        {pasteMessage && (
          <p
            className={`mt-2 text-[11px] font-mono ${
              pasteStatus === "error"
                ? "text-[var(--rex-danger)]"
                : "text-[var(--rex-accent)]"
            }`}
          >
            {pasteMessage}
          </p>
        )}
        {pasteStatus === "idle" && (
          <Hint>
            Paste the event URL and we&apos;ll fill the form. Trusted sources
            (lu.ma, eventbrite, ethglobal, meetup) publish immediately.
          </Hint>
        )}
      </div>

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
        <Hint>
          {autoApprove
            ? "Trusted source — publishes immediately on submit."
            : "Reviewed by an analyst before publication."}
        </Hint>
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

// ─────────────────────────────────────────────────────────────────────
// Pop-Up City form — multi-week residency, mostly lu.ma-driven
// ─────────────────────────────────────────────────────────────────────

function PopupCityForm() {
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [organizationUrl, setOrganizationUrl] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [venue, setVenue] = useState("");
  const [url, setUrl] = useState("");
  const [applyUrl, setApplyUrl] = useState("");
  const [applicationDeadline, setApplicationDeadline] = useState("");
  const [focus, setFocus] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [submitterHandle, setSubmitterHandle] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [message, setMessage] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);

  // Pop-up cities use the same event-URL parser (almost all are listed on
  // lu.ma). The parser returns event fields, which map cleanly onto our
  // pop-up payload — just into different state setters.
  function applyParsed(p: Record<string, unknown>) {
    if (typeof p.name === "string") setName(p.name);
    if (typeof p.startsAt === "string") setStartsAt(isoToDatetimeLocal(p.startsAt));
    if (typeof p.endsAt === "string") setEndsAt(isoToDatetimeLocal(p.endsAt));
    if (typeof p.city === "string") setCity(p.city);
    if (typeof p.country === "string") setCountry(p.country);
    if (typeof p.venue === "string") setVenue(p.venue);
    if (typeof p.url === "string") setUrl(p.url);
    if (typeof p.description === "string") setDescription(p.description);
    if (typeof p.imageUrl === "string") setImageUrl(p.imageUrl);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");

    const payload = {
      name,
      organization: organization || undefined,
      organizationUrl: organizationUrl || undefined,
      description,
      startsAt: startsAt ? new Date(startsAt).toISOString() : "",
      endsAt: endsAt ? new Date(endsAt).toISOString() : "",
      city: city || undefined,
      country: country || undefined,
      venue: venue || undefined,
      url: url || undefined,
      applyUrl: applyUrl || undefined,
      applicationDeadline: applicationDeadline
        ? new Date(applicationDeadline).toISOString()
        : undefined,
      focus: focus || undefined,
      imageUrl: imageUrl || undefined,
    };

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "popup_city",
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

  if (status === "success") return <SuccessPanel message={message} />;

  return (
    <form onSubmit={handleSubmit} className="rex-card p-6 space-y-4">
      <Honeypot value={website} onChange={setWebsite} />

      <UrlPasteBox
        endpoint="/api/events/parse-url"
        placeholder="https://lu.ma/your-popup-city"
        copy="Got a lu.ma / event page?"
        onApply={applyParsed}
        onTrustedChange={setAutoApprove}
      />

      <Field label="Name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={3}
          maxLength={200}
          className="rex-input w-full"
          placeholder="Edge City Lanna"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts">
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
            className="rex-input w-full"
          />
        </Field>
        <Field label="Ends">
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            required
            className="rex-input w-full"
          />
        </Field>
      </div>

      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          minLength={20}
          maxLength={5000}
          rows={4}
          className="rex-input w-full resize-y"
          placeholder="What the residency is about, who should apply, what to expect."
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="City">
          <input type="text" value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} className="rex-input w-full" />
        </Field>
        <Field label="Country">
          <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={100} className="rex-input w-full" />
        </Field>
        <Field label="Venue (opt.)">
          <input type="text" value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={200} className="rex-input w-full" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Event URL">
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} className="rex-input w-full font-mono text-xs" placeholder="https://…" />
        </Field>
        <Field label="Apply URL">
          <input type="url" value={applyUrl} onChange={(e) => setApplyUrl(e.target.value)} className="rex-input w-full font-mono text-xs" placeholder="https://…" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Application Deadline (opt.)">
          <input
            type="datetime-local"
            value={applicationDeadline}
            onChange={(e) => setApplicationDeadline(e.target.value)}
            className="rex-input w-full"
          />
        </Field>
        <Field label="Focus (opt.)">
          <input
            type="text"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            maxLength={200}
            className="rex-input w-full"
            placeholder="DeFi / Longevity / ZK research"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Host Org (opt.)">
          <input type="text" value={organization} onChange={(e) => setOrganization(e.target.value)} maxLength={120} className="rex-input w-full" />
        </Field>
        <Field label="Host Org URL (opt.)">
          <input type="url" value={organizationUrl} onChange={(e) => setOrganizationUrl(e.target.value)} className="rex-input w-full font-mono text-xs" />
        </Field>
      </div>

      <SubmitterFields
        email={submitterEmail}
        setEmail={setSubmitterEmail}
        handle={submitterHandle}
        setHandle={setSubmitterHandle}
      />

      <SubmitRow autoApprove={autoApprove} status={status} message={message} label="Submit Pop-Up City ▸" />
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Grant form
// ─────────────────────────────────────────────────────────────────────

function GrantForm() {
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [organizationUrl, setOrganizationUrl] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [focus, setFocus] = useState("");
  const [applyUrl, setApplyUrl] = useState("");
  const [deadline, setDeadline] = useState("");
  const [rolling, setRolling] = useState(false);
  const [tagsRaw, setTagsRaw] = useState("");
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
      organization,
      organizationUrl: organizationUrl || undefined,
      description,
      amount: amount || undefined,
      focus: focus || undefined,
      applyUrl: applyUrl || undefined,
      deadline: deadline ? new Date(deadline).toISOString() : undefined,
      rolling,
      tags: parseTagsInput(tagsRaw),
    };

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "grant",
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

  if (status === "success") return <SuccessPanel message={message} />;

  return (
    <form onSubmit={handleSubmit} className="rex-card p-6 space-y-4">
      <Honeypot value={website} onChange={setWebsite} />

      <Field label="Grant Name">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={200} className="rex-input w-full" placeholder="Ecosystem Support Program" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Organization">
          <input type="text" value={organization} onChange={(e) => setOrganization(e.target.value)} required minLength={2} maxLength={120} className="rex-input w-full" placeholder="Ethereum Foundation" />
        </Field>
        <Field label="Organization URL (opt.)">
          <input type="url" value={organizationUrl} onChange={(e) => setOrganizationUrl(e.target.value)} className="rex-input w-full font-mono text-xs" placeholder="https://…" />
        </Field>
      </div>

      <Field label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} required minLength={20} maxLength={5000} rows={4} className="rex-input w-full resize-y" placeholder="What gets funded, what doesn't, who should apply." />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (opt.)">
          <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} maxLength={200} className="rex-input w-full" placeholder="Up to $250k" />
        </Field>
        <Field label="Focus (opt.)">
          <input type="text" value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={200} className="rex-input w-full" placeholder="Public goods / Infrastructure" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Apply URL">
          <input type="url" value={applyUrl} onChange={(e) => setApplyUrl(e.target.value)} className="rex-input w-full font-mono text-xs" placeholder="https://…" />
        </Field>
        <Field label="Deadline (opt.)">
          <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="rex-input w-full" disabled={rolling} />
        </Field>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={rolling} onChange={(e) => setRolling(e.target.checked)} className="accent-[var(--rex-accent)]" />
        <span className="text-sm text-[var(--rex-text-muted)]">Rolling — accepting applications continuously</span>
      </label>

      <Field label="Tags (opt., comma-separated)">
        <input type="text" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} className="rex-input w-full font-mono text-xs" placeholder="zk, infra, public-goods" />
      </Field>

      <SubmitterFields email={submitterEmail} setEmail={setSubmitterEmail} handle={submitterHandle} setHandle={setSubmitterHandle} />

      <SubmitRow status={status} message={message} label="Submit Grant ▸" trustedHint="Trusted grant org? Publishes immediately." />
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Accelerator form
// ─────────────────────────────────────────────────────────────────────

function AcceleratorForm() {
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [organizationUrl, setOrganizationUrl] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("");
  const [investment, setInvestment] = useState("");
  const [location, setLocation] = useState("");
  const [focus, setFocus] = useState("");
  const [applyUrl, setApplyUrl] = useState("");
  const [nextDeadline, setNextDeadline] = useState("");
  const [rolling, setRolling] = useState(false);
  const [tagsRaw, setTagsRaw] = useState("");
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
      organization,
      organizationUrl: organizationUrl || undefined,
      description,
      duration: duration || undefined,
      investment: investment || undefined,
      location: location || undefined,
      focus: focus || undefined,
      applyUrl: applyUrl || undefined,
      nextDeadline: nextDeadline ? new Date(nextDeadline).toISOString() : undefined,
      rolling,
      tags: parseTagsInput(tagsRaw),
    };
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "accelerator",
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

  if (status === "success") return <SuccessPanel message={message} />;

  return (
    <form onSubmit={handleSubmit} className="rex-card p-6 space-y-4">
      <Honeypot value={website} onChange={setWebsite} />

      <Field label="Program Name">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={200} className="rex-input w-full" placeholder="Alliance DAO Cohort 12" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Organization">
          <input type="text" value={organization} onChange={(e) => setOrganization(e.target.value)} required minLength={2} maxLength={120} className="rex-input w-full" placeholder="Alliance" />
        </Field>
        <Field label="Organization URL (opt.)">
          <input type="url" value={organizationUrl} onChange={(e) => setOrganizationUrl(e.target.value)} className="rex-input w-full font-mono text-xs" placeholder="https://…" />
        </Field>
      </div>

      <Field label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} required minLength={20} maxLength={5000} rows={4} className="rex-input w-full resize-y" placeholder="Stage, thesis, what founders get, what's required." />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Duration (opt.)">
          <input type="text" value={duration} onChange={(e) => setDuration(e.target.value)} maxLength={100} className="rex-input w-full" placeholder="3 months" />
        </Field>
        <Field label="Investment (opt.)">
          <input type="text" value={investment} onChange={(e) => setInvestment(e.target.value)} maxLength={200} className="rex-input w-full" placeholder="$500k SAFE" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Location (opt.)">
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} className="rex-input w-full" placeholder="San Francisco / Remote" />
        </Field>
        <Field label="Focus (opt.)">
          <input type="text" value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={200} className="rex-input w-full" placeholder="Early-stage crypto" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Apply URL">
          <input type="url" value={applyUrl} onChange={(e) => setApplyUrl(e.target.value)} className="rex-input w-full font-mono text-xs" placeholder="https://…" />
        </Field>
        <Field label="Next Deadline (opt.)">
          <input type="datetime-local" value={nextDeadline} onChange={(e) => setNextDeadline(e.target.value)} className="rex-input w-full" disabled={rolling} />
        </Field>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={rolling} onChange={(e) => setRolling(e.target.checked)} className="accent-[var(--rex-accent)]" />
        <span className="text-sm text-[var(--rex-text-muted)]">Rolling intake</span>
      </label>

      <Field label="Tags (opt., comma-separated)">
        <input type="text" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} className="rex-input w-full font-mono text-xs" placeholder="defi, infra, consumer" />
      </Field>

      <SubmitterFields email={submitterEmail} setEmail={setSubmitterEmail} handle={submitterHandle} setHandle={setSubmitterHandle} />

      <SubmitRow status={status} message={message} label="Submit Accelerator ▸" />
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Job form
// ─────────────────────────────────────────────────────────────────────

function JobForm() {
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [remote, setRemote] = useState(false);
  const [employmentType, setEmploymentType] = useState<
    "" | "full-time" | "part-time" | "contract" | "internship"
  >("");
  const [seniority, setSeniority] = useState<
    "" | "junior" | "mid" | "senior" | "staff" | "principal" | "exec"
  >("");
  const [compensation, setCompensation] = useState("");
  const [applyUrl, setApplyUrl] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [submitterHandle, setSubmitterHandle] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    const payload = {
      title,
      company,
      companyUrl: companyUrl || undefined,
      description,
      location: location || undefined,
      remote,
      employmentType: employmentType || undefined,
      seniority: seniority || undefined,
      compensation: compensation || undefined,
      applyUrl: applyUrl || undefined,
      tags: parseTagsInput(tagsRaw),
    };
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "job",
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

  if (status === "success") return <SuccessPanel message={message} />;

  return (
    <form onSubmit={handleSubmit} className="rex-card p-6 space-y-4">
      <Honeypot value={website} onChange={setWebsite} />

      <Field label="Role Title">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={200} className="rex-input w-full" placeholder="Senior Smart Contract Engineer" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Company">
          <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} required minLength={2} maxLength={120} className="rex-input w-full" />
        </Field>
        <Field label="Company URL (opt.)">
          <input type="url" value={companyUrl} onChange={(e) => setCompanyUrl(e.target.value)} className="rex-input w-full font-mono text-xs" placeholder="https://…" />
        </Field>
      </div>

      <Field label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} required minLength={20} maxLength={5000} rows={5} className="rex-input w-full resize-y" placeholder="What you'll build, what you need, the team." />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Location (opt.)">
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} className="rex-input w-full" placeholder="San Francisco, CA" />
        </Field>
        <Field label="Employment">
          <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value as typeof employmentType)} className="rex-input w-full">
            <option value="">—</option>
            <option value="full-time">Full-time</option>
            <option value="part-time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="internship">Internship</option>
          </select>
        </Field>
        <Field label="Seniority">
          <select value={seniority} onChange={(e) => setSeniority(e.target.value as typeof seniority)} className="rex-input w-full">
            <option value="">—</option>
            <option value="junior">Junior</option>
            <option value="mid">Mid</option>
            <option value="senior">Senior</option>
            <option value="staff">Staff</option>
            <option value="principal">Principal</option>
            <option value="exec">Exec</option>
          </select>
        </Field>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} className="accent-[var(--rex-accent)]" />
        <span className="text-sm text-[var(--rex-text-muted)]">Remote OK</span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Compensation (opt.)">
          <input type="text" value={compensation} onChange={(e) => setCompensation(e.target.value)} maxLength={200} className="rex-input w-full" placeholder="$160k–$220k + equity" />
        </Field>
        <Field label="Apply URL">
          <input type="url" value={applyUrl} onChange={(e) => setApplyUrl(e.target.value)} className="rex-input w-full font-mono text-xs" placeholder="https://boards.greenhouse.io/…" />
        </Field>
      </div>

      <Field label="Tags (opt., comma-separated)">
        <input type="text" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} className="rex-input w-full font-mono text-xs" placeholder="solidity, rust, frontend" />
      </Field>

      <SubmitterFields email={submitterEmail} setEmail={setSubmitterEmail} handle={submitterHandle} setHandle={setSubmitterHandle} />

      <SubmitRow status={status} message={message} label="Submit Job ▸" trustedHint="Greenhouse / Lever / Ashby URLs publish immediately." />
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared sub-components for the new forms
// ─────────────────────────────────────────────────────────────────────

function UrlPasteBox({
  endpoint,
  placeholder,
  copy,
  onApply,
  onTrustedChange,
}: {
  endpoint: string;
  placeholder: string;
  copy: string;
  onApply: (payload: Record<string, unknown>) => void;
  onTrustedChange?: (trusted: boolean) => void;
}) {
  const [url, setUrl] = useState("");
  const [s, setS] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function fetchIt() {
    const target = url.trim();
    if (!target) return;
    setS("loading");
    setMsg("");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const data = await res.json();
      if (!res.ok) {
        setS("error");
        setMsg(data.error || "Couldn't parse that URL.");
        return;
      }
      onApply(data.payload || {});
      onTrustedChange?.(Boolean(data.trusted));
      setS("success");
      setMsg(
        data.trusted
          ? "✓ Filled from trusted source — will publish immediately."
          : "✓ Filled from URL — review and submit for moderation.",
      );
    } catch {
      setS("error");
      setMsg("Channel disrupted. Retry.");
    }
  }

  return (
    <div className="border border-[var(--rex-accent)]/30 bg-[var(--rex-accent)]/[0.04] rounded-sm p-4">
      <Label>{copy}</Label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              fetchIt();
            }
          }}
          className="rex-input flex-1"
          placeholder={placeholder}
          disabled={s === "loading"}
        />
        <button
          type="button"
          onClick={fetchIt}
          disabled={s === "loading" || !url.trim()}
          className="rex-btn whitespace-nowrap"
        >
          {s === "loading" ? "Fetching…" : "Auto-fill ▸"}
        </button>
      </div>
      {msg && (
        <p
          className={`mt-2 text-[11px] font-mono ${
            s === "error" ? "text-[var(--rex-danger)]" : "text-[var(--rex-accent)]"
          }`}
        >
          {msg}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SubmitterFields({
  email,
  setEmail,
  handle,
  setHandle,
}: {
  email: string;
  setEmail: (v: string) => void;
  handle: string;
  setHandle: (v: string) => void;
}) {
  return (
    <div className="border-t border-[var(--rex-border-subtle)] pt-4 grid grid-cols-2 gap-3">
      <Field label="Your Email (opt.)">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rex-input w-full"
          placeholder="for follow-up"
        />
      </Field>
      <Field label="Handle / Org (opt.)">
        <input
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          maxLength={80}
          className="rex-input w-full"
          placeholder="who's submitting"
        />
      </Field>
    </div>
  );
}

function SubmitRow({
  status,
  message,
  label,
  autoApprove,
  trustedHint,
}: {
  status: FormStatus;
  message: string;
  label: string;
  autoApprove?: boolean;
  trustedHint?: string;
}) {
  return (
    <>
      <div className="flex items-center justify-between pt-2">
        <Hint>
          {autoApprove
            ? "Trusted source — publishes immediately on submit."
            : trustedHint ?? "Reviewed by an analyst before publication."}
        </Hint>
        <button type="submit" disabled={status === "loading"} className="rex-btn">
          {status === "loading" ? "Submitting…" : label}
        </button>
      </div>
      {status === "error" && (
        <p className="text-xs font-mono text-[var(--rex-danger)]">✕ {message}</p>
      )}
    </>
  );
}

function parseTagsInput(raw: string): string[] | undefined {
  const tags = raw
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return tags.length ? tags : undefined;
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

// Datetime-local inputs expect "YYYY-MM-DDTHH:mm" in the browser's local
// timezone. The parse-url endpoint returns ISO UTC, so we convert here so
// the prefill displays the correct wall-clock time for the user. The form's
// own submit path converts back to ISO via new Date(value).toISOString().
function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
