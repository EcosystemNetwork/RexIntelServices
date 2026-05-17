/**
 * Derive a logo URL for an organization from any link we have on file.
 * Prefers a hand-drawn local SVG (LOCAL_LOGOS) when we have one, then
 * falls back to Google's favicon service. Google returns a generic globe
 * for unknown domains so the card never renders a broken image.
 *
 * Pass the strongest signal first (organizationUrl > applyUrl > url) so
 * we don't end up showing Greenhouse's logo for every job that links to
 * a Greenhouse ATS instead of the company's own domain.
 */
const LOCAL_LOGOS: Record<string, string> = {
  "edgecity.live": "/logos/edge-city.svg",
  "crecimiento.build": "/logos/crecimiento.svg",
  "vitalia.city": "/logos/vitalia.svg",
  "hf0.com": "/logos/hf0.svg",
  "network.school": "/logos/network-school.svg",
  "zfellows.com": "/logos/z-fellows.svg",
  "bbq.capital": "/logos/bbq-capital.svg",
  "devlabs.club": "/logos/devlabs.svg",
  "1517fund.com": "/logos/1517-fund.svg",
  "rightsidecapital.com": "/logos/right-side-capital.svg",
  "redbud.vc": "/logos/redbud.svg",
  "pioneer.app": "/logos/pioneer.svg",
  "octant.app": "/logos/octant.svg",
  "orangedao.xyz": "/logos/orange-dao.svg",
  "southparkcommons.com": "/logos/spc.svg",
  "boost.vc": "/logos/boost-vc.svg",
  "encodeclub.com": "/logos/encode-club.svg",
  "helius.dev": "/logos/helius.svg",
  "conviction.com": "/logos/conviction.svg",
  "1kx.network": "/logos/1kx.svg",
  "alliance.xyz": "/logos/alliance.svg",
  "variant.fund": "/logos/variant.svg",
  "bags.fm": "/logos/bags.svg",
  "artizen.fund": "/logos/artizen.svg",
};

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
    const local = LOCAL_LOGOS[host] ?? LOCAL_LOGOS[rootHost];
    if (local) return local;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  }
  return null;
}
