/**
 * Run with: npx tsx scripts/seed-intel-casper-addresses.ts
 *
 * Seeds the Casper Hackathon 2026 exposé wallets into the address graph
 * and links them to the anchor incident submission. Every address below
 * is sourced from on-chain forensics in `scripts/.casper-forensics-output/`
 * and cross-referenced against cspr.cloud.
 *
 * The point of this seed is the moat: every wallet RexIntel identifies in
 * an investigation must land in the address graph so the next investigator
 * looking up a Casper account on /intel/address/casper/{address} sees the
 * incident context and the on-chain role. Industry attribution dashboards
 * (Chainalysis, TRM, Elliptic) do not currently index this cluster.
 *
 * Idempotent: addresses dedupe on (chain, lower(address)); intel_addresses
 * dedupe on the (submission_id, address_id) primary key.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { addresses, db, intelAddresses, submissions } from "../src/lib/db";

const HEADLINE =
  "Casper Hackathon 2026: Halborn, NodeOps, ChainGPT, NOWNodes vouched for the marketing. The voter pool was 96% bot-fed.";

type AddrEntry = {
  address: string;
  label: string;
  role: "subject" | "counterparty" | "observed";
  notes: string;
  category?:
    | "exchange"
    | "defi-protocol"
    | "treasury"
    | "foundation"
    | "bridge"
    | "mixer"
    | "sanctioned"
    | "government-seized"
    | "lost"
    | "dormant"
    | "hack-source"
    | "hack-destination"
    | "validator"
    | "personality"
    | "market-maker"
    | "mev-bot"
    | "scam";
  ownerName?: string;
};

// Every entry below is "chain: casper" — added to SUPPORTED_CHAINS in
// src/lib/chains.ts alongside this seed; cspr.live explorer mapping in
// explorerUrl() resolves /intel/address/casper/{address} -> deep links.
const entries: AddrEntry[] = [
  // === The Casper Association operational wallet — owner of FANR2, funder of 34 voters + 4/7 winning shells ===
  {
    address: "0bc9335b32b92985dd765680d3e058cf060efc1fba295f1b6342f58ea04f5d65",
    label: "Casper Association operational wallet — FANR2 contract owner",
    role: "subject",
    category: "foundation",
    ownerName: "Casper Association (operational wallet)",
    notes:
      "Deployed and owns the FANR2 voting contract (cbf251843…). Directly funded 34 voter wallets with 535 CSPR during the hackathon, plus seeded 4 of 7 top-vote-receiving project shells with 2.5 CSPR each (9842d06f, 4d47ac81, 066662e9, ce509235 — three of those four created in a six-second window on 2026-01-07). Single-key control (deployment_threshold=1, key_management_threshold=1). Pubkey 020322ea4248fb7a557dff9e18f3cfd3ccafb2e77cf89a50f01070f33d5618cb4586. Source: cspr.cloud /contract-packages and /accounts endpoints; full forensic trace in RexIntel exposé.",
  },

  // === Apex bot-funder #1 — CasperLink's documented owner wallet ===
  // Smoking Gun 1 of the exposé: the 3rd-place winner's own README names
  // this wallet as its owner, and on-chain it's the largest single bot
  // funder (106 of 751 voters).
  {
    address: "74ab92cebdb16189b8a1d3ed5a87d6fff8df694e9ede46393b5e11bb441be597",
    label: "Apex bot-funder #1 / CasperLink documented owner wallet",
    role: "subject",
    category: "scam",
    ownerName: "Operator behind GitHub SohamJuneja/CasperLink (announced 3rd-place winner, $3,000)",
    notes:
      "Self-documented in SohamJuneja/CasperLink/phase1.md as 'Account Hash (Owner)' for the announced 3rd-place winning project. On-chain: funded 106 voters in the FANR2 contract (largest single bot-funder cluster, 14% of the 751-wallet voter pool). First funded 2026-01-15 22:07 UTC (11h after R2 contract deployment). 212 lifetime deploys, 209 transfers, ~345 CSPR balance. Pubkey 02031ed02f6abebdec47e03f18bc1ee37fcae4d999e82a4f49512c8d25489dfd5302. Source: GitHub repo + cspr.cloud /accounts.",
  },

  // === Apex bot-funder #2 — 88 voters + the fastest fund→vote cluster ===
  {
    address: "41e4339ebc8a4f2941be99cc64fabb028be6fca8dd071ba7fbebfec13533fb37",
    label: "Apex bot-funder #2 — 61% of project 066662e9…'s votes",
    role: "subject",
    category: "scam",
    ownerName: "Unattributed (operator-controlled cluster)",
    notes:
      "Funded 88 voters in the FANR2 contract. 10 of the top-15 fastest fund→vote voters (24–60 seconds latency) were downstream of this wallet — the tightest scripted operator in the dataset. 61.6% of project 066662e9…'s 198 votes came from this cluster. Source: scripts/.casper-forensics-output/funding_summary.json.",
  },

  // === Other top-tier bot-funders ===
  {
    address: "34a4df50b943e5dfc95598e797e2f4184cfadfad06eddf8a99a6809883b00adf",
    label: "Top bot-funder — 34 voters",
    role: "subject",
    category: "scam",
    notes:
      "Funded 34 voters in the FANR2 contract. One of the top-7 funders responsible for half the voter pool. Source: scripts/.casper-forensics-output/funding_summary.json.",
  },
  {
    address: "eb747cd191aa5d8403606d05094153f2ad282c949987e3c4740143658bdc7af4",
    label: "Top bot-funder — 27 voters",
    role: "subject",
    category: "scam",
    notes:
      "Funded 27 voters in the FANR2 contract. Top-tier operator wallet in the 15-wallet apex set responsible for 96% of the voter pool. Source: scripts/.casper-forensics-output/funding_summary.json.",
  },

  // === Announced 1st-place winner CasPay's project shell ===
  {
    address: "9842d06f78b91aee7acaa22de7776f9d266eddc83c0e5e457f1ca89b69526e19",
    label: "CasPay project shell (announced 1st-place winner, $10,000)",
    role: "counterparty",
    category: "scam",
    ownerName: "CasPay (GitHub repo dmrdvn/caspay, deleted post-event)",
    notes:
      "Project shell wallet for CasPay, announced 1st-place winner. 351 votes received (highest in contest). 59.5% (209) of those votes came from voters whose first incoming CSPR transfer was from the same single wallet (496d5425…) — concentration ratio incompatible with random CEX-withdrawal distribution. Project shell was seeded by the Casper Association operational wallet (0bc9335b…). 1-2 lifetime deploys, zero outgoing transfers post-2026-02-05. Source GitHub repo deleted; no Wayback snapshot.",
  },

  // === Other Casper-Association-seeded winning shells (six-second batch) ===
  {
    address: "4d47ac81c1fc35da83b0e25050a274a0959ad0b2aaaafc7b76b9754d62c29d94",
    label: "Top-7 winning project shell — Association-seeded in 6-second batch",
    role: "counterparty",
    category: "scam",
    notes:
      "Project shell seeded by Casper Association wallet (0bc9335b…) with 2.5 CSPR. One of three shells created within a six-second window on 2026-01-07 between 14:05:31 and 14:05:37 UTC — scripted batch-spawn signature, not three independent teams.",
  },
  {
    address: "066662e98a983575300cdda045703e2820fdfc57d38db93f70a2376eaf51a145",
    label: "4th-ranked project shell — Association-seeded, 61% bot-funded",
    role: "counterparty",
    category: "scam",
    notes:
      "Project shell seeded by Casper Association wallet (0bc9335b…) with 2.5 CSPR. Received 198 FANR2 votes (4th-highest in contest). 61.6% (122) came from voters downstream of apex bot-funder #2 (41e4339e…). Same six-second batch as 4d47ac81… and ce509235….",
  },
  {
    address: "ce509235f716849447e7d96b38fcad23f960ba1db758097fe97cbb60de8de1d5",
    label: "Top-7 winning project shell — Association-seeded in 6-second batch",
    role: "counterparty",
    category: "scam",
    notes:
      "Project shell seeded by Casper Association wallet (0bc9335b…) with 2.5 CSPR. Third of the three shells created within the 14:05:31–14:05:37 UTC six-second window on 2026-01-07. Scripted batch-spawn signature.",
  },

  // === 3rd-ranked project shell (CasperLink-cluster funded) ===
  {
    address: "28f5f1a233c4f89003f2591951c73cd4ad65b193956363e925dc58e672596147",
    label: "3rd-ranked project shell — 56% of votes from CasperLink-cluster",
    role: "counterparty",
    category: "scam",
    notes:
      "Project shell received 281 FANR2 votes (3rd-highest). 55.9% (157) came from voters whose first incoming CSPR transfer was from 74ab92ce… — the same wallet CasperLink documents as its project owner. Voter pool and winning team are not separate populations.",
  },

  // === 5th and 6th-ranked project shells — seeded together by 65a1bb91… ===
  {
    address: "24df63caa67494af6d5b12c3c4c585a2c0c7fe71a192a35e790a8c7ca070bbd9",
    label: "5th-ranked project shell — co-seeded 67s apart with 6b3559aa",
    role: "counterparty",
    category: "scam",
    notes:
      "Project shell received 160 FANR2 votes (5th-highest in contest). First incoming CSPR transfer was from 65a1bb91… at 2025-12-23T09:25:05Z — same operator funded sibling shell 6b3559aa… 67 seconds earlier. Two competing entries from one operator without disclosure.",
  },
  {
    address: "6b3559aa4ff23b6811d0aff2709ae1b01dd9e9ddd072b99554350fa0546802e6",
    label: "6th-ranked project shell — co-seeded 67s apart with 24df63ca",
    role: "counterparty",
    category: "scam",
    notes:
      "Project shell received 132 FANR2 votes (6th-highest in contest). First incoming CSPR transfer was from 65a1bb91… at 2025-12-23T09:23:58Z — 67 seconds before sibling shell 24df63ca… got funded by the same wallet. Operator-controlled multi-entry strategy.",
  },

  // === Edge-case observed wallets ===
  {
    address: "65a1bb912303cdaa01a7b07c9ad5bef91dbf45d6cd9d9f3dc69eecd3a8aebcca",
    label: "One operator, two top-7 project shells (67 seconds apart)",
    role: "observed",
    notes:
      "Funded the first incoming transfer to two different Casper Hackathon 2026 Final Round project shells 67 seconds apart on 2025-12-23: 24df63ca… (5th-highest votes) at 09:25:05 UTC and 6b3559aa… (6th-highest) at 09:23:58 UTC. 2.5 CSPR each. 2023-era community wallet (135 lifetime deploys, currently 8.2 CSPR). Two competing entries from one operator without disclosure on either side.",
  },
  {
    address: "496d542527e1a29f576ab7c3f4c947bfcdc9b4145f75f6ec40e36089432d7351",
    label: "Ambiguous high-balance funder — 71 CasPay voters",
    role: "observed",
    notes:
      "5-year-old wallet with 91.4M CSPR balance (~$91M class). 71 voters whose first CSPR transfer came from this wallet collectively cast 209 votes for project 9842d06f… (CasPay, announced 1st-place winner) — 59.5% of CasPay's total. Profile consistent with EITHER a centralized exchange hot wallet OR a sophisticated coordinated funder. Concentration ratio (100% of 71 voters converging on one project) is incompatible with random CEX-withdrawal distribution.",
  },
  {
    address: "017d96b9a63abcb61c870a4f55187a0a7ac24096bdb5fc585c12a686a4d892009e",
    label: "5,036-CSPR wallet hardcoded in three different finalist repos",
    role: "observed",
    notes:
      "Same Casper account-hash appears hardcoded in the source of three different Final Round entries: le-stagiaire-ag2r/Casper-projet, SAHU-01/CasperStake, IHB1-Foundation/magni-cspr. 5,036 CSPR balance — not a placeholder, not a faucet dispersal pattern. Three plausible explanations: shared deployment infrastructure undisclosed by all three teams; a hackathon-mentor deploy bot; or operator-cluster coordination across nominally-independent teams.",
  },
];

async function main() {
  // Locate the anchor intel submission by headline match.
  const intel = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(eq(sql`${submissions.payload}->>'headline'`, HEADLINE))
    .limit(1);

  if (!intel.length) {
    console.error(
      "Casper exposé intel row not found. Run seed-intel-casper-hackathon-expose.ts first."
    );
    process.exit(1);
  }
  const intelId = intel[0].id;
  console.log(`Linking ${entries.length} addresses to intel ${intel[0].publicId}\n`);

  let upserted = 0;
  let linked = 0;
  for (const e of entries) {
    const existing = await db
      .select({ id: addresses.id })
      .from(addresses)
      .where(
        and(
          eq(addresses.chain, "casper"),
          eq(sql`lower(${addresses.address})`, e.address.toLowerCase())
        )
      )
      .limit(1);

    let addressId: string;
    if (existing.length) {
      addressId = existing[0].id;
      await db
        .update(addresses)
        .set({
          label: e.label,
          notes: e.notes,
          ...(e.category ? { category: e.category } : {}),
          ...(e.ownerName ? { ownerName: e.ownerName } : {}),
        })
        .where(eq(addresses.id, addressId));
    } else {
      const [row] = await db
        .insert(addresses)
        .values({
          chain: "casper",
          address: e.address,
          label: e.label,
          notes: e.notes,
          ...(e.category ? { category: e.category } : {}),
          ...(e.ownerName ? { ownerName: e.ownerName } : {}),
        })
        .returning({ id: addresses.id });
      addressId = row.id;
    }
    upserted += 1;

    // Link to the exposé. (submission_id, address_id) is the PK so a
    // duplicate insert will throw — catch and treat as already-linked.
    try {
      await db.insert(intelAddresses).values({
        submissionId: intelId,
        addressId,
        role: e.role,
      });
      linked += 1;
    } catch {
      // Already linked — re-affirm the role in case it shifted.
      await db
        .update(intelAddresses)
        .set({ role: e.role })
        .where(
          and(
            eq(intelAddresses.submissionId, intelId),
            eq(intelAddresses.addressId, addressId)
          )
        );
    }
  }

  console.log(`Upserted: ${upserted}`);
  console.log(`Linked to intel: ${linked} (rest were already linked)`);
  console.log(`\nGraph surfaces:`);
  console.log(`  /intel/${intel[0].publicId} (exposé)`);
  console.log(`  /graph (full attribution graph)`);
  for (const e of entries.slice(0, 5)) {
    console.log(`  /intel/address/casper/${e.address}`);
  }
  console.log(`  …and ${entries.length - 5} more.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
