/**
 * Lu.ma calendar harvester. Pulls upcoming events from a curated allowlist
 * of host calendars, scores them against a "worth a founder's time" rubric,
 * and inserts the survivors as `submissions` rows (status=approved for
 * auto-trust calendars, status=pending for everything else).
 *
 * Strategy: lu.ma calendar pages ship a complete schema.org `ItemList` of
 * upcoming events in JSON-LD on every public calendar URL. One fetch per
 * calendar yields 8–20 events with full name/date/location/organizer/hosts.
 * We don't need a second fetch per event for the v1 scoring.
 *
 * Curation philosophy: the curator allowlist *is* the filter. We only follow
 * calendars whose host already does the "is this cool?" sorting for us
 * (ETHGlobal, EF, a16z crypto, AGI House, YC, etc.). Title denylist catches
 * the tourist patterns ("Intro to / 101 / Networking Night") that slip
 * through. Better to skip 5 good events than show 1 bad one.
 */
import type { EventPayload } from "@/lib/db/schema";

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 3_000_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; RexIntelBot/1.0; +https://rexintelservices.com)";

// ───────────────────────────────────────────────────────────────────────
// Curator calendar allowlist
// ───────────────────────────────────────────────────────────────────────

export type CalendarTrust = "auto" | "moderate";

export type CuratorCalendar = {
  /** Lu.ma slug. Calendar URL is `https://lu.ma/<slug>`. */
  slug: string;
  /** auto = publish unless title hits the denylist. moderate = enqueue for human review unless title hits founder-boost patterns. */
  trust: CalendarTrust;
  /** Tags applied to every event harvested from this calendar (in addition to inferred tags). */
  tags?: string[];
  /** One-line label for logs / admin UI. */
  note?: string;
};

// Slugs marked "verified" returned HTTP 200 in initial probe. Slugs we couldn't
// locate are omitted — better to ship a smaller verified list than have the
// cron log 14 404s every day. Add new slugs here as you confirm them.
export const LUMA_CURATOR_CALENDARS: CuratorCalendar[] = [
  // ── Web3 — auto-trust (verified) ──────────────────────────────────────
  { slug: "ethglobal", trust: "auto", tags: ["ethereum", "ethglobal"], note: "ETHGlobal" },
  { slug: "ethdenver", trust: "auto", tags: ["ethereum", "ethdenver"], note: "ETHDenver" },
  { slug: "ethcc", trust: "auto", tags: ["ethereum", "ethcc"], note: "EthCC" },
  { slug: "devconnect", trust: "auto", tags: ["ethereum", "devconnect"], note: "Devconnect" },
  { slug: "ef", trust: "auto", tags: ["ethereum", "ef"], note: "Ethereum Foundation" },
  { slug: "crecimiento", trust: "auto", tags: ["popup-city", "buenos-aires"], note: "Crecimiento" },
  { slug: "paradigm", trust: "auto", tags: ["vc", "paradigm"], note: "Paradigm" },
  { slug: "base", trust: "auto", tags: ["base", "coinbase"], note: "Base" },
  { slug: "solana", trust: "auto", tags: ["solana"], note: "Solana" },
  { slug: "warpcast", trust: "auto", tags: ["farcaster"], note: "Farcaster / Warpcast" },
  { slug: "monad", trust: "auto", tags: ["monad"], note: "Monad" },
  { slug: "flashbots", trust: "auto", tags: ["mev", "flashbots"], note: "Flashbots" },
  { slug: "optimism", trust: "auto", tags: ["optimism"], note: "Optimism" },
  { slug: "arbitrum", trust: "auto", tags: ["arbitrum"], note: "Arbitrum" },
  { slug: "uniswap", trust: "auto", tags: ["uniswap", "defi"], note: "Uniswap" },
  { slug: "consensys", trust: "auto", tags: ["ethereum", "consensys"], note: "ConsenSys" },

  // ── AI / robotics — auto-trust (verified) ─────────────────────────────
  { slug: "agi-house", trust: "auto", tags: ["ai", "agihouse"], note: "AGI House" },
  { slug: "aiengineer", trust: "auto", tags: ["ai", "engineering"], note: "AI Engineer" },
  { slug: "southparkcommons", trust: "auto", tags: ["founders", "spc"], note: "South Park Commons" },
  { slug: "replit", trust: "auto", tags: ["ai", "replit"], note: "Replit" },
  { slug: "huggingface", trust: "auto", tags: ["ai", "huggingface"], note: "Hugging Face" },
  { slug: "cerebralvalley", trust: "auto", tags: ["ai"], note: "Cerebral Valley" },

  // ── Cross-cutting founder rooms — auto-trust (verified) ───────────────
  { slug: "ycombinator", trust: "auto", tags: ["founders", "yc"], note: "Y Combinator" },
  { slug: "techstars", trust: "auto", tags: ["accelerator", "techstars"], note: "Techstars" },
  { slug: "foundersfund", trust: "auto", tags: ["vc", "foundersfund"], note: "Founders Fund" },
  { slug: "sequoia", trust: "auto", tags: ["vc", "sequoia"], note: "Sequoia" },
  { slug: "firstround", trust: "auto", tags: ["vc", "firstround"], note: "First Round" },
  { slug: "lightspeed", trust: "auto", tags: ["vc", "lightspeed"], note: "Lightspeed" },

  // ── City discover pages disabled by default ──────────────────────────
  // First dry-run showed these are firehose noise (cake decorating, pickleball
  // singles, pigeon powerpoint parties). Even with founder-pattern promotion
  // the queue-quality ratio is terrible. Revisit when we have either (a) a
  // stronger semantic filter or (b) dedicated city editors. To re-enable for
  // a one-off harvest, pass them in via runLumaHarvest({ calendars: [...] }).
  // { slug: "sf", trust: "moderate", tags: ["sf"], note: "San Francisco discover" },
  // { slug: "nyc", trust: "moderate", tags: ["nyc"], note: "New York discover" },
  // { slug: "singapore", trust: "moderate", tags: ["singapore"], note: "Singapore discover" },
  // { slug: "london", trust: "moderate", tags: ["london"], note: "London discover" },
];

// ───────────────────────────────────────────────────────────────────────
// Scoring rules
// ───────────────────────────────────────────────────────────────────────

// Tourist / low-signal patterns. Hard reject — never insert, even from
// auto-trust calendars (curators occasionally post intro-level fluff and
// recurring filler like "coworking day" or "watch party").
const TITLE_REJECT_RE =
  /\b(intro to|introduction to|101\b|crash course|for beginners?|beginner'?s?\b|happy hour|networking night|crypto mixer|web3 mixer|industry mixer|networking event|coworking day|co[- ]?working day|office hours|watch party|launch party|play date|social club|powerpoint party|trivia night|game night|nft mint|token launch|presale|airdrop farming|how to (?:start|begin|invest)|book club|reading series|film screening|art opening|community day)\b/i;

const DESCRIPTION_REJECT_RE =
  /\b(token launch|presale\b|airdrop farming|free nft|whitelist spots|guaranteed allocation)\b/i;

// Founder-grade patterns. From a `moderate` calendar these promote to
// auto-publish. From an `auto` calendar they're just a confidence boost
// (logged but doesn't change decision).
const TITLE_FOUNDER_RE =
  /\b(founder|operator|builder|demo day|fellowship|cohort|investor|portfolio|researcher|alumni|lp(?:s)? (?:dinner|meet)|gp\b|partner (?:dinner|breakfast))\b/i;

export type ScoreDecision = "auto-publish" | "moderate" | "reject";

export type ScoreResult = {
  decision: ScoreDecision;
  reasons: string[];
};

export function scoreLumaEvent(
  event: { name: string; description?: string },
  cal: CuratorCalendar,
): ScoreResult {
  const reasons: string[] = [];
  const title = event.name ?? "";
  const desc = event.description ?? "";

  if (TITLE_REJECT_RE.test(title)) {
    return { decision: "reject", reasons: [`title-pattern: ${title.match(TITLE_REJECT_RE)?.[0]}`] };
  }
  if (DESCRIPTION_REJECT_RE.test(desc)) {
    return { decision: "reject", reasons: [`desc-pattern: ${desc.match(DESCRIPTION_REJECT_RE)?.[0]}`] };
  }

  if (cal.trust === "auto") {
    reasons.push(`calendar:${cal.slug} (auto-trust)`);
    if (TITLE_FOUNDER_RE.test(title)) reasons.push("founder-pattern");
    return { decision: "auto-publish", reasons };
  }

  // moderate calendar: founder pattern in title promotes to auto-publish
  if (TITLE_FOUNDER_RE.test(title)) {
    reasons.push(`calendar:${cal.slug} (moderate) + founder-pattern → promote`);
    return { decision: "auto-publish", reasons };
  }

  reasons.push(`calendar:${cal.slug} (moderate) — queue for review`);
  return { decision: "moderate", reasons };
}

// ───────────────────────────────────────────────────────────────────────
// Calendar fetch + JSON-LD extraction
// ───────────────────────────────────────────────────────────────────────

export type HarvestedEvent = {
  url: string;
  name: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  imageUrl?: string;
  city?: string;
  country?: string;
  venue?: string;
  organizer?: string;
  hosts: string[];
};

export async function fetchLumaCalendar(
  slug: string,
): Promise<{ ok: true; events: HarvestedEvent[] } | { ok: false; error: string }> {
  const url = `https://lu.ma/${slug}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    // Size cap to avoid OOM on a hostile response.
    const reader = res.body?.getReader();
    if (!reader) return { ok: false, error: "empty body" };
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      merged.set(c, off);
      off += c.byteLength;
    }
    html = new TextDecoder("utf-8").decode(merged);
  } catch (e) {
    const msg =
      e instanceof Error && e.name === "AbortError"
        ? "timeout"
        : e instanceof Error
          ? e.message
          : "fetch error";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }

  const events = extractCalendarEvents(html);
  return { ok: true, events };
}

function extractCalendarEvents(html: string): HarvestedEvent[] {
  const out: HarvestedEvent[] = [];
  const scriptRe =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRe.exec(html)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    walkForEvents(parsed, out);
  }

  // Dedupe by URL — lu.ma sometimes lists an event in both upcoming and
  // featured sections of the same calendar.
  const seen = new Set<string>();
  return out.filter((e) => {
    const key = e.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function walkForEvents(node: unknown, out: HarvestedEvent[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) walkForEvents(item, out);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t) => typeof t === "string" && /Event$/i.test(t))) {
    const ev = normalizeEvent(obj);
    if (ev) out.push(ev);
    // Don't return — an Event may not nest further, but be defensive.
  }
  // Recurse into common container keys.
  if (Array.isArray(obj.itemListElement)) walkForEvents(obj.itemListElement, out);
  if ("item" in obj) walkForEvents(obj.item, out);
  if (Array.isArray(obj["@graph"])) walkForEvents(obj["@graph"], out);
}

function normalizeEvent(raw: Record<string, unknown>): HarvestedEvent | null {
  const url = typeof raw.url === "string" ? canonicalizeUrl(raw.url) : null;
  const name = typeof raw.name === "string" ? raw.name.trim() : null;
  if (!url || !name) return null;
  if (!/^https?:\/\/(?:[a-z0-9-]+\.)*lu(?:ma)?\.(?:ma|com)\//i.test(url)) return null;

  const ev: HarvestedEvent = { url, name, hosts: [] };
  if (typeof raw.startDate === "string") ev.startDate = raw.startDate;
  if (typeof raw.endDate === "string") ev.endDate = raw.endDate;
  if (typeof raw.description === "string") ev.description = raw.description.trim().slice(0, 1500);

  const img = raw.image;
  if (typeof img === "string") ev.imageUrl = img;
  else if (Array.isArray(img) && img.length && typeof img[0] === "string") ev.imageUrl = img[0];

  const loc = raw.location;
  if (loc && typeof loc === "object") {
    const l = loc as Record<string, unknown>;
    if (typeof l.name === "string") ev.venue = l.name;
    const addr = l.address;
    if (addr && typeof addr === "object") {
      const a = addr as Record<string, unknown>;
      if (typeof a.addressLocality === "string") ev.city = a.addressLocality;
      if (typeof a.addressCountry === "string") ev.country = a.addressCountry;
    } else if (typeof addr === "string" && !ev.venue) {
      ev.venue = addr;
    }
    if (typeof (l["@type"]) === "string" && /virtual/i.test(l["@type"] as string)) {
      ev.city = ev.city ?? "Online";
    }
  }

  const org = raw.organizer;
  if (org && typeof org === "object" && typeof (org as Record<string, unknown>).name === "string") {
    ev.organizer = (org as Record<string, unknown>).name as string;
  } else if (typeof org === "string") {
    ev.organizer = org;
  }

  const performer = raw.performer;
  if (Array.isArray(performer)) {
    for (const p of performer) {
      if (p && typeof p === "object" && typeof (p as Record<string, unknown>).name === "string") {
        ev.hosts.push((p as Record<string, unknown>).name as string);
      }
    }
  }

  return ev;
}

function canonicalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    // Normalize luma.com ↔ lu.ma to a single canonical (lu.ma).
    if (/^(?:www\.)?luma\.com$/i.test(u.hostname)) u.hostname = "lu.ma";
    if (u.hostname.toLowerCase() === "www.lu.ma") u.hostname = "lu.ma";
    u.hash = "";
    u.search = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return raw;
  }
}

// ───────────────────────────────────────────────────────────────────────
// Event → submission payload mapping
// ───────────────────────────────────────────────────────────────────────

export function harvestedEventToPayload(
  ev: HarvestedEvent,
  cal: CuratorCalendar,
): EventPayload {
  const payload: EventPayload = {
    name: ev.name,
    startsAt: normalizeIsoDate(ev.startDate ?? new Date().toISOString()),
    url: ev.url,
  };
  if (ev.endDate) payload.endsAt = normalizeIsoDate(ev.endDate);
  if (ev.description) payload.description = ev.description;
  if (ev.imageUrl) payload.imageUrl = ev.imageUrl;
  if (ev.venue) payload.venue = ev.venue;
  if (ev.city) payload.city = ev.city;
  if (ev.country) payload.country = expandCountry(ev.country);

  payload.eventType = inferEventType(ev);
  payload.tags = inferTags(ev, cal);

  return payload;
}

function normalizeIsoDate(raw: string): string {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t}T12:00:00Z`;
  const d = new Date(t);
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function inferEventType(ev: HarvestedEvent): EventPayload["eventType"] {
  const src = `${ev.name} ${ev.description ?? ""}`.toLowerCase();
  if (/hackathon|hack\b/.test(src)) return "hackathon";
  if (/workshop|class|tutorial/.test(src)) return "workshop";
  if (/conference|summit|conf\b|forum/.test(src)) return "conference";
  if (/meetup|happy hour|mixer|dinner|breakfast|brunch|party|drinks/.test(src)) return "meetup";
  return "other";
}

function inferTags(ev: HarvestedEvent, cal: CuratorCalendar): string[] {
  const tags = new Set<string>(cal.tags ?? []);
  const src = `${ev.name} ${ev.description ?? ""}`.toLowerCase();
  const TAG_RULES: Array<[RegExp, string]> = [
    [/\bai\b|artificial intelligence|llm|gpt|agent/i, "ai"],
    [/robotics|robot\b|autonomous/i, "robotics"],
    [/defi|liquidity|amm|swap\b/i, "defi"],
    [/zk\b|zero[- ]knowledge|snark/i, "zk"],
    [/mev\b|flashbot/i, "mev"],
    [/restaking|eigenlayer/i, "restaking"],
    [/founder|operator/i, "founders"],
    [/demo day|pitch/i, "demo-day"],
    [/hackathon/i, "hackathon"],
  ];
  for (const [re, tag] of TAG_RULES) if (re.test(src)) tags.add(tag);
  return Array.from(tags).slice(0, 8);
}

const COUNTRY_MAP: Record<string, string> = {
  US: "United States",
  USA: "United States",
  GB: "United Kingdom",
  UK: "United Kingdom",
  CA: "Canada",
  DE: "Germany",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  PT: "Portugal",
  NL: "Netherlands",
  JP: "Japan",
  KR: "South Korea",
  SG: "Singapore",
  HK: "Hong Kong",
  AE: "United Arab Emirates",
  IN: "India",
  AU: "Australia",
  BR: "Brazil",
  MX: "Mexico",
  AR: "Argentina",
  CH: "Switzerland",
  IL: "Israel",
  TH: "Thailand",
};

function expandCountry(code: string): string {
  const c = code.trim();
  return COUNTRY_MAP[c.toUpperCase()] ?? c;
}

// ───────────────────────────────────────────────────────────────────────
// Orchestrator — pulls all calendars, scores, dedupes, inserts
// ───────────────────────────────────────────────────────────────────────

export type HarvestSummary = {
  calendarsProcessed: number;
  calendarsFailed: number;
  totalCandidates: number;
  alreadyKnown: number;
  rejected: number;
  inserted: { approved: number; pending: number };
  errors: Array<{ slug: string; error: string }>;
  rejections: Array<{ url: string; name: string; reason: string }>;
  inserts: Array<{
    publicId: string;
    name: string;
    status: "approved" | "pending";
    calendar: string;
  }>;
};

export type RunOptions = {
  /** Defaults to LUMA_CURATOR_CALENDARS. */
  calendars?: CuratorCalendar[];
  /** When true, skips DB writes. Returns the summary as if it had run. */
  dryRun?: boolean;
  /** Milliseconds between calendar fetches (jitter added). Default 1500. */
  interCalendarDelayMs?: number;
  /** Skip events whose startDate is already this many hours in the past. Default 12. */
  skipPastHours?: number;
  /** Optional logger; defaults to console.log. */
  log?: (line: string) => void;
};

export async function runLumaHarvest(opts: RunOptions = {}): Promise<HarvestSummary> {
  // Lazy-import db so this module can be imported in client-safe contexts.
  // The CLI and the cron route are the only callers that need DB access.
  const { db, submissions } = await import("@/lib/db");
  const { and, eq, sql, inArray } = await import("drizzle-orm");

  const calendars = opts.calendars ?? LUMA_CURATOR_CALENDARS;
  const dryRun = opts.dryRun ?? false;
  const delay = opts.interCalendarDelayMs ?? 1500;
  const skipPastMs = (opts.skipPastHours ?? 12) * 60 * 60 * 1000;
  const log = opts.log ?? ((s: string) => console.log(s));
  const cutoff = Date.now() - skipPastMs;

  const summary: HarvestSummary = {
    calendarsProcessed: 0,
    calendarsFailed: 0,
    totalCandidates: 0,
    alreadyKnown: 0,
    rejected: 0,
    inserted: { approved: 0, pending: 0 },
    errors: [],
    rejections: [],
    inserts: [],
  };

  // Pass 1: fetch every calendar, build candidate list.
  type Candidate = { ev: HarvestedEvent; cal: CuratorCalendar };
  const candidates: Candidate[] = [];
  for (let i = 0; i < calendars.length; i++) {
    const cal = calendars[i];
    if (i > 0) {
      // Jitter ±30% to avoid looking like a fixed bot.
      const jitter = delay * (0.7 + Math.random() * 0.6);
      await sleep(jitter);
    }
    const res = await fetchLumaCalendar(cal.slug);
    if (!res.ok) {
      summary.calendarsFailed++;
      summary.errors.push({ slug: cal.slug, error: res.error });
      log(`  ✗ ${cal.slug.padEnd(20)} — ${res.error}`);
      continue;
    }
    summary.calendarsProcessed++;
    log(`  ✓ ${cal.slug.padEnd(20)} — ${res.events.length} events`);
    for (const ev of res.events) {
      // Skip events that already started > skipPastHours ago.
      if (ev.startDate) {
        const start = Date.parse(ev.startDate);
        if (!isNaN(start) && start < cutoff) continue;
      }
      candidates.push({ ev, cal });
    }
  }
  summary.totalCandidates = candidates.length;

  if (candidates.length === 0) return summary;

  // Pass 2: dedupe against existing submissions.
  // Build the set of URLs we'd insert, plus their luma.com mirror form, and
  // query in one go. Match against payload->>'url' since that's where event
  // URLs live in the JSONB blob.
  const urlSet = new Set<string>();
  for (const c of candidates) {
    urlSet.add(c.ev.url);
    urlSet.add(c.ev.url.replace(/^https:\/\/lu\.ma\//, "https://luma.com/"));
    urlSet.add(c.ev.url.replace(/^https:\/\/luma\.com\//, "https://lu.ma/"));
  }
  const known = new Set<string>();
  if (urlSet.size) {
    const rows = await db
      .select({ url: sql<string>`${submissions.payload}->>'url'` })
      .from(submissions)
      .where(
        and(
          eq(submissions.type, "event"),
          inArray(sql`${submissions.payload}->>'url'`, Array.from(urlSet)),
        ),
      );
    for (const r of rows) {
      if (r.url) {
        known.add(r.url);
        known.add(r.url.replace(/^https:\/\/lu\.ma\//, "https://luma.com/"));
        known.add(r.url.replace(/^https:\/\/luma\.com\//, "https://lu.ma/"));
      }
    }
  }

  // Pass 3: score + insert.
  for (const { ev, cal } of candidates) {
    if (known.has(ev.url)) {
      summary.alreadyKnown++;
      continue;
    }
    const decision = scoreLumaEvent(ev, cal);
    if (decision.decision === "reject") {
      summary.rejected++;
      summary.rejections.push({
        url: ev.url,
        name: ev.name,
        reason: decision.reasons.join("; "),
      });
      continue;
    }

    const payload = harvestedEventToPayload(ev, cal);
    const eventStartsAt = new Date(payload.startsAt);
    const eventEndsAt = payload.endsAt ? new Date(payload.endsAt) : null;
    const status = decision.decision === "auto-publish" ? "approved" : "pending";

    if (dryRun) {
      summary.inserted[status === "approved" ? "approved" : "pending"]++;
      summary.inserts.push({
        publicId: "(dry-run)",
        name: ev.name,
        status: status as "approved" | "pending",
        calendar: cal.slug,
      });
      // Mark known so a later duplicate within the same run doesn't double-count.
      known.add(ev.url);
      continue;
    }

    const [row] = await db
      .insert(submissions)
      .values({
        type: "event",
        status,
        payload,
        eventStartsAt,
        eventEndsAt,
        publishedAt: status === "approved" ? new Date() : null,
        reviewNotes: `harvested from lu.ma/${cal.slug}: ${decision.reasons.join("; ")}`,
      })
      .returning({ publicId: submissions.publicId });

    summary.inserted[status === "approved" ? "approved" : "pending"]++;
    summary.inserts.push({
      publicId: row.publicId,
      name: ev.name,
      status,
      calendar: cal.slug,
    });
    known.add(ev.url);
  }

  return summary;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
