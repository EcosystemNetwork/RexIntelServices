import type { EventPayload } from "@/lib/db/schema";

/**
 * Server-side URL → EventPayload parser. Targets lu.ma / luma.com first
 * (they ship a complete Event JSON-LD object on every event page), with
 * a generic JSON-LD path + OpenGraph fallback so eventbrite.com,
 * ethglobal.com, and any other schema.org-compliant host also work.
 *
 * Intentionally permissive: we'd rather prefill 3 out of 8 fields than
 * fail closed. The submission form lets the user edit anything before
 * sending.
 */

const FETCH_TIMEOUT_MS = 6000;
const MAX_BYTES = 1_500_000; // 1.5MB — lu.ma pages are ~300KB, leave headroom
const USER_AGENT = "Mozilla/5.0 (compatible; RexIntelBot/1.0; +https://rexintelservices.com)";

export type ParsedEvent = {
  /** Fields we managed to extract. All optional — caller decides what to use. */
  payload: Partial<EventPayload>;
  /** Where the data came from, for the UI confirmation hint. */
  source: "json-ld" | "opengraph" | "mixed";
  /** Canonical URL after redirects — what we'd actually store. */
  canonicalUrl: string;
};

export type ParseError =
  | { code: "invalid_url"; message: string }
  | { code: "blocked_host"; message: string }
  | { code: "fetch_failed"; message: string }
  | { code: "no_event_data"; message: string };

export async function parseEventUrl(
  raw: string,
): Promise<{ ok: true; data: ParsedEvent } | { ok: false; error: ParseError }> {
  const urlCheck = validateUrl(raw);
  if (!urlCheck.ok) return { ok: false, error: urlCheck.error };

  const fetchRes = await fetchHtml(urlCheck.url);
  if (!fetchRes.ok) return { ok: false, error: fetchRes.error };

  const { html, finalUrl } = fetchRes;
  const jsonLd = extractEventJsonLd(html);
  const og = extractOpenGraph(html);

  const payload: Partial<EventPayload> = {};

  // JSON-LD wins on every field it provides; OG fills the gaps.
  if (jsonLd) {
    if (jsonLd.name) payload.name = jsonLd.name;
    if (jsonLd.startDate) payload.startsAt = normalizeIsoDate(jsonLd.startDate);
    if (jsonLd.endDate) payload.endsAt = normalizeIsoDate(jsonLd.endDate);
    if (jsonLd.description) payload.description = trimDescription(jsonLd.description);
    if (jsonLd.location) {
      payload.venue = jsonLd.location.venue;
      payload.city = jsonLd.location.city;
      payload.country = jsonLd.location.country;
    }
    if (jsonLd.image) payload.imageUrl = jsonLd.image;
  }

  if (!payload.name && og.title) payload.name = og.title;
  if (!payload.description && og.description) {
    payload.description = trimDescription(og.description);
  }
  if (!payload.imageUrl && og.image) payload.imageUrl = og.image;

  payload.url = finalUrl;

  // Heuristic event type from URL/title — improves UX, user can override.
  if (!payload.eventType) {
    const guessSrc = `${finalUrl} ${payload.name ?? ""}`.toLowerCase();
    if (/hackathon|hack\b/.test(guessSrc)) payload.eventType = "hackathon";
    else if (/workshop|class/.test(guessSrc)) payload.eventType = "workshop";
    else if (/conference|summit|conf\b/.test(guessSrc)) payload.eventType = "conference";
    else if (/meetup|happy hour|mixer|breakfast|dinner|party/.test(guessSrc))
      payload.eventType = "meetup";
  }

  // Need at minimum a name or start date for the prefill to be useful.
  if (!payload.name && !payload.startsAt) {
    return {
      ok: false,
      error: {
        code: "no_event_data",
        message:
          "Couldn't find event metadata at that URL. You can still fill the form manually.",
      },
    };
  }

  return {
    ok: true,
    data: {
      payload,
      source: jsonLd ? (og.title ? "mixed" : "json-ld") : "opengraph",
      canonicalUrl: finalUrl,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────
// URL validation — basic SSRF guard. We only fetch public http(s) URLs
// and refuse anything that resolves to localhost / private space by
// hostname pattern. Full DNS-level rebinding protection would require
// resolving + checking the IP at fetch time; for an MVP the hostname
// pattern catches everything an automated submission would try.
// ───────────────────────────────────────────────────────────────────────

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

function validateUrl(
  raw: string,
): { ok: true; url: URL } | { ok: false; error: ParseError } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return {
      ok: false,
      error: { code: "invalid_url", message: "That doesn't look like a valid URL." },
    };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return {
      ok: false,
      error: { code: "invalid_url", message: "URL must use http or https." },
    };
  }
  if (BLOCKED_HOST_PATTERNS.some((re) => re.test(url.hostname))) {
    return {
      ok: false,
      error: { code: "blocked_host", message: "That host isn't reachable." },
    };
  }
  return { ok: true, url };
}

// ───────────────────────────────────────────────────────────────────────
// Fetch with timeout + size cap
// ───────────────────────────────────────────────────────────────────────

async function fetchHtml(
  url: URL,
): Promise<
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; error: ParseError }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        ok: false,
        error: {
          code: "fetch_failed",
          message: `Source returned ${res.status}.`,
        },
      };
    }

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html") && !ct.includes("xml")) {
      return {
        ok: false,
        error: { code: "fetch_failed", message: "URL did not return HTML." },
      };
    }

    // Read with a size cap so a malicious URL can't OOM us.
    const reader = res.body?.getReader();
    if (!reader) {
      return {
        ok: false,
        error: { code: "fetch_failed", message: "Empty response from URL." },
      };
    }

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

    // Concatenate Uint8Arrays into a single Buffer-like view for TextDecoder.
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    const html = new TextDecoder("utf-8").decode(merged);

    return { ok: true, html, finalUrl: res.url || url.toString() };
  } catch (e) {
    const msg =
      e instanceof Error && e.name === "AbortError"
        ? "Source took too long to respond."
        : "Couldn't reach that URL.";
    return { ok: false, error: { code: "fetch_failed", message: msg } };
  } finally {
    clearTimeout(timer);
  }
}

// ───────────────────────────────────────────────────────────────────────
// JSON-LD extraction
// ───────────────────────────────────────────────────────────────────────

type JsonLdEvent = {
  name?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  image?: string;
  location?: {
    venue?: string;
    city?: string;
    country?: string;
  };
};

function extractEventJsonLd(html: string): JsonLdEvent | null {
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
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
    const event = findEventNode(parsed);
    if (event) return normalizeJsonLdEvent(event);
  }
  return null;
}

function findEventNode(node: unknown): Record<string, unknown> | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findEventNode(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t) => typeof t === "string" && /Event$/i.test(t))) {
    return obj;
  }
  // schema.org often wraps in @graph
  if (Array.isArray(obj["@graph"])) {
    return findEventNode(obj["@graph"]);
  }
  return null;
}

function normalizeJsonLdEvent(
  raw: Record<string, unknown>,
): JsonLdEvent {
  const out: JsonLdEvent = {};

  if (typeof raw.name === "string") out.name = raw.name.trim();
  if (typeof raw.startDate === "string") out.startDate = raw.startDate;
  if (typeof raw.endDate === "string") out.endDate = raw.endDate;
  if (typeof raw.description === "string") {
    out.description = raw.description.trim();
  }

  // image can be a string, array of strings, or an ImageObject
  const img = raw.image;
  if (typeof img === "string") {
    out.image = img;
  } else if (Array.isArray(img) && img.length) {
    const first = img[0];
    if (typeof first === "string") out.image = first;
    else if (first && typeof first === "object" && typeof (first as Record<string, unknown>).url === "string") {
      out.image = (first as Record<string, unknown>).url as string;
    }
  } else if (img && typeof img === "object" && typeof (img as Record<string, unknown>).url === "string") {
    out.image = (img as Record<string, unknown>).url as string;
  }

  // location can be a Place (with .address PostalAddress), a string, or an
  // array. Online events use VirtualLocation.
  const loc = raw.location;
  if (Array.isArray(loc)) {
    for (const item of loc) {
      const parsed = parseLocation(item);
      if (parsed) {
        out.location = parsed;
        break;
      }
    }
  } else if (loc) {
    const parsed = parseLocation(loc);
    if (parsed) out.location = parsed;
  }

  return out;
}

function parseLocation(loc: unknown): JsonLdEvent["location"] | null {
  if (!loc) return null;
  if (typeof loc === "string") {
    return { venue: loc };
  }
  if (typeof loc !== "object") return null;
  const obj = loc as Record<string, unknown>;
  const type = obj["@type"];

  // Virtual events — surface "Online" so the form fills the city sensibly
  if (typeof type === "string" && /virtual/i.test(type)) {
    return { city: "Online" };
  }

  const out: NonNullable<JsonLdEvent["location"]> = {};
  if (typeof obj.name === "string") out.venue = obj.name;

  const addr = obj.address;
  if (addr && typeof addr === "object") {
    const a = addr as Record<string, unknown>;
    if (typeof a.addressLocality === "string") out.city = a.addressLocality;
    if (typeof a.addressCountry === "string") out.country = expandCountry(a.addressCountry);
    if (!out.venue && typeof a.streetAddress === "string") {
      out.venue = a.streetAddress;
    }
  } else if (typeof addr === "string") {
    if (!out.venue) out.venue = addr;
  }

  return Object.keys(out).length ? out : null;
}

// schema.org uses 2-letter ISO codes ("US", "GB") but our UI shows the full
// name everywhere else, so expand the handful that actually show up.
function expandCountry(code: string): string {
  const c = code.trim();
  const MAP: Record<string, string> = {
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
    CN: "China",
    SG: "Singapore",
    HK: "Hong Kong",
    AE: "United Arab Emirates",
    IN: "India",
    AU: "Australia",
    BR: "Brazil",
    MX: "Mexico",
    AR: "Argentina",
    CL: "Chile",
    CZ: "Czech Republic",
    RO: "Romania",
    SK: "Slovakia",
    PL: "Poland",
    CH: "Switzerland",
    SE: "Sweden",
    NO: "Norway",
    DK: "Denmark",
    FI: "Finland",
    IE: "Ireland",
    AT: "Austria",
    BE: "Belgium",
    GR: "Greece",
    TR: "Turkey",
    IL: "Israel",
    TH: "Thailand",
    VN: "Vietnam",
    MY: "Malaysia",
    ID: "Indonesia",
    PH: "Philippines",
    ZA: "South Africa",
    NG: "Nigeria",
    KE: "Kenya",
    NZ: "New Zealand",
  };
  return MAP[c.toUpperCase()] ?? c;
}

// ───────────────────────────────────────────────────────────────────────
// OpenGraph fallback — minimal, just grabs the meta tags
// ───────────────────────────────────────────────────────────────────────

function extractOpenGraph(html: string): {
  title?: string;
  description?: string;
  image?: string;
} {
  return {
    title: ogContent(html, "og:title") || metaContent(html, "twitter:title"),
    description:
      ogContent(html, "og:description") ||
      metaContent(html, "twitter:description") ||
      metaContent(html, "description"),
    image: ogContent(html, "og:image") || metaContent(html, "twitter:image"),
  };
}

function ogContent(html: string, prop: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+property=["']${escapeRe(prop)}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const m = html.match(re);
  if (m) return decodeHtmlEntities(m[1]);
  // Some sites put content= before property=
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escapeRe(prop)}["']`,
    "i",
  );
  const m2 = html.match(re2);
  return m2 ? decodeHtmlEntities(m2[1]) : undefined;
}

function metaContent(html: string, name: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+name=["']${escapeRe(name)}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const m = html.match(re);
  return m ? decodeHtmlEntities(m[1]) : undefined;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ");
}

// ───────────────────────────────────────────────────────────────────────
// Normalization helpers
// ───────────────────────────────────────────────────────────────────────

function normalizeIsoDate(raw: string): string {
  // schema.org allows pure date ("2026-05-11") or full datetime with TZ.
  // Pure dates are anchored to 12:00 UTC for the same reason as the
  // ETHGlobal seed: keeps display-day stable across timezones.
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T12:00:00Z`;
  }
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return trimmed;
  return d.toISOString();
}

function trimDescription(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 1000);
}

/**
 * Trust allowlists per submission surface. Conservative by design —
 * auto-publishing without review bypasses the only spam filter we have
 * for content quality, so anything that lands here needs to be a host we
 * believe vets its own content.
 */

export const TRUSTED_EVENT_HOSTS = new Set([
  "lu.ma",
  "luma.com",
  "eventbrite.com",
  "eventbrite.co.uk",
  "eventbrite.ca",
  "ethglobal.com",
  "devcon.org",
  "ethdenver.com",
  "ethcc.io",
  "consensus.coindesk.com",
  "token2049.com",
  "meetup.com",
]);

// Same hosts as events — pop-up cities almost always use lu.ma for intake.
export const TRUSTED_POPUP_CITY_HOSTS = new Set([
  "lu.ma",
  "luma.com",
  "edgecity.live",
  "zuzalu.city",
  "crecimiento.build",
]);

// Hackathons: ETHGlobal + Devpost + MLH dominate; lu.ma covers the long tail
// of community hackathons.
export const TRUSTED_HACKATHON_HOSTS = new Set([
  "ethglobal.com",
  "devpost.com",
  "mlh.io",
  "hackerearth.com",
  "lu.ma",
  "luma.com",
  "dorahacks.io",
  "encode.club",
]);

// Established crypto grant programs — restrictive. Random Twitter "grant"
// pages should hit moderation.
export const TRUSTED_GRANT_HOSTS = new Set([
  "ethereum.org",
  "ethereum.foundation",
  "esp.ethereum.foundation",
  "optimism.io",
  "gov.optimism.io",
  "gitcoin.co",
  "arbitrumfoundation.org",
  "uniswap.org",
  "uniswapfoundation.org",
  "polygon.technology",
  "near.foundation",
  "solana.org",
]);

// Known accelerator/incubator brands. Keep tight — auto-publishing a
// program implies endorsement.
export const TRUSTED_ACCELERATOR_HOSTS = new Set([
  "ycombinator.com",
  "a16zcrypto.com",
  "alliance.xyz",
  "orangedao.xyz",
  "outlier.vc",
  "techstars.com",
  "consensys.io",
  "expert-dojo.com",
]);

// Mainstream ATS providers — Greenhouse / Lever / Ashby etc. don't vet
// content per se, but the friction of setting up an ATS tenant filters
// out the worst spam.
export const TRUSTED_JOB_HOSTS = new Set([
  "greenhouse.io",
  "boards.greenhouse.io",
  "lever.co",
  "jobs.lever.co",
  "ashbyhq.com",
  "jobs.ashbyhq.com",
  "workable.com",
  "apply.workable.com",
  "workatastartup.com",
  "wellfound.com",
  "angel.co",
]);

function hostOf(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isTrustedEventUrl(rawUrl: string | undefined): boolean {
  const host = hostOf(rawUrl);
  return host ? TRUSTED_EVENT_HOSTS.has(host) : false;
}
export function isTrustedPopupCityUrl(rawUrl: string | undefined): boolean {
  const host = hostOf(rawUrl);
  return host ? TRUSTED_POPUP_CITY_HOSTS.has(host) : false;
}
export function isTrustedHackathonUrl(rawUrl: string | undefined): boolean {
  const host = hostOf(rawUrl);
  return host ? TRUSTED_HACKATHON_HOSTS.has(host) : false;
}
export function isTrustedGrantUrl(rawUrl: string | undefined): boolean {
  const host = hostOf(rawUrl);
  return host ? TRUSTED_GRANT_HOSTS.has(host) : false;
}
export function isTrustedAcceleratorUrl(rawUrl: string | undefined): boolean {
  const host = hostOf(rawUrl);
  return host ? TRUSTED_ACCELERATOR_HOSTS.has(host) : false;
}
export function isTrustedJobUrl(rawUrl: string | undefined): boolean {
  const host = hostOf(rawUrl);
  if (!host) return false;
  if (TRUSTED_JOB_HOSTS.has(host)) return true;
  // greenhouse.io and lever.co serve per-tenant subdomains. Also trust
  // anything ending in those parent hosts.
  return (
    host.endsWith(".greenhouse.io") ||
    host.endsWith(".lever.co") ||
    host.endsWith(".ashbyhq.com") ||
    host.endsWith(".workable.com")
  );
}
