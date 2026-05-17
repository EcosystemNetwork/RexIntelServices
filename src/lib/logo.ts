/**
 * Derive a logo URL for an organization from any link we have on file.
 * Uses Google's favicon service — free, no auth, returns a generic globe
 * for unknown domains so the card never renders a broken image.
 *
 * Pass the strongest signal first (organizationUrl > applyUrl > url) so
 * we don't end up showing Greenhouse's logo for every job that links to
 * a Greenhouse ATS instead of the company's own domain.
 */
const ATS_HOSTS = new Set([
  "greenhouse.io",
  "boards.greenhouse.io",
  "lever.co",
  "jobs.lever.co",
  "ashbyhq.com",
  "jobs.ashbyhq.com",
  "workable.com",
  "apply.workable.com",
  "wellfound.com",
  "angel.co",
  "linkedin.com",
  "indeed.com",
  "notion.so",
  "notion.site",
  "lu.ma",
  "luma.com",
  "eventbrite.com",
  "typeform.com",
  "airtable.com",
  "tally.so",
  "google.com",
  "docs.google.com",
  "forms.gle",
]);

function extractHost(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function logoUrlFor(...candidates: (string | null | undefined)[]): string | null {
  for (const raw of candidates) {
    if (!raw) continue;
    const host = extractHost(raw);
    if (!host) continue;
    // Skip generic ATS / link-aggregator hosts — they'd display the wrong brand.
    const rootHost = host.split(".").slice(-2).join(".");
    if (ATS_HOSTS.has(host) || ATS_HOSTS.has(rootHost)) continue;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  }
  return null;
}
