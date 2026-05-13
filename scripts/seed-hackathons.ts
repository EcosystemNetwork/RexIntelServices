/**
 * Run with: npx tsx scripts/seed-hackathons.ts
 *
 * Seeds additional crypto hackathons that don't come from the ETHGlobal feed
 * (scripts/seed-events-ethglobal.ts already seeds the ETHGlobal series).
 * Pulled from DoraHacks, Devpost, lablab.ai, Encode Club, Akindo, Colosseum,
 * and the official organizer announcements — every entry below has a
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
    name: "Casper Hackathon 2026",
    startDate: "2025-11-14",
    endDate: "2026-01-04",
    city: "Online",
    url: "https://dorahacks.io/hackathon/casper-hackathon-2026/detail",
    description:
      "Casper Network's 2026 hackathon on DoraHacks. $25,000 USD prize pool to build dApps on the enterprise-grade PoS L1 — DeFi, NFTs, liquid staking, cross-chain.",
  },
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
