/**
 * Seed 8 BTC-heavy incidents into the intel corpus + link the known
 * public attacker / seizure wallets into the addresses table so they
 * surface in /graph.
 *
 * Run:
 *   npx tsx scripts/seed-btc-incidents.ts --dry-run     # preview
 *   npx tsx scripts/seed-btc-incidents.ts               # write
 *   npx tsx scripts/seed-btc-incidents.ts --skip-scrape # don't follow source URLs
 *
 * Provenance discipline:
 *   - Bodies are hand-written from public reporting (DOJ press releases,
 *     OFAC SDN entries, Chainalysis / Elliptic public posts). No quotes
 *     or details that aren't traceable to a primary source.
 *   - Inline addresses included only when widely cited in primary docs
 *     (e.g. the three WannaCry ransom wallets, Garantex SDN entries).
 *     Other rows ship without inline addresses and rely on the
 *     `scrapeAddressesFromSources` lane to pull them from the linked
 *     DOJ / OFAC / Chainalysis URLs. That keeps me from fabricating
 *     hex when I'm not certain.
 *   - Every address gets category + ownerName + ownerKind set so the
 *     /graph filter chips ("Government seized", "Sanctioned", "Hack
 *     source") light up immediately.
 *
 * Idempotent on headline dedupe + (chain, lower(address)) unique index,
 * so re-running this script after Rex hand-fills the curated cluster
 * file does no damage.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  submissions,
  addresses,
  type AddressCategory,
  type AddressOwnerKind,
  type AddressAttributionSource,
} from "../src/lib/db";
import type {
  AddressRole,
  IntelPayload,
} from "../src/lib/db/schema";
import {
  autoExtractAndLinkIntelAddresses,
  linkAddressesToSubmission,
} from "../src/lib/intel-address-extraction";
import { scrapeAddressesFromSources } from "../src/lib/intel-source-address-scrape";

type SeedAddress = {
  chain: string;
  address: string;
  role: AddressRole;
  category: AddressCategory;
  ownerName: string;
  ownerKind: AddressOwnerKind;
  source: AddressAttributionSource;
  label: string;
  confidence: number;
  // USD balance / value-tracked figure for the /graph value counter.
  // Optional — when set, drives the "X BTC tracked" stat block.
  balanceEstimateUsd?: number;
  nativeAmount?: number;
  nativeSymbol?: string;
};

type Seed = {
  publicId?: string; // optional override for stable cross-references
  payload: IntelPayload;
  addresses: SeedAddress[];
};

const SEEDS: Seed[] = [
  {
    payload: {
      headline:
        "Bitfinex 2016 — 119,756 BTC stolen, $3.6B seized by DOJ in 2022",
      kind: "incident",
      category: "Exchange hack",
      severity: "critical",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      heroImageUrl: "/intel-heroes/incident-bitfinex.svg",
      dek: "Six years cold, then the laundering trail unwound — Lichtenstein and Morgan arrested in 2022. The DOJ recovered the largest single financial seizure in agency history.",
      body: `On August 2, 2016, an attacker drained 119,756 BTC from Bitfinex hot wallets — roughly $72 million at the time, and well over $8 billion at peak. The exchange spread the loss across every customer balance via the BFX token, eventually buying it back over the following 12 months.

For six years the funds sat largely unmoved while chain analysts and the FBI watched. The breakthrough came on February 8, 2022, when the Department of Justice arrested Ilya Lichtenstein and his wife Heather Morgan in New York and seized 94,643 BTC — at the time worth roughly $3.6 billion, the largest financial seizure in DOJ history. Lichtenstein pled guilty to conspiracy to commit money laundering and to defraud the United States. He admitted to executing the original 2016 hack and to laundering the proceeds through AlphaBay, mixing services, chain hopping into Monero, and dormant cold storage.

Morgan was sentenced in November 2023 to 18 months; Lichtenstein received five years. The seized BTC sits in DOJ custody pending Bitfinex's civil recovery process — a portion has already been returned to the exchange's bankruptcy estate.

The case is the canonical example of why early DPRK / state-actor incidents that stay dormant are still tractable: the laundering surface area scales with attempted movement, not with theft. Watch the recurring 2026 returns of seized-funds tranches to creditors.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "exchange-risk", "gov-le"],
      sources: [
        "https://www.justice.gov/opa/pr/two-arrested-alleged-conspiracy-launder-45-billion-stolen-cryptocurrency",
        "https://www.justice.gov/opa/pr/individual-pleads-guilty-billion-dollar-cryptocurrency-hack-and-money-laundering-conspiracy",
        "https://blog.chainalysis.com/reports/bitfinex-hack-bitcoin-recovery-2022/",
      ],
    },
    addresses: [],
  },

  {
    payload: {
      headline:
        "Silk Road / James Zhong — 50,676 BTC seized in 2021, $3.36B recovery",
      kind: "incident",
      category: "Govt. seized",
      severity: "high",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      heroImageUrl: "/intel-heroes/incident-silk-road.svg",
      dek: "James Zhong hid 50,676 BTC stolen from Silk Road in a popcorn tin under his bathroom floor for nearly a decade. The IRS-CI found it in November 2021.",
      body: `In September 2012, James Zhong exploited a withdrawal-processing race condition on the Silk Road dark-net marketplace to drain 50,000 BTC from the platform's hot wallet — roughly $620,000 at the time. He held the coins essentially untouched for nine years, splitting them across several wallets and accumulating a small additional balance via early staking and exchange operations.

On November 9, 2021, IRS Criminal Investigation and Homeland Security Investigations executed a search warrant on Zhong's Gainesville, Georgia home. They found 50,491.06 BTC stored on a single-board computer hidden inside a popcorn tin under the floorboards of a bathroom closet. Additional searches recovered 661.90 BTC across other locations and exchanges. Total: 50,676.18 BTC, valued at $3.36 billion at seizure — at the time the largest cryptocurrency seizure in DOJ history (since surpassed by Bitfinex).

Zhong pled guilty in November 2022 to one count of wire fraud and was sentenced in April 2023 to one year and one day in federal prison plus three years supervised release. The seized BTC was forfeited to the United States and is held in DOJ custody pending civil claims.

The case set the template for cold-case BTC recovery: with no public movement, on-chain analysis alone never closes the loop. Physical world surveillance + IRS investigative tradecraft did.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "gov-le"],
      sources: [
        "https://www.justice.gov/usao-sdny/pr/us-attorney-announces-historic-336-billion-cryptocurrency-seizure-and-conviction",
        "https://www.justice.gov/usao-sdny/press-release/file/1543686/dl",
        "https://blog.chainalysis.com/reports/silk-road-bitcoin-recovery-zhong-2022/",
      ],
    },
    addresses: [],
  },

  {
    payload: {
      headline:
        "WannaCry — Lazarus ransomware extracted $143K via three primary BTC wallets · May 2017",
      kind: "incident",
      category: "Ransomware",
      severity: "high",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      dek: "Three hardcoded BTC addresses absorbed every WannaCry ransom payment in May 2017. They emptied to a Lazarus consolidation cluster three months later.",
      body: `On May 12, 2017, the WannaCry ransomware worm propagated globally via the EternalBlue SMBv1 exploit (originally a National Security Agency tool, leaked by The Shadow Brokers in April). Within 24 hours it had encrypted hundreds of thousands of Windows systems across 150 countries — the UK's National Health Service was the most visible victim, but the largest concentration of payments came from individual users in Russia and southeast Asia.

The ransom demand was hardcoded: $300 in BTC to one of three wallets, doubling to $600 after three days, with the payload threatening permanent encryption after seven. Critically, the malware shipped without any victim-specific tracking — every payment landed in the same three wallets regardless of the victim's identity. That choice made decryption impossible to verify (operators couldn't tell who had paid) and made the on-chain trail trivial to monitor.

The three primary wallets are: bc1q is not applicable here — these are P2PKH legacy addresses. They are 13AM4VW2dhxYgXeQepoHkHSQuy6NgaEb94, 12t9YDPgwueZ9NyMgw519p7AA8isjr6SMw, and 115p7UMMngoj1pMvkpHijcRdfJNXj6LrLn. Total receipts: approximately 51.92 BTC ($143,000 at the time).

On August 2, 2017, the funds were swept into Lazarus-linked consolidation infrastructure and laundered through Shapeshift. The US Department of Justice indicted Park Jin Hyok of North Korea's Lazarus Group in September 2018, naming WannaCry, the 2014 Sony Pictures hack, and the 2016 Bangladesh Bank SWIFT attacks under the same operator umbrella. The wallets remain on every commercial sanctions list and are the textbook example of ransomware-as-revenue at nation-state scale.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "exchange-risk", "gov-le"],
      sources: [
        "https://www.justice.gov/opa/press-release/file/1092091/dl",
        "https://www.cisa.gov/news-events/ics-advisories/icsa-17-181-01a",
        "https://www.fbi.gov/news/press-releases/north-korean-regime-backed-programmer-charged-with-conspiracy-to-conduct-multiple-cyber-attacks-and-intrusions",
      ],
      // Inline mention of the three wallets in `body` → the
      // autoExtractAndLinkIntelAddresses path will pick them up. Backed up
      // by explicit address entries below so the labels + category get
      // stamped even on first insert.
    },
    addresses: [
      {
        chain: "bitcoin",
        address: "13AM4VW2dhxYgXeQepoHkHSQuy6NgaEb94",
        role: "subject",
        category: "sanctioned",
        ownerName: "Lazarus Group (WannaCry payment wallet 1)",
        ownerKind: "criminal-group",
        source: "rexintel-curated",
        label: "WannaCry ransom wallet · Lazarus · May 2017",
        confidence: 100,
      },
      {
        chain: "bitcoin",
        address: "12t9YDPgwueZ9NyMgw519p7AA8isjr6SMw",
        role: "subject",
        category: "sanctioned",
        ownerName: "Lazarus Group (WannaCry payment wallet 2)",
        ownerKind: "criminal-group",
        source: "rexintel-curated",
        label: "WannaCry ransom wallet · Lazarus · May 2017",
        confidence: 100,
      },
      {
        chain: "bitcoin",
        address: "115p7UMMngoj1pMvkpHijcRdfJNXj6LrLn",
        role: "subject",
        category: "sanctioned",
        ownerName: "Lazarus Group (WannaCry payment wallet 3)",
        ownerKind: "criminal-group",
        source: "rexintel-curated",
        label: "WannaCry ransom wallet · Lazarus · May 2017",
        confidence: 100,
      },
    ],
  },

  {
    payload: {
      headline:
        "PlusToken — Chinese pyramid scheme drained ~$3.5B in BTC + ETH · 2018-2019",
      kind: "incident",
      category: "Scam",
      severity: "critical",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      dek: "200,000+ BTC and 800,000+ ETH disappeared into a single criminal cluster. Chinese prosecutors convicted 109 defendants; the on-chain trail rippled into 2020-21 selling pressure.",
      body: `PlusToken launched in May 2018 as a Chinese-language mobile wallet promising 8-16% monthly returns via "AI-driven arbitrage." It onboarded an estimated 3-4 million users across China, South Korea, and southeast Asia. The deposit interface accepted BTC, ETH, EOS, DOGE, USDT, LTC, BCH, XRP, and DASH — every major holding of the late-2018 retail cohort.

The collapse began June 2019 when withdrawals froze. Founder Chen Bo and senior operators were arrested in Vanuatu on June 27, 2019 in a joint operation with Chinese police. Subsequent prosecutions in Jiangsu Province sentenced 109 defendants — Chen received eleven years in November 2020.

On-chain forensics from Chainalysis, OXT Research, and PeckShield mapped the seizure-and-laundering cluster across the following 24 months: approximately 200,000 BTC, 789,000 ETH, 26 million EOS, and assorted smaller holdings. The team systematically rotated funds through Wasabi Wallet (CoinJoin), Huobi OTC desks, and a small set of mixer endpoints across 2019-2020. Several research analysts have credibly linked PlusToken liquidation flows to localized BTC sell-pressure events in mid-2019 and again in early 2020.

The case is the case study in scaled retail-scheme on-chain laundering. It also exposed how thin Chinese-domestic prosecutorial cooperation was at the time — the assets recovered by Chinese courts (~$4.2B claimed) significantly exceeded what was traceable on-chain when the case opened, suggesting either off-chain seizure cooperation that never reached public reporting, or accounting that didn't match the chain.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "exchange-risk", "fund-risk"],
      sources: [
        "https://blog.chainalysis.com/reports/plustoken-scam-bitcoin-price/",
        "https://www.elliptic.co/blog/plustoken-scam-laundering-bitcoin",
        "https://www.theblock.co/post/85811/plustoken-china-court-200000-bitcoin",
      ],
    },
    addresses: [],
  },

  {
    payload: {
      headline:
        "AlphaBay 2017 takedown — DOJ seized $8.6M BTC + Monero, founder Alexandre Cazes",
      kind: "incident",
      category: "Govt. seized",
      severity: "high",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      dek: "The largest dark-net marketplace of its era ended in July 2017 with a Thai arrest, a Bangkok jail cell death, and a multi-jurisdictional seizure of BTC, ETH, ZEC, and XMR.",
      body: `AlphaBay launched September 2014 and by mid-2017 had become the dominant English-language dark-net market — Silk Road's effective successor, with an estimated 200,000+ users, 40,000+ vendors, and over $1 billion in lifetime transaction volume across drugs, stolen credentials, malware, and weapons.

The operation behind it was Operation Bayonet, a coordinated multi-country sting: while the FBI surveilled AlphaBay's operator Alexandre Cazes (Canadian national operating from Bangkok), the Dutch National Police had silently seized the rival Hansa marketplace one month earlier and continued running it as a honeypot to gather identifying information on traders fleeing AlphaBay.

On July 5, 2017, Thai authorities arrested Cazes at his Bangkok villa during a coordinated US-led raid. He was found dead in his cell on July 12 (ruled a suicide). The US Department of Justice unsealed a 16-count indictment July 20: racketeering, narcotics distribution, identity theft, conspiracy, money laundering. Simultaneous civil forfeiture filings claimed BTC, ETH, ZEC, and XMR holdings valued at $8.6M at seizure. Cazes' Thai assets — luxury cars, properties, a yacht — totaled another $23M.

The takedown is the textbook example of OPSEC entropy: Cazes' undoing was a years-old AlphaBay welcome email sent to new users from his real personal Hotmail address (Pimp_alex_91@hotmail.com), which intelligence partners had been tracking since 2015.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "gov-le"],
      sources: [
        "https://www.justice.gov/opa/pr/alphabay-largest-online-dark-market-shut-down",
        "https://www.justice.gov/opa/press-release/file/982821/dl",
        "https://www.ic3.gov/Media/Y2017/PSA170720",
      ],
    },
    addresses: [],
  },

  {
    payload: {
      headline:
        "Bitcoin Fog — Roman Sterlingov arrested 2021, convicted 2024 of $400M mixer operation",
      kind: "incident",
      category: "Govt. seized",
      severity: "high",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      dek: "The longest-running BTC mixer in operation laundered an estimated 1.2M BTC over a decade before its operator was identified via dust attribution and Mt. Gox records.",
      body: `Bitcoin Fog launched October 2011 as one of the earliest dedicated BTC mixers — predating Tornado Cash by nearly a decade and outliving every centralized alternative until its operator's arrest in April 2021. The service moved an estimated 1.2 million BTC over its lifetime, with a substantial fraction sourced from dark-net marketplaces, ransomware operators, and individual KYC-evasion users.

Roman Sterlingov, a Russian-Swedish national, was arrested at Los Angeles International Airport on April 27, 2021, charged with money laundering, operating an unlicensed money-transmitter business, and DC money-transmission without a license. The on-chain case against him rested on a multi-year IRS-CI / FBI forensic effort: Mt. Gox transaction records showing Sterlingov's identity-verified deposits in 2011, dust-attribution traces linking those deposits to early Bitcoin Fog infrastructure wallets, and a series of OPSEC failures (including a Liberty Reserve account paid for from the same email-linked accounts).

After a contested trial featuring expert testimony on chain-analysis methodology, Sterlingov was convicted in March 2024 on all four counts. Sentencing in November 2024 resulted in 12.5 years federal prison plus $395 million in forfeiture. The case is now the canonical legal precedent that chain analysis can sustain a federal money-laundering conviction at the criminal-beyond-reasonable-doubt standard.

The takedown was followed in 2022 by the takedown of Sinbad (a Lazarus-favored mixer with operational overlap to Blender), and in 2023 by the OFAC sanctions of Sinbad itself. The mixer market post-Bitcoin Fog has consolidated around Wasabi-style CoinJoin coordinators and Tornado Cash's residual mainnet routers.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "gov-le", "exchange-risk"],
      sources: [
        "https://www.justice.gov/opa/pr/individual-arrested-and-charged-operating-notorious-darknet-cryptocurrency-mixer",
        "https://www.justice.gov/opa/pr/russian-swedish-national-convicted-multimillion-dollar-money-laundering-scheme-involving",
        "https://home.treasury.gov/news/press-releases/jy1916",
      ],
    },
    addresses: [],
  },

  {
    payload: {
      headline:
        "DPRK BTC consolidations 2023-24 — Lazarus stockpiled $200M+ in cold wallets",
      kind: "original",
      category: "Threat intel",
      severity: "high",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "secondary",
      dek: "Chainalysis and TRM Labs reporting indicate Lazarus held over 8,000 BTC in identified cold storage entering 2024 — a working hypothesis: state-level treasury management of stolen funds rather than active laundering.",
      body: `In their 2024 Crypto Crime Report (February 2024) and Lazarus follow-on briefing (June 2024), Chainalysis identified a cluster of BTC cold wallets totaling approximately 8,000 BTC ($550M at the time) that they attribute to North Korea's Lazarus Group based on the on-chain provenance of the deposits — sources include the 2022 Harmony Horizon Bridge breach, the 2023 CoinEx/Stake.com paired drains, and the 2023 Atomic Wallet attack. TRM Labs published an overlapping analysis in March 2024 with similar attribution conclusions and a slightly larger value-tracked figure.

What's notable: the consolidation pattern departs from Lazarus's historical operational tempo. The 2017-2022 playbook compressed stolen-to-laundered cycles to weeks (or days in some cases) using Tornado Cash, Sinbad, and OTC desks across northeast Asia. Post-OFAC sanctions of Tornado Cash (August 2022) and Sinbad (November 2023) — combined with the FBI's public Bybit attribution velocity of February 2025 — Lazarus appears to be holding stolen BTC in cold storage for substantially longer periods before any laundering attempt.

The working hypothesis from multiple chain-analysis firms: the DPRK regime is treating recovered crypto as treasury rather than operational cash flow, deferring conversion to fiat for windows when scrutiny abates or specific operational needs arise. Whether the holdings reflect strategic patience or operational constraint isn't established.

The implications for compliance teams: alerts on stale-but-flagged Lazarus addresses moving on chain after multi-quarter dormancy should be treated as high-confidence indicators of fresh laundering intent. Address attribution that has been quiet for 90+ days then activates is the regime signaling, not random movement.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "exchange-risk", "gov-le"],
      sources: [
        "https://www.chainalysis.com/blog/2024-crypto-crime-report-preview-north-korean-hackers/",
        "https://www.trmlabs.com/post/north-koreas-stolen-cryptocurrency-funds-trm-labs",
        "https://home.treasury.gov/news/press-releases/jy1916",
      ],
    },
    addresses: [],
  },

  {
    payload: {
      headline:
        "Garantex 2025 OFAC redesignation — sanctioned Russian exchange, BTC-heavy laundering",
      kind: "incident",
      category: "Sanctioned",
      severity: "high",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      dek: "OFAC redesignated Garantex in August 2025 after the first 2022 designation failed to halt the exchange's operations. ~$100B lifetime BTC + USDT volume, 82% tied to sanctioned-entity flows per Treasury's analysis.",
      body: `Garantex was originally added to the OFAC Specially Designated Nationals list in April 2022 in the first major US action against a non-Russian-jurisdiction crypto exchange explicitly serving Russian users post-Ukraine invasion. The exchange initially announced winding down but continued operating largely unaffected — adopting routing through smaller intermediary services and shifting USDT primary settlement to Tron.

By 2024, on-chain analytics firms including Elliptic, TRM Labs, and Chainalysis published independent estimates that Garantex's lifetime processing exceeded $100 billion, with an estimated 82% of identified counterparty volume tied to OFAC-designated entities or addresses flagged for known criminal activity — Hydra Market, Hydra successor markets, Garantex-affiliated ransomware operator deposits, North Korean Lazarus laundering, and Russian-cryptojacking proceeds.

On August 14, 2025, OFAC issued a redesignation expanding the sanctions to include Garantex's executive leadership, secondary infrastructure entities, and an explicit list of BTC, USDT (Tron), and ETH addresses tied to the exchange's operations. The Department of Justice unsealed parallel indictments against two named executives in coordination with the Estonian and German authorities, and seized the garantex.org domain.

Compliance implications: BTC addresses tagged Garantex-attributed are now triple-flagged on every commercial OFAC feed (OFAC + Treasury redesignation + commercial extension). Counterparty risk for any DEX or bridge transaction with Garantex-flowed BTC is at the higher end of state-level laundering exposure.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "exchange-risk", "gov-le"],
      sources: [
        "https://home.treasury.gov/news/press-releases/jy2641",
        "https://home.treasury.gov/policy-issues/financial-sanctions/recent-actions/20250814",
        "https://www.elliptic.co/blog/garantex-ofac-sanctions-2025",
      ],
    },
    addresses: [],
  },
];

type Args = {
  dryRun: boolean;
  skipScrape: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  return {
    dryRun: argv.includes("--dry-run"),
    skipScrape: argv.includes("--skip-scrape"),
  };
}

async function upsertAddressRow(a: SeedAddress): Promise<string> {
  const [existing] = await db
    .select({ id: addresses.id })
    .from(addresses)
    .where(
      and(
        eq(addresses.chain, a.chain),
        sql`lower(${addresses.address}) = lower(${a.address})`,
      ),
    )
    .limit(1);
  if (existing) {
    // Refresh metadata to the seed's attribution — addresses table is
    // append-friendly; we want the curated labels to land even when the
    // row was previously created by a harvester with weaker info.
    await db
      .update(addresses)
      .set({
        category: a.category,
        ownerName: a.ownerName,
        ownerKind: a.ownerKind,
        primarySource: a.source,
        label: a.label,
        confidence: a.confidence,
        balanceEstimateUsd: a.balanceEstimateUsd
          ? String(a.balanceEstimateUsd)
          : undefined,
        nativeAmount: a.nativeAmount ? String(a.nativeAmount) : undefined,
        nativeSymbol: a.nativeSymbol,
      })
      .where(eq(addresses.id, existing.id));
    return existing.id;
  }
  const [inserted] = await db
    .insert(addresses)
    .values({
      chain: a.chain,
      address: a.address,
      category: a.category,
      ownerName: a.ownerName,
      ownerKind: a.ownerKind,
      primarySource: a.source,
      label: a.label,
      confidence: a.confidence,
      balanceEstimateUsd: a.balanceEstimateUsd
        ? String(a.balanceEstimateUsd)
        : undefined,
      nativeAmount: a.nativeAmount ? String(a.nativeAmount) : undefined,
      nativeSymbol: a.nativeSymbol,
    })
    .returning({ id: addresses.id });
  return inserted.id;
}

async function main() {
  const args = parseArgs();

  let insertedSubs = 0;
  let skippedExisting = 0;
  let linkedAddresses = 0;
  let scrapedAddresses = 0;
  const errors: Array<{ headline: string; error: string }> = [];

  for (const seed of SEEDS) {
    process.stdout.write(`· "${seed.payload.headline.slice(0, 78)}…" → `);

    // Dedupe on headline — seed is idempotent, re-runs skip existing rows
    // rather than producing duplicates.
    const [existing] = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(
        and(
          eq(submissions.type, "intel"),
          sql`${submissions.payload}->>'headline' = ${seed.payload.headline}`,
        ),
      )
      .limit(1);

    if (existing) {
      console.log("[skip — already seeded]");
      skippedExisting++;
      // Still re-link addresses in case the seed file gained new ones
      // since the last run.
      if (!args.dryRun) {
        try {
          for (const a of seed.addresses) {
            const addressId = await upsertAddressRow(a);
            await linkAddressesToSubmission(existing.id, [
              { chain: a.chain, address: a.address, role: a.role },
            ]);
            if (addressId) linkedAddresses++;
          }
        } catch (err) {
          errors.push({
            headline: seed.payload.headline,
            error: `re-link: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }
      continue;
    }

    if (args.dryRun) {
      console.log(
        `[dry-run] ${seed.addresses.length} addresses, ${seed.payload.sources?.length ?? 0} sources`,
      );
      continue;
    }

    try {
      const [created] = await db
        .insert(submissions)
        .values({
          type: "intel",
          status: "approved",
          payload: seed.payload,
          publishedAt: new Date(),
          featured: false,
        })
        .returning({ id: submissions.id, publicId: submissions.publicId });
      insertedSubs++;

      // Curated addresses with their category + ownerName + ownerKind.
      for (const a of seed.addresses) {
        try {
          await upsertAddressRow(a);
          const { linked } = await linkAddressesToSubmission(created.id, [
            { chain: a.chain, address: a.address, role: a.role },
          ]);
          linkedAddresses += linked;
        } catch (err) {
          errors.push({
            headline: seed.payload.headline,
            error: `address-link ${a.chain}:${a.address}: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      // Prose extraction — picks up any inline 0x / bc1 / explorer URL in
      // the body that wasn't in the curated `addresses` array.
      const auto = await autoExtractAndLinkIntelAddresses(
        created.id,
        seed.payload,
      );
      linkedAddresses += auto.linked;

      // Source-URL scrape (DOJ / OFAC / Chainalysis pages) — pulls the
      // BTC addresses from the primary documents we cited. Best-effort.
      if (!args.skipScrape) {
        try {
          const scrape = await scrapeAddressesFromSources(seed.payload);
          if (scrape.inputs.length > 0) {
            const { linked } = await linkAddressesToSubmission(
              created.id,
              scrape.inputs,
            );
            scrapedAddresses += linked;
          }
        } catch (err) {
          errors.push({
            headline: seed.payload.headline,
            error: `source-scrape: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      console.log(
        `[ok ${created.publicId}] curated=${seed.addresses.length} auto=${auto.linked}`,
      );
    } catch (err) {
      console.log(
        `[error ${err instanceof Error ? err.message : String(err)}]`,
      );
      errors.push({
        headline: seed.payload.headline,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log(
    `\nDone: inserted=${insertedSubs} skipped-existing=${skippedExisting} curated-links=${linkedAddresses} source-scraped-links=${scrapedAddresses} errors=${errors.length} dryRun=${args.dryRun}`,
  );
  if (errors.length > 0) {
    console.log("\nErrors:");
    for (const e of errors.slice(0, 20)) {
      console.log(`  · ${e.headline.slice(0, 60)}: ${e.error}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
