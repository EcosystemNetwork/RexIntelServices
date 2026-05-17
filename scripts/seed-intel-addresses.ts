/**
 * Run with: npx tsx scripts/seed-intel-addresses.ts
 *
 * Seeds the address graph for the incident intel rows. For each (incident,
 * address) pair below, the script:
 *   1. Upserts the address into `addresses` (chain + lower(address) unique).
 *   2. Links the address to the matching submission via `intel_addresses`
 *      with the recorded role (subject = the attacker, counterparty =
 *      laundering destination, observed = secondary actor).
 *
 * Address sourcing rule: every address below has a primary-source
 * citation on its `notes` line. We do not seed addresses we can't verify.
 * Lazarus / OFAC-attributed clusters are tagged so the future investigation
 * product can query them by label.
 *
 * Idempotent: addresses dedupe on (chain, lower(address)); intel_addresses
 * dedupe on the (submission_id, address_id) primary key.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { addresses, db, intelAddresses, submissions } from "../src/lib/db";

type AddrEntry = {
  // Headline of the incident submission this address is linked to.
  headline: string;
  chain: string; // lowercased — "ethereum", "bitcoin", "solana", etc.
  address: string; // canonical casing (preserved verbatim)
  label: string;
  role: "subject" | "counterparty" | "observed";
  notes: string; // source citation
};

const entries: AddrEntry[] = [
  // === Ronin Bridge — OFAC SDN listed, Lazarus-attributed ===
  {
    headline: "Ronin Bridge $625M hack — Mar 2022 — Lazarus & the 5/9 validator failure",
    chain: "ethereum",
    address: "0x098B716B8Aaf21512996dC57EB0615e2383E2f96",
    label: "Ronin Bridge Exploiter (Lazarus Group)",
    role: "subject",
    notes: "OFAC SDN list, added 2022-04-14. Treasury identified owner as Lazarus Group. Source: cyberscoop.com/ronin-bridge-hack-lazarus-group-north-korea-treasury-sanctions/",
  },

  // === Wormhole — Etherscan-tagged attacker wallet ===
  {
    headline: "Wormhole $325M hack — Feb 2022 — Solana signature verification bypass",
    chain: "ethereum",
    address: "0x629e7Da20197a5429d30da36E77d06CdF796b71A",
    label: "Wormhole Network Exploiter",
    role: "subject",
    notes: "Etherscan-tagged 'Wormhole Network Exploiter'. Identities unknown. Jump Crypto retrieved ~$140M via counter-exploit. Source: etherscan.io/address/0x629e7da20197a5429d30da36e77d06cdf796b71a",
  },

  // === Euler Finance — attacker returned all recoverable funds ===
  {
    headline: "Euler Finance $197M hack — Mar 2023 — donateToReserves and the full recovery",
    chain: "ethereum",
    address: "0xb2698c2d99aD2C302A95a8DB26B08D17a77cEdd4",
    label: "Euler Finance Exploiter 1 ('Jacob' — funds returned)",
    role: "subject",
    notes: "Etherscan-tagged 'Euler Finance Exploiter 1'. Attacker returned 84,951 ETH and $29.9M DAI between 25-28 Mar 2023. Source: etherscan.io/address/0xb2698c2d99ad2c302a95a8db26b08d17a77cedd4",
  },

  // === Poloniex — Lazarus-attributed BlueNoroff cluster ===
  {
    headline: "Poloniex $126M hack — Nov 2023 — hot-wallet drain attributed to Lazarus",
    chain: "ethereum",
    address: "0x0A5984f86200415894821bFEFc1c1De036DbF9e7",
    label: "Poloniex Hacker 1 (Lazarus / BlueNoroff)",
    role: "subject",
    notes: "Etherscan-tagged 'Poloniex Hacker 1'. ~357 transactions, ~$114M in tokens drained from this address. Attributed to Lazarus BlueNoroff sub-cluster by SlowMist / Elliptic. Source: etherscan.io/address/0x0a5984f86200415894821bfefc1c1de036dbf9e7",
  },

  // === WazirX — Lazarus-attributed multisig drain ===
  {
    headline: "WazirX $230M hack — Jul 2024 — Liminal multisig and the upgraded contract",
    chain: "ethereum",
    address: "0x04b21735E93Fa3f8df70e2Da89e6922616891a88",
    label: "WazirX Exploiter (primary theft address)",
    role: "subject",
    notes: "Primary theft address per Protos and Cobo Security forensic reports. Drain of the upgraded malicious Safe multisig implementation. Attributed to Lazarus Group.",
  },

  // === Bybit — TRM-tracked primary exploiter address, FBI-attributed Lazarus ===
  {
    headline: "Bybit $1.5B hack — Feb 2025 — timeline & laundering trail",
    chain: "ethereum",
    address: "0x47666Fab8bd0Ac7003bce3f5C3585383F09486E2",
    label: "Bybit Exploiter 1 (Lazarus Group)",
    role: "subject",
    notes: "Etherscan-tagged 'Bybit Exploiter 1'. ~401,000 ETH received in the initial drain. FBI publicly attributed to Lazarus 2025-02-26; TRM confirmed with overlap to prior Lazarus thefts. Source: etherscan.io/address/0x47666fab8bd0ac7003bce3f5c3585383f09486e2",
  },

  // === Tornado Cash — historical laundering counterparty for many incidents ===
  // Sanctioned Aug 2022, delisted Mar 2025 (Fifth Circuit ruling). Still a
  // historical counterparty in nearly every 2022-2024 Lazarus laundering chain.
  {
    headline: "Ronin Bridge $625M hack — Mar 2022 — Lazarus & the 5/9 validator failure",
    chain: "ethereum",
    address: "0x8589427373D6D84E98730D7795D8f6f8731FDA16",
    label: "Tornado Cash router (former OFAC SDN, 2022-2025)",
    role: "counterparty",
    notes: "One of the 53 Ethereum addresses originally OFAC-sanctioned 2022-08-08 as part of the Tornado Cash designation. Sanctions lifted 2025-03-21 after Fifth Circuit ruling. Primary laundering route for Ronin attacker.",
  },
];

async function upsertAddress(entry: AddrEntry): Promise<string | null> {
  const chain = entry.chain.toLowerCase().trim();

  const [existing] = await db
    .select({ id: addresses.id, label: addresses.label, notes: addresses.notes })
    .from(addresses)
    .where(
      and(
        eq(addresses.chain, chain),
        sql`lower(${addresses.address}) = lower(${entry.address})`,
      ),
    )
    .limit(1);

  if (existing) {
    // Refresh label/notes if they've improved.
    if (existing.label !== entry.label || existing.notes !== entry.notes) {
      await db
        .update(addresses)
        .set({ label: entry.label, notes: entry.notes, updatedAt: new Date() })
        .where(eq(addresses.id, existing.id));
    }
    return existing.id;
  }

  const [inserted] = await db
    .insert(addresses)
    .values({ chain, address: entry.address, label: entry.label, notes: entry.notes })
    .onConflictDoNothing()
    .returning({ id: addresses.id });
  if (inserted) return inserted.id;

  // Race fallback — re-read.
  const [race] = await db
    .select({ id: addresses.id })
    .from(addresses)
    .where(
      and(
        eq(addresses.chain, chain),
        sql`lower(${addresses.address}) = lower(${entry.address})`,
      ),
    )
    .limit(1);
  return race?.id ?? null;
}

async function findSubmission(headline: string): Promise<string | null> {
  const [row] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "intel"),
        sql`${submissions.payload}->>'headline' = ${headline}`,
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

async function main() {
  let linked = 0;
  let skipped = 0;
  for (const entry of entries) {
    const submissionId = await findSubmission(entry.headline);
    if (!submissionId) {
      console.warn(`  SKIP — no submission found: "${entry.headline}"`);
      skipped++;
      continue;
    }

    const addressId = await upsertAddress(entry);
    if (!addressId) {
      console.warn(`  SKIP — address upsert failed: ${entry.address}`);
      skipped++;
      continue;
    }

    await db
      .insert(intelAddresses)
      .values({ submissionId, addressId, role: entry.role })
      .onConflictDoNothing();

    linked++;
    console.log(
      `  linked   [${entry.role.padEnd(12)}] ${entry.chain}:${entry.address.slice(0, 10)}…  →  ${entry.headline.slice(0, 60)}`,
    );
  }

  console.log(
    `\n✓ ${entries.length} entries processed (${linked} linked, ${skipped} skipped).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
