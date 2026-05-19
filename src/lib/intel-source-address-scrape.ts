import type { IntelPayload } from "@/lib/db/schema";
import { CHAIN_SLUG_SET } from "@/lib/chains";
import {
  extractAddressesFromIntel,
  type AddressInput,
} from "@/lib/intel-address-extraction";

/**
 * Fetch the `sources` URLs on an intel payload, scrape on-chain addresses
 * out of the HTML/JSON, and return AddressInput rows ready for
 * linkAddressesToSubmission. Built so the DefiLlama / REKT importers can
 * pull attacker wallets out of the underlying writeups — the upstream
 * feeds give us a name + dollar amount but no addresses, so the rows
 * never connect into /graph unless we follow the source link.
 *
 * Strategy:
 *   1. Iterate payload.sources, dropping anything not on the trusted-
 *      domain allowlist (defense-in-depth against curator-pasted junk).
 *   2. Fetch with a polite UA + 10s timeout. Skip 4xx/5xx.
 *   3. Pull every <a href="..."> URL out of the body (so embedded
 *      explorer links type bare 0x addresses to specific chains).
 *   4. Build a synthetic IntelPayload from the fetched text + extracted
 *      hrefs and run the existing extractAddressesFromIntel on it. Zero
 *      duplicate regex work, automatic chain-typing for free.
 *   5. Filter out known-noise addresses (zero, burn, common stablecoins).
 *   6. Cap per-source to MAX_PER_SOURCE so a doc that incidentally
 *      mentions 50 addresses doesn't drown the row's true operator.
 */

const FETCH_TIMEOUT_MS = 10_000;
const MAX_PER_SOURCE = 20;
const USER_AGENT =
  "Mozilla/5.0 (compatible; RexIntel-source-scraper/1.0; +https://rexintelservices.com)";

// Allowlist of source hosts we'll fetch HTML from. Anything else is
// skipped — we don't want curator-pasted URLs to redirect us at random
// servers. Add new hosts here as they show up in production data.
const TRUSTED_HOSTS = new Set<string>([
  "rekt.news",
  "defillama.com",
  "www.defillama.com",
  "chainalysis.com",
  "www.chainalysis.com",
  "blog.chainalysis.com",
  "elliptic.co",
  "www.elliptic.co",
  "hub.elliptic.co",
  "trmlabs.com",
  "www.trmlabs.com",
  "halborn.com",
  "www.halborn.com",
  "blog.halborn.com",
  "certik.com",
  "www.certik.com",
  "skynet.certik.com",
  "blocksec.com",
  "www.blocksec.com",
  "peckshield.com",
  "blog.peckshield.com",
  "slowmist.com",
  "slowmist.medium.com",
  "coindesk.com",
  "www.coindesk.com",
  "theblock.co",
  "www.theblock.co",
  "decrypt.co",
  "www.decrypt.co",
  "arkhamintelligence.com",
  "www.arkhamintelligence.com",
  "zachxbt.io",
  "zachxbt.notion.site",
  "ic3.gov",
  "www.ic3.gov",
  "fbi.gov",
  "www.fbi.gov",
  "treasury.gov",
  "home.treasury.gov",
  "ofac.treasury.gov",
  "europa.eu",
  "ec.europa.eu",
  "gov.uk",
  "www.gov.uk",
  "medium.com",
  "mirror.xyz",
  "substack.com",
]);

// Common contract addresses that appear all over crypto-incident writeups
// but carry zero attribution value — USDT, USDC, WETH, the zero address,
// the standard burn address. Dropping them keeps the graph free of "every
// hack touches USDT" mega-clusters that drown real operator wallets.
const NOISE_ADDRESSES = new Set<string>(
  [
    "0x0000000000000000000000000000000000000000",
    "0x000000000000000000000000000000000000dead",
    // USDT / USDC / WETH on Ethereum
    "0xdac17f958d2ee523a2206206994597c13d831ec7",
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    // BUSD, DAI
    "0x4fabb145d64652a948d72533023f6e7a623c7c53",
    "0x6b175474e89094c44da98b954eedeac495271d0f",
    // WBTC
    "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    // USDC on Polygon, BSC, Arbitrum, Optimism, Base, Avalanche use a mix
    // of native + bridged versions. The literals below cover the most
    // commonly cited variants.
    "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", // USDC.e on Polygon
    "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // Native USDC Polygon
    "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", // USDC Avax (bridged)
    "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8", // USDC.e Arbitrum
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831", // Native USDC Arbitrum
    "0x0b2c639c533813f4aa9d7837caf62653d097ff85", // Native USDC Optimism
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // Native USDC Base
    // Tornado Cash router (denylisted but appears in every laundering
    // writeup — treat as noise for graph-connection purposes; the OFAC
    // SDN row already carries the attribution).
    "0xdd4c48c0b24039969fc16d1cdf626eab821d3384",
    "0xd4b88df4d29f5cedd6857912842cff3b20c8cfa3",
  ].map((s) => s.toLowerCase()),
);

export type SourceScrapeResult = {
  fetched: string[];
  skippedHosts: string[];
  errors: Array<{ url: string; error: string }>;
  inputs: AddressInput[];
};

/**
 * Scrape every trusted source URL on the payload and return deduped
 * AddressInput rows. Idempotent on the input payload — does not mutate.
 * Callers should pass the result into linkAddressesToSubmission.
 */
export async function scrapeAddressesFromSources(
  payload: IntelPayload,
): Promise<SourceScrapeResult> {
  const out: SourceScrapeResult = {
    fetched: [],
    skippedHosts: [],
    errors: [],
    inputs: [],
  };

  const fallbackChain = inferChainFromHeadline(payload.headline ?? "");
  const seen = new Set<string>(); // `${chain}:${lower(address)}`

  for (const url of payload.sources ?? []) {
    let host: string;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      out.errors.push({ url, error: "invalid-url" });
      continue;
    }

    if (!TRUSTED_HOSTS.has(host)) {
      out.skippedHosts.push(host);
      continue;
    }

    const fetched = await fetchTextWithTimeout(url);
    if (!fetched.ok) {
      out.errors.push({ url, error: fetched.error });
      continue;
    }
    out.fetched.push(url);

    const hrefs = extractHrefs(fetched.text);
    const syntheticPayload: IntelPayload = {
      headline: payload.headline,
      body: fetched.text,
      links: hrefs,
      sources: [],
    };
    const found = extractAddressesFromIntel(syntheticPayload);

    let kept = 0;
    for (const candidate of found) {
      // Promote bare EVM defaults to the headline's chain when we have one.
      // extractAddressesFromIntel defaults EVM literals to "ethereum" — for
      // a row whose headline says "on Arbitrum" that's wrong. If the
      // address was URL-typed by an explorer hostname, it stays as-is
      // (extractAddressesFromIntel handles that ordering).
      const chain =
        candidate.chain === "ethereum" && fallbackChain
          ? fallbackChain
          : candidate.chain;

      if (!CHAIN_SLUG_SET.has(chain)) continue;
      const lower = candidate.address.toLowerCase();
      if (NOISE_ADDRESSES.has(lower)) continue;

      const key = `${chain}:${lower}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.inputs.push({
        chain,
        address: candidate.address,
        role: "observed",
      });

      kept++;
      if (kept >= MAX_PER_SOURCE) break;
    }
  }

  return out;
}

async function fetchTextWithTimeout(
  url: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
      signal: ac.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      return { ok: false, error: `http_${res.status}` };
    }
    const ct = res.headers.get("content-type") ?? "";
    // Refuse pure binary content. text/* + application/json + application/xml
    // are all regex-safe.
    if (
      ct &&
      !/^(text|application\/(json|xml|xhtml|ld\+json|x-www-form-urlencoded))/i.test(
        ct,
      )
    ) {
      return { ok: false, error: `non-text-content-type:${ct.split(";")[0]}` };
    }
    return { ok: true, text: await res.text() };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Pull every <a href="..."> URL out of HTML. Used so that explorer links
 * embedded in a writeup (etherscan.io/address/..., polygonscan.com/...)
 * carry chain-typing through extractAddressesFromIntel.
 */
function extractHrefs(html: string): string[] {
  const out: string[] = [];
  const re = /\bhref\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = m[1].trim();
    if (url.startsWith("http://") || url.startsWith("https://")) {
      out.push(url);
    }
  }
  return out;
}

/**
 * Map "Penpie $27M — Sep 2024 — exploit on Arbitrum" to "arbitrum". The
 * harvester-generated headlines always end with `on <Chain>` where chain
 * comes from the upstream feed; this is the cheapest place to recover it
 * post-persistence.
 */
function inferChainFromHeadline(headline: string): string | null {
  const onMatch = headline.match(/\bon\s+([A-Za-z][A-Za-z0-9 ·+&-]+)$/i);
  const tail = onMatch?.[1]?.trim().toLowerCase() ?? headline.toLowerCase();
  // Walk the keywords in specificity order so "bnb smart chain" beats "bnb".
  if (/optimism|optimistic/.test(tail)) return "optimism";
  if (/arbitrum/.test(tail)) return "arbitrum";
  if (/polygon|matic/.test(tail)) return "polygon";
  if (/avalanche|avax/.test(tail)) return "avalanche";
  if (/\bbase\b/.test(tail)) return "base";
  if (/\b(bsc|binance|bnb)\b/.test(tail)) return "bsc";
  if (/solana|\bsol\b/.test(tail)) return "solana";
  if (/\btron\b|trx/.test(tail)) return "tron";
  if (/bitcoin|\bbtc\b/.test(tail)) return "bitcoin";
  if (/litecoin|\bltc\b/.test(tail)) return "litecoin";
  if (/\bton\b/.test(tail)) return "ton";
  if (/near/.test(tail)) return "near";
  if (/sui/.test(tail)) return "sui";
  if (/aptos/.test(tail)) return "aptos";
  if (/casper/.test(tail)) return "casper";
  if (/ripple|xrp/.test(tail)) return "ripple";
  if (/ethereum|mainnet/.test(tail)) return "ethereum";
  return null;
}
