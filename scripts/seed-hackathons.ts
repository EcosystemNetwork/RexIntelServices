/**
 * Run with: npx tsx scripts/seed-hackathons.ts
 *
 * Seeds hackathons that don't come from the ETHGlobal feed
 * (scripts/seed-events-ethglobal.ts already seeds the ETHGlobal series).
 * Includes crypto/web3 hackathons plus AI / agentic-engineering hackathons
 * (e.g. tokens&), since both audiences overlap with RexIntel builders.
 * Pulled from DoraHacks, Devpost, lablab.ai, Encode Club, Akindo, Colosseum,
 * Luma, and the official organizer announcements — every entry below has a
 * confirmed source URL. Idempotent: matched by payload->>'name'.
 *
 * Date handling: 12:00 UTC start / 23:00 UTC end so the displayed calendar
 * date stays stable across timezones.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { EventPayload } from "../src/lib/db/schema";

type SeedInput = {
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  city?: string;
  country?: string;
  url: string;
  description: string;
  prizeUsd?: number;
};

const inputs: SeedInput[] = [
  // === Solana ecosystem (Colosseum-run global hackathons) ===
  {
    name: "Solana Frontier Hackathon 2026",
    startDate: "2026-04-06",
    endDate: "2026-05-11",
    city: "Online",
    url: "https://colosseum.com/",
    description:
      "Solana's spring 2026 global online hackathon, run on Colosseum. Build on Solana for a share of the prize pool and follow-on investment.",
  },
  {
    name: "Solana Fall Hackathon 2026",
    startDate: "2026-09-28",
    endDate: "2026-11-02",
    city: "Online",
    url: "https://colosseum.com/",
    description:
      "Solana's autumn 2026 global online hackathon, run on Colosseum. Five-week build window for new founders launching on Solana.",
  },

  // === Encode Club programmes ===
  {
    name: "Hyperliquid London Community Hackathon",
    startDate: "2026-01-16",
    endDate: "2026-01-18",
    city: "London",
    country: "United Kingdom",
    url: "https://www.encodeclub.com/programmes/hyperliquid-london-hackathon",
    description:
      "3-day in-person hackathon at Encode Hub focused on on-chain trading and Hyperliquid tooling. Workshops with Hyperliquid teams, bounties, and late-night hacking.",
  },
  {
    name: "Encode AI London Hackathon 2026",
    startDate: "2026-03-20",
    endDate: "2026-03-22",
    city: "London",
    country: "United Kingdom",
    url: "https://www.encodeclub.com/programmes/ai-london-2026",
    description:
      "3-day in-person AI hackathon at Encode Hub in Shoreditch. Builders, founders, researchers and students hacking on the frontier of AI.",
  },
  {
    name: "Kite AI Global Hackathon 2026",
    startDate: "2026-03-27",
    endDate: "2026-04-26",
    city: "Online",
    url: "https://www.encodeclub.com/programmes/kites-hackathon-ai-agentic-economy",
    description:
      "4-week global online hackathon run by Encode Club with Kite AI and Coinbase Ventures. Three tracks: Agentic Commerce, Agentic Trading, and a Novel track for autonomous AI agents.",
  },

  // === DoraHacks ===
  {
    name: "Polkadot Solidity Hackathon 2026",
    startDate: "2026-02-15",
    endDate: "2026-03-24",
    city: "Online",
    url: "https://dorahacks.io/hackathon/polkadot-solidity-hackathon/detail",
    description:
      "Polkadot APAC hackathon for shipping production-ready dApps on Polkadot Hub via EVM and PVM smart contracts.",
  },
  {
    name: "HashKey Chain Horizon Hackathon",
    startDate: "2026-03-10",
    endDate: "2026-04-23",
    city: "Online",
    url: "https://dorahacks.io/hackathon/2045/report",
    description:
      "HashKey Chain global online hackathon with a 40,000 USDT prize pool. Tracks across DeFi, PayFi, AI and more.",
    prizeUsd: 40000,
  },
  {
    name: "StableHacks 2026",
    startDate: "2026-03-14",
    endDate: "2026-03-23",
    city: "Online",
    url: "https://dorahacks.io/hackathon/stablehacks/detail",
    description:
      "Global online hackathon by Tenity and DoraHacks for builders shipping institutional-grade stablecoin infrastructure on Solana. Closing demo day for top 10 teams in Zurich on May 28.",
  },

  // === Aleph (Crecimiento — LATAM pop-up city hackathon) ===
  {
    name: "Aleph Hackathon 2026",
    startDate: "2026-03-20",
    endDate: "2026-03-22",
    city: "Buenos Aires",
    country: "Argentina",
    url: "https://aleph.crecimiento.build/es-aleph-hackathon",
    description:
      "LATAM crypto + AI hackathon hosted inside the Aleph March '26 pop-up city. In-person hubs across Buenos Aires, Salta and other Latin American cities + online.",
  },

  // === ETHGlobal Cannes (companion to the EthCC Cannes conference) ===
  {
    name: "ETHGlobal Cannes 2026",
    startDate: "2026-04-03",
    endDate: "2026-04-05",
    city: "Cannes",
    country: "France",
    url: "https://ethglobal.com/events/cannes2026",
    description:
      "ETHGlobal in-person Ethereum hackathon at the Palais des Festivals in Cannes, co-located with EthCC week.",
    prizeUsd: 375000,
  },

  // === lablab.ai ===
  {
    name: "Arc & Circle Web3 Hackathon",
    startDate: "2026-04-20",
    endDate: "2026-04-26",
    city: "San Francisco",
    country: "United States",
    url: "https://lablab.ai/event",
    description:
      "Hybrid hackathon run on lablab.ai for agentic economic apps using Circle's Nanopayments infrastructure with USDC settlement on Arc. Online build phase plus on-site demos in SF.",
  },
  {
    name: "AI & Big Data Expo Hackathon",
    startDate: "2026-05-11",
    endDate: "2026-05-19",
    city: "San Jose",
    country: "United States",
    url: "https://lablab.ai/",
    description:
      "Hybrid AI hackathon run on lablab.ai alongside the AI & Big Data Expo. Online build phase culminating in an on-site hybrid build day and demos at the San Jose McEnery Convention Center.",
  },

  // === EasyA (Consensus side hackathons) ===
  {
    name: "EasyA Consensus Miami Hackathon 2026",
    startDate: "2026-05-05",
    endDate: "2026-05-07",
    city: "Miami",
    country: "United States",
    url: "https://www.easya.io/events/easya-consensus-miami-hackathon",
    description:
      "72-hour hackathon co-located with Consensus Miami, $58,000 USD in prizes. ~1,000 developers building AI-native crypto startups across Base, Solana and more.",
    prizeUsd: 58000,
  },

  // === Blockworks / Permissionless ===
  {
    name: "Permissionless IV Hackathon",
    startDate: "2026-06-22",
    endDate: "2026-06-23",
    city: "Brooklyn",
    country: "United States",
    url: "https://blockworks.com/event/permissionless-iv-hackathon",
    description:
      "36-hour onsite hackathon by Cracked Labs and Blockworks at Industry City, Brooklyn — kicks off Permissionless IV. $100,000+ in bounties; free to attend with conference access.",
    prizeUsd: 100000,
  },

  // === ETHGlobal virtual hackathons (DeFi) ===
  {
    name: "ETHGlobal HackMoney 2026",
    startDate: "2026-01-30",
    endDate: "2026-02-11",
    city: "Online",
    url: "https://ethglobal.com/events/hackmoney2026",
    description:
      "ETHGlobal's largest DeFi hackathon of 2026 — virtual, 12 days. Builders shipped stablecoin flows, on/off-ramps and agentic payments.",
    prizeUsd: 300000,
  },

  // === Starknet / ZK ===
  {
    name: "Re{define} Starknet Hackathon 2026",
    startDate: "2026-02-01",
    endDate: "2026-02-28",
    city: "Online",
    url: "https://hackathon.starknet.org/",
    description:
      "Starknet Foundation's flagship 2026 hackathon, run on DoraHacks. $27,000 in prizes across Bitcoin, Privacy and Open tracks; submissions deployed to Starknet.",
    prizeUsd: 27000,
  },

  // === Regional EthCC-week hackathons ===
  {
    name: "Rayls EthCC Hackathon",
    startDate: "2026-03-28",
    endDate: "2026-03-29",
    city: "Cannes",
    country: "France",
    url: "https://ethcc.io/",
    description:
      "Rayls' 2nd developer hackathon, held during EthCC[9] week in Cannes. Part of Rayls' $1M Developer Program in the run-up to its public chain mainnet.",
  },

  // === Regional Ethereum community hackathons ===
  {
    name: "ETHMumbai 2026",
    startDate: "2026-03-12",
    endDate: "2026-03-15",
    city: "Mumbai",
    country: "India",
    url: "https://www.ethmumbai.in/",
    description:
      "Community Ethereum conference + hackathon in Mumbai — builder workshops, talks, and a multi-day in-person hackathon.",
  },
  {
    name: "ETHPrague 2026",
    startDate: "2026-05-08",
    endDate: "2026-05-10",
    city: "Prague",
    country: "Czech Republic",
    url: "https://ethprague.com/",
    description:
      "ETHPrague Conference and Hackathon — 3 days of in-person building plus talks from the Czech Ethereum community.",
  },
  {
    name: "ETHRome 2026",
    startDate: "2026-09-11",
    endDate: "2026-09-13",
    city: "Rome",
    country: "Italy",
    url: "https://www.ethrome.org/",
    description:
      "ETHRome — 3-day in-person Ethereum hackathon in Rome focused on shipping production-ready dApps in a single weekend.",
  },

  // === TAIKAI ===
  {
    name: "Hackanation 2026",
    startDate: "2026-04-24",
    endDate: "2026-06-02",
    city: "Hybrid",
    url: "https://taikai.network/en/TokenNation/hackathons/Hackanation2026/overview",
    description:
      "TokenNation's flagship 2026 hybrid hackathon on TAIKAI uniting blockchain, entrepreneurship and social impact. Tracks include Solana, Chainlink Labs, Web3 and AI.",
  },

  // === Devfolio ===
  {
    name: "HackPrix Season 3",
    startDate: "2026-06-13",
    endDate: "2026-06-14",
    city: "Kismatpur",
    country: "India",
    url: "https://hackprix-2026.devfolio.co/",
    description:
      "HackPrix returns as a 2-day in-person hackathon designed for rapid prototyping and collaboration across Indian builder communities.",
  },

  // === Cosmoverse ===
  {
    name: "Hackmos 2026",
    startDate: "2026-10-23",
    endDate: "2026-11-01",
    city: "Hong Kong",
    url: "https://cosmoverse.org/hackmos",
    description:
      "Hackmos — the official Cosmoverse 2026 hackathon, now open to global builders across the Cosmos / IBC ecosystem.",
  },

  // === Bags (creator-finance on Solana) ===
  {
    name: "The Bags Hackathon",
    startDate: "2026-04-14",
    endDate: "2026-06-01",
    city: "Online",
    url: "https://bags.fm/hackathon",
    description:
      "Solana creator-finance hackathon hosted by Bags (also listed on DoraHacks). $1M in direct prizes — top 100 projects each receive a $10k–$100k grant — plus $3M in ongoing funding and support and hardware prizes for winners. Every submission must launch on Bags and link a token to the project. Submissions that integrate via API, SDK, token-launching, trading, or creator tools rank higher. Open-source strongly encouraged; private repos must give judges access.",
    prizeUsd: 1000000,
  },

  // === tokens& (AI / agentic engineering hackathons) ===
  {
    name: "Agentic Engineering Hack NYC 2026",
    startDate: "2026-05-23",
    endDate: "2026-05-23",
    city: "New York",
    country: "United States",
    url: "https://luma.com/nycagenthack",
    description:
      "One-day NYC builder hackathon by tokens&. 9:30 AM – 7:30 PM EDT, with kickoff, day-long hack, demos and awards. Partners: Google DeepMind, Datadog, Nimble, ClickHouse. Speakers/judges from DeepMind, Luminai, Nimble, Airbyte, Crosby and Freeport. Approval required to attend.",
  },
  {
    name: "Harness Engineering Hack SF 2026",
    startDate: "2026-06-12",
    endDate: "2026-06-12",
    city: "San Francisco",
    country: "United States",
    url: "https://luma.com/harnesshack",
    description:
      "One-day SF builder hackathon by tokens&. 9:30 AM – 7:30 PM PDT, with kickoff, day-long hack, demos and awards. Partners: AWS, ElevenLabs, Luminai. Judges from Luminai, Anthropic and Gap Inc. Approval required to attend.",
  },

  // === ElevenHacks (ElevenLabs 11-week weekly hackathon series) ===
  {
    name: "Hack #9: Stripe x ElevenLabs",
    startDate: "2026-05-14",
    endDate: "2026-05-21",
    city: "Online",
    url: "https://hacks.elevenlabs.io/hackathons/8",
    description:
      "Week 9 of ElevenHacks — ElevenLabs' 11-week online series (Mar 19 – May 28, 2026, $240K+ total prizes). This week's Stripe challenge: build something people will pay for using Stripe + ElevenLabs voice APIs. $18,980 prize pool split across Stripe credits and ElevenLabs Scale plans (1st $10,990, 2nd $5,660, 3rd $2,330). Opens Thu 14 May 17:00 UK; submissions close Thu 21 May 17:00 UK; winners Tue 26 May. Judges: Rajan Patel (Stripe), Joe Reeve (ElevenLabs).",
    prizeUsd: 18980,
  },
  {
    name: "Hack #10: Blackbox x ElevenLabs",
    startDate: "2026-05-21",
    endDate: "2026-05-28",
    city: "Online",
    url: "https://hacks.elevenlabs.io/hackathons/9",
    description:
      "Week 10 of ElevenHacks — ElevenLabs' 11-week online series. This week's Blackbox AI challenge combines Blackbox's coding agents with ElevenLabs voice APIs. Opens Thu 21 May 17:00 UK; submissions close Thu 28 May 17:00 UK. Prize pool TBA.",
  },
  {
    name: "Hack #11: D-ID x ElevenLabs",
    startDate: "2026-05-28",
    endDate: "2026-06-04",
    city: "Online",
    url: "https://hacks.elevenlabs.io/hackathons/10",
    description:
      "Final week of ElevenHacks — ElevenLabs' 11-week online series. D-ID's digital-human / avatar APIs paired with ElevenLabs voice APIs. $11,980 prize pool. Opens Thu 28 May 17:00 UK.",
    prizeUsd: 11980,
  },

  // === Canteen / Circle / Arc (Agora) ===
  {
    name: "Agora Agents Hackathon",
    startDate: "2026-05-11",
    endDate: "2026-05-25",
    city: "Online",
    url: "https://agora.thecanteenapp.com/",
    description:
      "Two-week online hackathon run by Canteen with Circle and Arc, focused on AI agents that trade, invest, create, and interface with markets — settling on Arc (Circle's L1) using USDC. $50K total prizes: $40K grand prizes (1st $10K; 2×$7.5K second; 3×$5K third), ~10–12 standout-team awards ($7.5K), feedback incentives ($500) and easter-egg bounties ($2K). Six Requests for Builders: perps trading, prediction-market trading, prediction-market verticals, portfolio management, cross-platform arbitrage, social trading intelligence. Submissions require a live working product demo and public GitHub repo.",
    prizeUsd: 50000,
  },

  // === Sui Foundation ===
  {
    name: "Sui Overflow 2026",
    startDate: "2026-05-01",
    endDate: "2026-06-30",
    city: "Online",
    url: "https://overflow.sui.io/",
    description:
      "Sui Foundation's global online hackathon. $1M+ total prize pool — $500K+ in core track prizes plus specialized track pools. Tracks: Agentic Web, DeFi & Payments, Walrus, DeepBook, Infra & DevX, EVE, ONE Championship, Degen, Payments & Wallets, Entertainment & Culture, and Explorations (multi-chain/RWA). Project submissions due May 23. Demo days June 13–14. Winners announced end of June. $2,500 university awards available. OceanDAO Summit follows in Athens July 21–31.",
    prizeUsd: 1000000,
  },

  // === Arbitrum Open House ===
  {
    name: "Arbitrum Open House London 2026",
    startDate: "2026-05-25",
    endDate: "2026-06-14",
    city: "London",
    country: "United Kingdom",
    url: "https://openhouse.arbitrum.io/",
    description:
      "3-week online Buildathon (May 25 – Jun 14) on Arbitrum followed by a 3-day in-person Founder House in London (Jul 10–12). $115K in Buildathon prizes plus $300K at the Founder House — $415K total. AI Agentic Category reserved $15K for the top three. Top 3 Buildathon winners share $70K; the Arbitrum Foundation also reserves $30K USDC in case-by-case grants. Same format that ran in NYC earlier in the year.",
    prizeUsd: 415000,
  },
];

function toPayload(input: SeedInput): EventPayload {
  const startsAt = `${input.startDate}T12:00:00Z`;
  const endsAt =
    input.endDate === input.startDate
      ? undefined
      : `${input.endDate}T23:00:00Z`;
  return {
    name: input.name,
    startsAt,
    endsAt,
    city: input.city,
    country: input.country,
    url: input.url,
    description: input.description,
    eventType: "hackathon",
    prizeUsd: input.prizeUsd,
  };
}

async function upsertHackathon(input: SeedInput) {
  const payload = toPayload(input);
  const eventStartsAt = new Date(payload.startsAt);

  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "event"),
        sql`${submissions.payload}->>'name' = ${payload.name}`,
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const [row] = await db
      .update(submissions)
      .set({
        payload,
        eventStartsAt,
        status: "approved",
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, existing[0].id))
      .returning({ publicId: submissions.publicId });
    return { action: "updated" as const, publicId: row.publicId };
  }

  const [row] = await db
    .insert(submissions)
    .values({
      type: "event",
      status: "approved",
      payload,
      eventStartsAt,
      publishedAt: new Date(),
    })
    .returning({ publicId: submissions.publicId });
  return { action: "inserted" as const, publicId: row.publicId };
}

async function main() {
  let inserted = 0;
  let updated = 0;
  for (const input of inputs) {
    const r = await upsertHackathon(input);
    if (r.action === "inserted") inserted++;
    else updated++;
    console.log(`  ${r.action.padEnd(8)} /events/${r.publicId}  ${input.name}`);
  }
  console.log(
    `\n✓ ${inputs.length} hackathons processed (${inserted} new, ${updated} updated).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
