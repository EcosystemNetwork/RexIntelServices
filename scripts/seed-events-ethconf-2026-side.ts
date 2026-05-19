/**
 * Run with: npx tsx scripts/seed-events-ethconf-2026-side.ts
 *
 * Seeds ETHConf 2026 side events (Jun 7–12, NYC). Direct competitive surface
 * vs CryptoNomads — see memory project_beat_cryptonomads_plan. These events
 * concatenate with the NYC Tech Week seed (Jun 1–7) so RexIntel becomes the
 * single continuous NYC June 2026 index covering BOTH AI (NYC TW) and crypto
 * (ETHConf side events). Neither CryptoNomads (crypto-only) nor a16z's Tech
 * Week host (AI-only) covers both — that's the moat positioning.
 *
 * Sources: CryptoNomads ETHConf side-events index
 * (https://cryptonomads.org/ETHConfSideEvents2026) + direct lu.ma RSVP
 * pages. Every entry below has a verified host + RSVP URL.
 *
 * Curation: all listings carry real organizer brands (Curve, Morpho, Protocol
 * Labs, Consensys, Microsoft, Chainlink, Quantstamp, StakingRewards). Skipped
 * one anonymous-organizer happy hour. ETHGlobal NY (Jun 12) is already seeded
 * by scripts/seed-events-ethglobal.ts and is intentionally not duplicated here.
 *
 * Idempotent: matched by payload->>'name'.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { EventPayload } from "../src/lib/db/schema";

type SeedInput = {
  name: string;
  startsAt: string;
  endsAt?: string;
  url: string;
  description: string;
  tags?: string[];
  priceTier?: "free" | "paid" | "invite";
  eventType?: EventPayload["eventType"];
  venue?: string;
};

const NYC = { city: "New York", country: "United States" };

const inputs: SeedInput[] = [
  // Jun 3 — bridges NYC Tech Week + ETHConf week
  {
    name: "Agentic Finance Summit",
    startsAt: "2026-06-03T13:00:00Z",
    endsAt: "2026-06-03T22:00:00Z",
    url: "https://agenticfinance.xyz/",
    description:
      "One-day conference for teams building AI-driven payment systems — the bridge event between NYC Tech Week and ETHConf week. Founders, payments infra, and stablecoin/agent teams. Hosted by Microsoft and Party Action People.",
    tags: ["ethconf-side", "ai", "payments", "agents", "microsoft", "stablecoins"],
    priceTier: "paid",
    eventType: "conference",
  },
  // Jun 4
  {
    name: "Stable Summit IV: NYC",
    startsAt: "2026-06-04T13:00:00Z",
    endsAt: "2026-06-04T22:00:00Z",
    url: "https://www.stablesummit.xyz/",
    description:
      "World's leading stablecoin + programmable money conference, hosted by Curve Finance + Party Action People. NYC edition lands at the institutional center of global finance. One-day, free.",
    tags: ["ethconf-side", "stablecoins", "curve", "defi", "programmable-money"],
    priceTier: "free",
    eventType: "conference",
  },
  // Jun 5
  {
    name: "Vault Summit: NYC",
    startsAt: "2026-06-05T13:00:00Z",
    endsAt: "2026-06-05T22:00:00Z",
    url: "https://vaultsummit.xyz/",
    description:
      "Morpho Labs + Party Action People host the only NYC Tech Week conference focused on the on-chain capital allocation layer. Institutional vault ecosystem — allocators, curators, infra teams.",
    tags: ["ethconf-side", "morpho", "vaults", "defi", "institutional", "allocation"],
    priceTier: "paid",
    eventType: "conference",
  },
  // Jun 7–11 — Protocol Labs week-long hub
  {
    name: "Protocol Labs Network Hub — New York",
    startsAt: "2026-06-07T13:00:00Z",
    endsAt: "2026-06-11T22:00:00Z",
    url: "https://lu.ma/protocol-4ae0",
    description:
      "Week-long Protocol Labs network hub running alongside NYC Tech Week and ETHConf. Meeting space + collaboration room for the PL ecosystem (Filecoin, IPFS, libp2p, ZK teams). RSVP required.",
    tags: ["ethconf-side", "protocol-labs", "filecoin", "ipfs", "network-hub"],
    priceTier: "invite",
    eventType: "meetup",
  },
  // Jun 8
  {
    name: "MetaMask Builder Nights NY × Fhenix × Mercuryo",
    startsAt: "2026-06-08T21:00:00Z",
    endsAt: "2026-06-09T02:00:00Z",
    url: "https://lu.ma/bnny",
    description:
      "MetaMask Builder Nights returns full-festival as 'Agentic Wild West'. Co-hosted with Fhenix and Mercuryo. Not a side event — the team frames it as THE builder night of ETHConf week. RSVP-gated.",
    tags: ["ethconf-side", "metamask", "consensys", "fhenix", "mercuryo", "builders", "agentic"],
    priceTier: "free",
    eventType: "meetup",
  },
  // Jun 9
  {
    name: "Canton Café — Privacy-Enabled Asset Operations",
    startsAt: "2026-06-09T12:30:00Z",
    endsAt: "2026-06-09T15:30:00Z",
    url: "https://lu.ma/h5rq751l",
    description:
      "Private coffee reception at Greywind (10th Ave) for operators + institutions on Canton Network. Curated room for privacy-enabled digital asset ops. RSVP + business email required.",
    tags: ["ethconf-side", "canton", "consensys", "privacy", "institutional"],
    priceTier: "invite",
    eventType: "meetup",
    venue: "Greywind, 10th Avenue",
  },
  {
    name: "Rooftop Mixer with Quantstamp × Common Defense — ETHConf 2026",
    startsAt: "2026-06-09T23:00:00Z",
    endsAt: "2026-06-10T02:00:00Z",
    url: "https://lu.ma/sohhvo10",
    description:
      "Quantstamp + Common Defense rooftop mixer in Chelsea, walking distance from Javits Center. Security-focused operator network — directly adjacent to the audit / address-graph / incident-response surface RexIntel covers.",
    tags: ["ethconf-side", "quantstamp", "security", "audit", "happy-hour"],
    priceTier: "free",
    eventType: "meetup",
  },
  // Jun 11
  {
    name: "Digital Asset Yield Summit New York",
    startsAt: "2026-06-11T13:00:00Z",
    endsAt: "2026-06-11T22:00:00Z",
    url: "https://lu.ma/digital-asset-yield-summit-new-york",
    description:
      "Staking Rewards + KKP host an institutional yield summit during ETHConf week. Capital allocators evaluating on-chain yield — portfolio performance, risk, revenue streams. Institutional-grade attendee bar.",
    tags: ["ethconf-side", "staking-rewards", "yield", "institutional", "allocators"],
    priceTier: "paid",
    eventType: "conference",
  },
  {
    name: "Chainlink Link Learning Lab: Builders & Bankers",
    startsAt: "2026-06-11T14:00:00Z",
    endsAt: "2026-06-11T21:30:00Z",
    url: "https://lu.ma/LinkLearningLab",
    description:
      "Chainlink-hosted workshop on stablecoin + tokenized-asset adoption across U.S. and global financial systems. Format favors operators bridging tradfi and on-chain rails.",
    tags: ["ethconf-side", "chainlink", "stablecoins", "tokenization", "tradfi", "workshop"],
    priceTier: "free",
    eventType: "workshop",
  },
  {
    name: "Hyperliquid Forum NYC",
    startsAt: "2026-06-11T18:00:00Z",
    endsAt: "2026-06-11T23:00:00Z",
    url: "https://lu.ma/hyperliquid-forum-ny",
    description:
      "4th edition of the Hyperliquid Forum, NYC edition — co-located with the Digital Asset Yield Summit. Hyperliquid operator + builder community. Hosted by Staking Rewards.",
    tags: ["ethconf-side", "hyperliquid", "staking-rewards", "forum", "perps"],
    priceTier: "free",
    eventType: "meetup",
  },
];

function toPayload(input: SeedInput): EventPayload {
  return {
    name: input.name,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    venue: input.venue,
    city: NYC.city,
    country: NYC.country,
    url: input.url,
    description: input.description,
    tags: input.tags,
    priceTier: input.priceTier ?? "free",
    eventType: input.eventType ?? "meetup",
  };
}

async function upsertEvent(input: SeedInput) {
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
    const r = await upsertEvent(input);
    if (r.action === "inserted") inserted++;
    else updated++;
    console.log(`  ${r.action.padEnd(8)} /events/${r.publicId}  ${input.name}`);
  }
  console.log(
    `\n✓ ${inputs.length} ETHConf 2026 side events processed (${inserted} new, ${updated} updated).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
