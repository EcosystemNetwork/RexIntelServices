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
  // Optional attribution fields. Populate when seeding institutional-tier
  // addresses (sanctioned wallets, government seizures, etc.) — they power
  // the category filter and the value-counter stat on /graph.
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
  // Last-snapshot USD value held at this address. Only populate when the
  // balance is meaningfully measurable (gov-seized, lost, OFAC-frozen);
  // skip for fluctuating hot wallets where any number would lie.
  balanceEstimateUsd?: number;
  // Native-token amount + uppercase symbol. Populated alongside
  // balanceEstimateUsd so the value counter can report "X BTC tracked"
  // separate from "$X.XB tracked." Use uppercase tickers ("BTC", "ETH").
  nativeAmount?: number;
  nativeSymbol?: string;
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
  // We link the four primary pool addresses + router to every incident with
  // a documented TC laundering trail. Because addresses dedupe on
  // (chain, lower(address)), reusing the same TC address across multiple
  // incidents turns it into a hub node that visibly clusters the attacks.
  {
    headline: "Ronin Bridge $625M hack — Mar 2022 — Lazarus & the 5/9 validator failure",
    chain: "ethereum",
    address: "0x8589427373D6D84E98730D7795D8f6f8731FDA16",
    label: "Tornado Cash router (former OFAC SDN, 2022-2025)",
    role: "counterparty",
    notes: "One of the 53 Ethereum addresses originally OFAC-sanctioned 2022-08-08 as part of the Tornado Cash designation. Sanctions lifted 2025-03-21 after Fifth Circuit ruling. Primary laundering route for Ronin attacker. Source: home.treasury.gov/news/press-releases/jy0916",
  },
  {
    headline: "Ronin Bridge $625M hack — Mar 2022 — Lazarus & the 5/9 validator failure",
    chain: "ethereum",
    address: "0xA160cdAB225685dA1d56aa342Ad8841c3b53f291",
    label: "Tornado Cash 100 ETH pool (former OFAC SDN, 2022-2025)",
    role: "counterparty",
    notes: "TC 100 ETH pool, OFAC SDN list 2022-08-08, delisted 2025-03-21. Elliptic traced large-tranche Ronin laundering through this pool. Source: home.treasury.gov/news/press-releases/jy0916 + elliptic.co/blog/540-million-stolen-from-the-ronin-defi-bridge",
  },
  {
    headline: "Ronin Bridge $625M hack — Mar 2022 — Lazarus & the 5/9 validator failure",
    chain: "ethereum",
    address: "0x910Cbd523D972eb0a6f4cAe4618aD62622b39DbF",
    label: "Tornado Cash 10 ETH pool (former OFAC SDN, 2022-2025)",
    role: "counterparty",
    notes: "TC 10 ETH pool, OFAC SDN list 2022-08-08, delisted 2025-03-21. Mid-tranche Ronin laundering route. Source: home.treasury.gov/news/press-releases/jy0916",
  },

  // === Harmony Horizon Bridge — Lazarus, follows the same TC laundering pattern as Ronin ===
  {
    headline: "Harmony Horizon $100M bridge hack — Jun 2022 — Lazarus, Tornado Cash trail",
    chain: "ethereum",
    address: "0x8589427373D6D84E98730D7795D8f6f8731FDA16",
    label: "Tornado Cash router (former OFAC SDN, 2022-2025)",
    role: "counterparty",
    notes: "Elliptic tied ~$96M of Horizon outflows to Tornado Cash, the same router cluster as Ronin. This shared counterparty is the strongest on-chain evidence linking Ronin and Horizon to the same Lazarus operator. Source: elliptic.co/blog/analysis/the-100-million-horizon-hack-following-the-trail-through-tornado-cash-to-north-korea",
  },
  {
    headline: "Harmony Horizon $100M bridge hack — Jun 2022 — Lazarus, Tornado Cash trail",
    chain: "ethereum",
    address: "0xA160cdAB225685dA1d56aa342Ad8841c3b53f291",
    label: "Tornado Cash 100 ETH pool (former OFAC SDN, 2022-2025)",
    role: "counterparty",
    notes: "TC 100 ETH pool used in Horizon laundering trail. Shared-counterparty with Ronin. Source: elliptic.co/blog/analysis/the-100-million-horizon-hack-following-the-trail-through-tornado-cash-to-north-korea",
  },
  {
    headline: "Harmony Horizon $100M bridge hack — Jun 2022 — Lazarus, Tornado Cash trail",
    chain: "ethereum",
    address: "0x910Cbd523D972eb0a6f4cAe4618aD62622b39DbF",
    label: "Tornado Cash 10 ETH pool (former OFAC SDN, 2022-2025)",
    role: "counterparty",
    notes: "TC 10 ETH pool used in Horizon laundering trail. Source: elliptic.co/blog/analysis/the-100-million-horizon-hack-following-the-trail-through-tornado-cash-to-north-korea",
  },

  // === Beanstalk Farms — TC was the standard 2022 exit for governance attackers too ===
  {
    headline: "Beanstalk Farms $182M hack — Apr 2022 — governance-via-flash-loan",
    chain: "ethereum",
    address: "0x1c5dCdd006EA78a7E4783f9e6021C32935a10fb4",
    label: "Beanstalk Flashloan Exploiter (BIP-18 proposer)",
    role: "subject",
    notes: "Etherscan-tagged 'Beanstalk Flashloan Exploiter'. The address that proposed BIP-18 (the malicious 'Ukraine donation' proposal) and executed the emergencyCommit drain. ~$80M net profit routed to Tornado Cash. Source: etherscan.io/address/0x1c5dcdd006ea78a7e4783f9e6021c32935a10fb4 + merklescience.com/blog/hack-track-analysis-of-beanstalk-flash-loan-attack",
  },
  {
    headline: "Beanstalk Farms $182M hack — Apr 2022 — governance-via-flash-loan",
    chain: "ethereum",
    address: "0x8589427373D6D84E98730D7795D8f6f8731FDA16",
    label: "Tornado Cash router (former OFAC SDN, 2022-2025)",
    role: "counterparty",
    notes: "Net attacker proceeds (~$80M) routed through Tornado Cash. Same cluster-hub address used by Ronin and Harmony Lazarus flows in the same window. Source: merklescience.com/blog/hack-track-analysis-of-beanstalk-flash-loan-attack",
  },

  // === BadgerDAO — front-end / Cloudflare API key compromise ===
  {
    headline: "BadgerDAO $120M hack — Dec 2021 — Cloudflare API key & front-end injection",
    chain: "ethereum",
    address: "0x1FCdB04D0c5364FBd92C73cA8AF9BAA72c269107",
    label: "BadgerDAO Exploiter (primary draining wallet)",
    role: "subject",
    notes: "Etherscan-tagged 'BadgerDAO Exploiter'. Primary recipient for the silent ERC-20 approval drain executed via the injected Cloudflare Worker. Source: etherscan.io/address/0x1fcdb04d0c5364fbd92c73ca8af9baa72c269107 + halborn.com/blog/post/explained-the-badgerdao-hack-december-2021",
  },

  // === Harmony Horizon — Etherscan-tagged exploiter cluster (H1 + downstream H2/H3) ===
  // Adding multiple exploiter addresses from one incident creates internal
  // co-occurrence edges, which is the graph signature of a single operator
  // running a tumbling chain across many wallets.
  {
    headline: "Harmony Horizon $100M bridge hack — Jun 2022 — Lazarus, Tornado Cash trail",
    chain: "ethereum",
    address: "0x0d043128146654C7683Fbf30ac98D7B2285DeD00",
    label: "Horizon Bridge Exploiter (H1 — Lazarus)",
    role: "subject",
    notes: "Etherscan-tagged 'Horizon Bridge Exploiter'. Primary recipient of the 2-of-5 multisig drain. Merkle Science traces H1 → H2/H3 conversion-to-ETH → H4-H7 dispersal. Source: etherscan.io/address/0x0d043128146654c7683fbf30ac98d7b2285ded00 + merklescience.com/blog/hack-track-analysis-of-harmonys-horizon-bridge-exploit",
  },
  {
    headline: "Harmony Horizon $100M bridge hack — Jun 2022 — Lazarus, Tornado Cash trail",
    chain: "ethereum",
    address: "0x9e91ae672E7f7330Fc6B9bAB9C259BD94Cd08715",
    label: "Horizon Bridge Exploiter 2 (Lazarus dispersal wallet)",
    role: "observed",
    notes: "Etherscan-tagged 'Horizon Bridge Exploiter 2'. Downstream conversion wallet in the Lazarus tumbling chain. Source: etherscan.io/address/0x9e91ae672e7f7330fc6b9bab9c259bd94cd08715",
  },
  {
    headline: "Harmony Horizon $100M bridge hack — Jun 2022 — Lazarus, Tornado Cash trail",
    chain: "ethereum",
    address: "0x58F4BAccB411AcEf70a5F6Dd174AF7854fC48Fa9",
    label: "Horizon Bridge Exploiter 3 (Lazarus dispersal wallet)",
    role: "observed",
    notes: "Etherscan-tagged 'Horizon Bridge Exploiter 3'. Source: etherscan.io/address/0x58f4baccb411acef70a5f6dd174af7854fc48fa9",
  },

  // === Nomad Bridge — the only mob attack on the leaderboard. Three of ~300 ===
  // wallets, the three that Etherscan named as the primary draining actors
  // before the copy-paste mob arrived. Internal cluster + permissionless tail.
  {
    headline: "Nomad Bridge $190M hack — Aug 2022 — the copy-paste mob attack",
    chain: "ethereum",
    address: "0x56D8B635A7C88Fd1104D23D632AF40c1C3aAC4e3",
    label: "Nomad Bridge Exploiter 1",
    role: "subject",
    notes: "Etherscan-tagged 'Nomad Bridge Exploiter 1'. Among the earliest drain addresses before the copy-paste mob arrived. Source: etherscan.io/address/0x56d8b635a7c88fd1104d23d632af40c1c3aac4e3",
  },
  {
    headline: "Nomad Bridge $190M hack — Aug 2022 — the copy-paste mob attack",
    chain: "ethereum",
    address: "0xBF293D5138a2a1BA407B43672643434C43827179",
    label: "Nomad Bridge Exploiter 2",
    role: "subject",
    notes: "Etherscan-tagged 'Nomad Bridge Exploiter 2'. Source: etherscan.io/address/0xbf293d5138a2a1ba407b43672643434c43827179",
  },
  {
    headline: "Nomad Bridge $190M hack — Aug 2022 — the copy-paste mob attack",
    chain: "ethereum",
    address: "0xB5c55F76f90Cc528B2609109Ca14d8d84593590E",
    label: "Nomad Bridge Exploiter 3",
    role: "subject",
    notes: "Etherscan-tagged 'Nomad Bridge Exploiter 3'. Source: etherscan.io/address/0xb5c55f76f90cc528b2609109ca14d8d84593590e",
  },

  // === BNB Bridge / BSC Token Hub — self-registered relayer forged the proof ===
  {
    headline: "BNB Bridge $570M hack — Oct 2022 — IAVL Merkle proof forgery",
    chain: "bsc",
    address: "0x489A8756C18C0b8B24EC2a2b9FF3D4d447F79BEc",
    label: "BNB Bridge Exploiter (BSC Token Hub)",
    role: "subject",
    notes: "Etherscan-tagged 'BNB Bridge Exploiter'. Self-registered BSC bridge relayer that submitted the forged IAVL proof for block 110217401 and minted 2M BNB. ~$137M moved out cross-chain (Stargate, Multichain) before Binance halted block production. Source: etherscan.io/address/0x489a8756c18c0b8b24ec2a2b9ff3d4d447f79bec + medium.com/immunefi/hack-analysis-binance-bridge-october-2022-2876d39247c1",
  },

  // === Munchables — DPRK IT-worker insider, returned funds, Blast L2 ===
  // Chain slug "other" because Blast isn't in SUPPORTED_CHAINS; address is the
  // standard EVM hex (Blast = Ethereum-equivalent). Label spells out Blast.
  {
    headline: "Munchables $62.5M hack — Mar 2024 — DPRK IT-worker insider, full recovery",
    chain: "other",
    address: "0x6e8836F050A315611208a5CD7e228701563D09c5",
    label: "Munchables Exploiter (Blast L2 — keys returned)",
    role: "subject",
    notes: "Etherscan-tagged 'Munchables Exploiter'. The contractor's wallet that received the assigned 1M ETH balance via the back-doored upgrade. ZachXBT identified all four 'developers' as the same DPRK-aligned operator. Private keys returned without ransom; full $60.5M recovered. Source: etherscan.io/address/0x6e8836f050a315611208a5cd7e228701563d09c5 + theblock.co/post/284883/web3-gaming-platform-munchables-loses-62-5-million-in-exploit-zachxbt",
  },

  // === Additional Tornado Cash pools (0.1 ETH, 1 ETH) — fill out the cluster ===
  // Linking the smaller pools to Ronin makes the cluster visualization show
  // why "Tornado Cash" reads as one logical entity even though it's five
  // distinct on-chain contracts.
  {
    headline: "Ronin Bridge $625M hack — Mar 2022 — Lazarus & the 5/9 validator failure",
    chain: "ethereum",
    address: "0x47CE0C6eD5B0Ce3d3A51fdb1C52DC66a7c3c2936",
    label: "Tornado Cash 1 ETH pool (former OFAC SDN, 2022-2025)",
    role: "counterparty",
    notes: "TC 1 ETH pool, OFAC SDN list 2022-08-08, delisted 2025-03-21. Small-tranche Ronin laundering. Source: home.treasury.gov/news/press-releases/jy0916",
  },
  {
    headline: "Ronin Bridge $625M hack — Mar 2022 — Lazarus & the 5/9 validator failure",
    chain: "ethereum",
    address: "0x12D66f87A04A9E220743712cE6d9bB1B5616B8Fc",
    label: "Tornado Cash 0.1 ETH pool (former OFAC SDN, 2022-2025)",
    role: "counterparty",
    notes: "TC 0.1 ETH pool, OFAC SDN list 2022-08-08, delisted 2025-03-21. Sub-tranche Ronin laundering. Source: home.treasury.gov/news/press-releases/jy0916",
  },

  // === CoinEx ↔ Stake.com cross-incident wallet — same address used in both ===
  // The cleanest cross-incident edge in the graph: this single wallet is
  // Etherscan-tagged 'CoinEx Exploiter' on Arbitrum/Optimism AND 'Stake
  // Exploiter' on Polygon. Linking it to both incidents creates the visible
  // cluster that proves the 'one Lazarus operator' attribution on-chain.
  // Stored once on "arbitrum" (where the CoinEx Exploiter tag was applied);
  // notes call out the Polygon Stake tag so investigators reading the node
  // see the cross-chain context.
  {
    headline: "CoinEx $54M hack — Sep 2023 — Lazarus and the address that linked Stake.com",
    chain: "arbitrum",
    address: "0x75497999432B8701330FB68058bd21918C02ac59",
    label: "CoinEx Exploiter (ARB/OP) — also Stake.com Exploiter (Polygon) [Lazarus]",
    role: "subject",
    notes: "Etherscan-tagged 'CoinEx Exploiter' on Arbiscan and Optimistic Etherscan. Same wallet tagged 'Stake Exploiter' on PolygonScan. Wallet-reuse opsec collision that confirmed one Lazarus operator behind both Sep-2023 incidents. Source: ZachXBT + cointelegraph.com/news/coinex-north-korea-s-lazarus-group-responsible-for-55-m-coin-ex-hack-report",
  },
  {
    headline: "Stake.com $41M hack — Sep 2023 — Lazarus, FBI attribution in 72 hours",
    chain: "arbitrum",
    address: "0x75497999432B8701330FB68058bd21918C02ac59",
    label: "CoinEx Exploiter (ARB/OP) — also Stake.com Exploiter (Polygon) [Lazarus]",
    role: "subject",
    notes: "Same Lazarus wallet documented above. On Polygon this wallet is Etherscan-tagged 'Stake Exploiter'. Cross-incident edge with CoinEx hack five days later. Source: trmlabs.com/resources/blog/fbi-confirms-that-north-korea-was-behind-41-million-stake-com-exploit",
  },
  {
    headline: "Stake.com $41M hack — Sep 2023 — Lazarus, FBI attribution in 72 hours",
    chain: "ethereum",
    address: "0x94F1b9B64e2932F6A2DB338F616844400Cd58E8a",
    label: "Stake.com Hacker 1 (Ethereum primary)",
    role: "subject",
    notes: "Etherscan-tagged 'Stake.com Hacker 1'. Ethereum-side primary drain wallet for the $41M theft. Source: etherscan.io/address/0x94f1b9b64e2932f6a2db338f616844400cd58e8a + fbi.gov/news/press-releases/fbi-identifies-lazarus-group-cyber-actors-as-responsible-for-theft-of-41-million-from-stakecom",
  },

  // === Heco Bridge + HTX — Justin Sun bridge private-key leak ===
  {
    headline: "Heco Bridge + HTX $99M hack — Nov 2023 — Justin Sun bridge private-key leak",
    chain: "ethereum",
    address: "0xfc146d1CAF6BA1d1ce6dcb5b35DCBF895f50B0C4",
    label: "Heco Bridge Exploiter (primary drain wallet)",
    role: "subject",
    notes: "Etherscan-tagged 'Heco Bridge Exploiter'. Received the bridge operator's withdrawToken() proceeds — ~42M USDT, 10k+ ETH, 489 HBTC, plus SHIB/UNI/USDC/LINK. Swapped ERC-20s for ETH immediately to defeat issuer blacklists. Source: etherscan.io/address/0xfc146d1caf6ba1d1ce6dcb5b35dcbf895f50b0c4 + hacken.io/insights/heco-bridge-hack-explained",
  },
  {
    headline: "Heco Bridge + HTX $99M hack — Nov 2023 — Justin Sun bridge private-key leak",
    chain: "ethereum",
    address: "0xe47e6dA16Bb83EB0FD26b3F29b15CE8Fab089B9e",
    label: "Heco Bridge Exploiter 2 (downstream dispersal — 23,574 ETH fan-out)",
    role: "observed",
    notes: "Etherscan-tagged 'Heco Bridge Exploiter 2'. Downstream wallet that fan-out distributed 23,574.342 ETH to four further wallets in the tumbling chain. Source: etherscan.io/address/0xe47e6da16bb83eb0fd26b3f29b15ce8fab089b9e",
  },

  // === Penpie — Pendle reentrancy, attacker laundered through Tornado Cash ===
  {
    headline: "Penpie $27M hack — Sep 2024 — Pendle reentrancy and the TC laundering chain",
    chain: "ethereum",
    address: "0x7A2f4D625FB21F5e51562cE8DC2E722E12a61D1B",
    label: "Penpiexyz Exploiter (primary — fake SY contract deployer)",
    role: "subject",
    notes: "Etherscan-tagged 'Penpiexyz Exploiter'. Deployed the malicious Standardized Yield contract that triggered reentrancy in PendleStakingBaseUpg::batchHarvestMarketRewards(). 11,113.6 ETH (~$27.3M) drained. Source: etherscan.io/address/0x7a2f4d625fb21f5e51562ce8dc2e722e12a61d1b + halborn.com/blog/post/explained-the-penpie-hack-september-2024",
  },
  {
    headline: "Penpie $27M hack — Sep 2024 — Pendle reentrancy and the TC laundering chain",
    chain: "ethereum",
    address: "0xc0EB7e6E2B94aA43BdD0c60E645fE915d5C6Eb84",
    label: "Penpiexyz Exploiter 2 (secondary)",
    role: "observed",
    notes: "Etherscan-tagged 'Penpiexyz Exploiter 2'. Secondary wallet in the attacker cluster. Source: etherscan.io/address/0xc0eb7e6e2b94aa43bdd0c60e645fe915d5c6eb84",
  },
  {
    headline: "Penpie $27M hack — Sep 2024 — Pendle reentrancy and the TC laundering chain",
    chain: "ethereum",
    address: "0x8589427373D6D84E98730D7795D8f6f8731FDA16",
    label: "Tornado Cash router (former OFAC SDN, 2022-2025)",
    role: "counterparty",
    notes: "Penpie attacker laundered the 11,113 ETH through Tornado Cash after declining Penpie's 20% white-hat bounty offer. Same hub address linked to Ronin / Harmony / Beanstalk — extends the TC cluster into 2024 post-delisting era. Source: blog.penpiexyz.io/penpie-post-mortem-report-1ac9863b663a",
  },

  // === Phemex ↔ Bybit cross-incident overlap wallet — ZachXBT's smoking gun ===
  // 0x33d057... received funds from BOTH the Phemex initial-theft address
  // AND the Bybit initial-theft address. Linking it to both incidents is the
  // single strongest cross-incident edge in the graph — direct on-chain
  // commingling between two of the largest 2025 exchange hacks.
  {
    headline: "Phemex $85M hack — Jan 2025 — Lazarus, and the on-chain link to Bybit",
    chain: "ethereum",
    address: "0x33d057AF74779925c4B2e720a820387cB89F8f65",
    label: "Lazarus consolidation wallet (Bybit + Phemex commingling)",
    role: "observed",
    notes: "ZachXBT (2025-02-22): 'Lazarus Group just connected the Bybit hack to the Phemex hack directly on-chain commingling funds from the initial theft address for both incidents. Overlap address: 0x33d057af74779925c4b2e720a820387cb89f8f65'. Source: x.com/zachxbt/status/1893211577836302365 + cointelegraph.com/news/lazarus-group-consolidates-bybit-phemex-hacker-wallet",
  },
  {
    headline: "Bybit $1.5B hack — Feb 2025 — timeline & laundering trail",
    chain: "ethereum",
    address: "0x33d057AF74779925c4B2e720a820387cB89F8f65",
    label: "Lazarus consolidation wallet (Bybit + Phemex commingling)",
    role: "observed",
    notes: "Same wallet documented above — Lazarus operator consolidation address shared with Phemex hack. Direct on-chain commingling between two separately-disclosed exchange hacks. Source: x.com/zachxbt/status/1893211577836302365",
  },

  // === Bitfinex 2016 hack — DOJ-seized government-custody address ===
  // Holds 94,643 BTC since Feb 2022. Largest single seizure currently in US
  // government custody. balance_estimate_usd populated against the snapshot
  // BTC price defined at the top of seed-lost-crypto.ts ($95k/BTC).
  {
    headline: "Bitfinex 2016 hack — 119,756 BTC stolen, $3.6B seized by DOJ in 2022",
    chain: "bitcoin",
    address: "bc1qazcm763858nkj2dj986etajv6wquslv8uxwczt",
    label: "DOJ government-custody address (94,643 BTC seized Feb 2022)",
    role: "subject",
    notes: "US DOJ consolidation address for the Feb 2022 Bitfinex-hack seizure. Holds the recovered 94,643 BTC pending restitution. Single-largest financial seizure in DOJ history at the time. Source: time.com/6146749/cryptocurrency-laundering-bitfinex-hack + chainalysis.com/blog/bitfinex-hack-seizure-arrest-2022",
    category: "government-seized",
    ownerName: "US Department of Justice",
    balanceEstimateUsd: 94_643 * 95_000, // ~$8.99B
    nativeAmount: 94_643,
    nativeSymbol: "BTC",
  },

  // === Twitter 2020 Bitcoin scam — PlugwalkJoe primary scam address ===
  {
    headline: "Twitter Bitcoin scam — Jul 2020 — 130 hijacked celebrity accounts, $120k take",
    chain: "bitcoin",
    address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    label: "Twitter scam primary address (PlugwalkJoe — 13.14 BTC, ~$120k)",
    role: "subject",
    notes: "Primary scam wallet posted from 130+ hijacked Twitter accounts (Obama, Biden, Musk, Gates, Apple, etc.) during the 2020-07-15 incident. Received 13.14 BTC over ~2 hours. PlugwalkJoe (Joseph James O'Connor) pleaded guilty May 2023. Source: chainalysis.com/blog/twitter-hack-july-2020-update + dfs.ny.gov/Twitter_Report",
  },

  // === Garantex sanctioned exchange — cross-chain hub (BTC + ETH + Tron) ===
  // The first three OFAC-listed Garantex addresses, attached to the Garantex
  // original-analysis piece. These addresses are also linked as counterparties
  // to the Atomic Wallet incident (Elliptic-documented Garantex laundering).
  // Critically: the Tron address gives us first-time Tron coverage on the
  // address graph and opens the door to USDT-on-Tron illicit-flow analysis.
  {
    headline: "Garantex — the Russian exchange that became Lazarus's off-ramp",
    chain: "bitcoin",
    address: "3Lpoy53K625zVeE47ZasiG5jGkAxJ27kh1",
    label: "Garantex BTC deposit (OFAC SDN since 2022-04-05)",
    role: "subject",
    notes: "Bitcoin address in Garantex's original 2022-04-05 OFAC designation (SDN ID 36025). Primary BTC deposit for the sanctioned exchange. Source: ofac.treasury.gov/recent-actions/20220405 + sanctionssearch.ofac.treas.gov/Details.aspx?id=36025",
  },
  {
    headline: "Garantex — the Russian exchange that became Lazarus's off-ramp",
    chain: "ethereum",
    address: "0x7FF9cFad3877F21d41Da833E2F775dB0569eE3D9",
    label: "Garantex ETH deposit (OFAC SDN since 2022-04-05)",
    role: "subject",
    notes: "Ethereum address in Garantex's original 2022-04-05 OFAC designation. Has received flows from multiple Lazarus-attributed exchange compromises as final off-ramp. Source: ofac.treasury.gov/recent-actions/20220405",
  },
  {
    headline: "Garantex — the Russian exchange that became Lazarus's off-ramp",
    chain: "tron",
    address: "TA1hsikRfsgGiW9nEBpT4tEXEySTNYLr2d",
    label: "Garantex Tron USDT deposit (OFAC SDN since 2022-04-05)",
    role: "subject",
    notes: "Tron address attributed to Garantex. USDT-on-Tron is the dominant 2024-2025 illicit-flow stablecoin rail and Garantex's TRX deposit is the conventional final off-ramp for Russia- and DPRK-connected operators. Source: ofac.treasury.gov/recent-actions/20220405 + chainalysis.com/blog/ofac-sanctions",
  },

  // === Garantex as laundering counterparty to Atomic Wallet ===
  // Elliptic documented Atomic-Wallet stolen funds being off-ramped through
  // Garantex. Linking Garantex ETH to Atomic Wallet creates a real
  // cross-incident edge: lost user funds → Russian sanctioned exchange.
  {
    headline: "Atomic Wallet $100M+ hack — Jun 2023 — Lazarus targeting self-custody",
    chain: "ethereum",
    address: "0x7FF9cFad3877F21d41Da833E2F775dB0569eE3D9",
    label: "Garantex ETH deposit (OFAC SDN since 2022-04-05)",
    role: "counterparty",
    notes: "Garantex received off-ramp flows from the Atomic Wallet drain per Elliptic's June 2023 analysis. Elliptic + partner exchanges froze ~$1M of the Garantex-routed proceeds. Source: elliptic.co/blog/analysis/north-korea-linked-atomic-wallet-heist-tops-100-million",
    category: "sanctioned",
    ownerName: "Garantex Europe OU (Russia)",
  },

  // === Wormhole — Solana-side attacker accounts (OPENS THE SOLANA LANE) ===
  // Two Solana base58 accounts the attacker used during the Feb 2022 mint
  // exploit, both linked to the existing Wormhole incident. First Solana
  // addresses in the address graph.
  {
    headline: "Wormhole $325M hack — Feb 2022 — Solana signature verification bypass",
    chain: "solana",
    address: "CxegPrfn2ge5dNiQberUrQJkHCcimeR4VXkeawcFBBka",
    label: "Wormhole Solana Attacker (primary account)",
    role: "subject",
    notes: "Primary Solana attacker account in the Feb 2022 Wormhole exploit. Approximately $140M of the proceeds were later recovered via a Solana validator governance action. Source: chainalysis.com/blog/wormhole-hack-february-2022 + halborn.com/blog/post/explained-the-wormhole-hack-february-2022",
    category: "hack-source",
  },
  {
    headline: "Wormhole $325M hack — Feb 2022 — Solana signature verification bypass",
    chain: "solana",
    address: "2SDN4vEJdCdW3pGyhx2km9gB3LeHzMGLrG2j4uVNZfrx",
    label: "Wormhole Solana Mint Account (120k wETH issuance)",
    role: "subject",
    notes: "The Solana account that executed the unauthorized mint of 120,000 wETH via the fake-sysvar signature-verification bypass. Source: certik.com/blog/wormhole-bridge-exploit-incident-analysis",
    category: "hack-source",
  },

  // === Sinbad Mixer — OFAC SDN Nov 2023 (Lazarus mixer successor to Blender) ===
  // Linked to the Sinbad original-analysis piece below.
  {
    headline: "Sinbad mixer — OFAC SDN Nov 2023 — the Lazarus mixer that replaced Blender",
    chain: "bitcoin",
    address: "bc1qq7p0es3dv5hcynjjf40f2xjjr6qp5py47d2f6n847vduuq9gvnyq7y9ecd",
    label: "Sinbad.io taproot address (OFAC SDN since 2023-11-29)",
    role: "subject",
    notes: "Sinbad's primary taproot Bitcoin address in the 2023-11-29 OFAC designation (Treasury press release JY1933). Sinbad processed millions of USD from Lazarus heists including Horizon Bridge and Axie/Ronin. Source: home.treasury.gov/news/press-releases/jy1933 + elliptic.co/blog/sinbad-crypto-mixer-flagged-by-elliptic-sanctioned-and-seized",
    category: "sanctioned",
    ownerName: "Sinbad.io (Lazarus-associated mixer)",
  },
  {
    headline: "Sinbad mixer — OFAC SDN Nov 2023 — the Lazarus mixer that replaced Blender",
    chain: "bitcoin",
    address: "1JHdQHkBZiim1cb4hyUh2PbzEbbg6z2TrF",
    label: "Sinbad.io legacy address (OFAC SDN since 2023-11-29)",
    role: "subject",
    notes: "Sinbad's legacy P2PKH Bitcoin address in the 2023-11-29 OFAC designation. Treasury attributes Sinbad as the successor to Blender (the previously-sanctioned mixer). Source: home.treasury.gov/news/press-releases/jy1933",
    category: "sanctioned",
    ownerName: "Sinbad.io (Lazarus-associated mixer)",
  },

  // === Sim Hyon Sop — DPRK Foreign Trade Bank rep (OFAC SDN Apr 2023) ===
  // Cross-network address (works on ETH, ARB, BSC per OFAC notice).
  // Adding both the ETH and ARB representations as separate graph rows since
  // our (chain, address) uniqueness treats them independently — this also
  // models the cross-chain reality: same private key, different chain UTXOs.
  {
    headline: "Sim Hyon Sop — DPRK Foreign Trade Bank crypto laundering — Apr 2023 OFAC",
    chain: "ethereum",
    address: "0x4F47BC496083C727c5fbe3Ce9cdf2B0F6496270C",
    label: "Sim Hyon Sop ETH wallet (OFAC SDN Apr 2023 — DPRK/KKBC)",
    role: "subject",
    notes: "Sim Hyon Sop — China-based representative of OFAC-sanctioned Korea Kwangson Banking Corp (KKBC). Per OFAC's 2023-04-24 designation, this single EVM address is used by Sim across Ethereum, Arbitrum, and BSC. Sim received cryptocurrency from DPRK IT workers and Lazarus-affiliated cybercriminals since 2021. Source: home.treasury.gov/news/press-releases/jy1435 + justice.gov/usao-dc/pr/north-korean-foreign-trade-bank-rep-charged-role-two-crypto-laundering-conspiracies",
    category: "sanctioned",
    ownerName: "Sim Hyon Sop (DPRK / KKBC)",
  },
  {
    headline: "Sim Hyon Sop — DPRK Foreign Trade Bank crypto laundering — Apr 2023 OFAC",
    chain: "arbitrum",
    address: "0x4F47BC496083C727c5fbe3Ce9cdf2B0F6496270C",
    label: "Sim Hyon Sop ARB wallet (same key, OFAC SDN Apr 2023)",
    role: "subject",
    notes: "Same Sim Hyon Sop EVM key as the ETH entry — listed separately by chain in OFAC's notice. Source: home.treasury.gov/news/press-releases/jy1435",
    category: "sanctioned",
    ownerName: "Sim Hyon Sop (DPRK / KKBC)",
  },
  {
    headline: "Sim Hyon Sop — DPRK Foreign Trade Bank crypto laundering — Apr 2023 OFAC",
    chain: "bsc",
    address: "0x4F47BC496083C727c5fbe3Ce9cdf2B0F6496270C",
    label: "Sim Hyon Sop BSC wallet (same key, OFAC SDN Apr 2023)",
    role: "subject",
    notes: "Same Sim Hyon Sop EVM key as the ETH/ARB entries. Source: home.treasury.gov/news/press-releases/jy1435",
    category: "sanctioned",
    ownerName: "Sim Hyon Sop (DPRK / KKBC)",
  },

  // === Wu Huihui — OTC trader who laundered DPRK funds (OFAC SDN Apr 2023) ===
  // First six of the seventeen BTC addresses Treasury attributed to Wu. The
  // remaining eleven are also OFAC-listed and can be added when needed.
  {
    headline: "Sim Hyon Sop — DPRK Foreign Trade Bank crypto laundering — Apr 2023 OFAC",
    chain: "bitcoin",
    address: "1986rYHckYbJpGQJy6ornuMyD2N5MTqwDt",
    label: "Wu Huihui BTC #1 (OFAC SDN Apr 2023 — DPRK OTC trader)",
    role: "counterparty",
    notes: "Wu Huihui — China-based OTC trader who converted DPRK-stolen crypto into fiat. One of 17 BTC addresses in his OFAC SDN designation (2023-04-24). Linked here to the Sim Hyon Sop case since they were indicted as conspirators. Source: home.treasury.gov/news/press-releases/jy1435 + chainalysis.com/blog/ofac-dprk-north-korea-sanctions-april-2023",
    category: "sanctioned",
    ownerName: "Wu Huihui (China OTC, DPRK conspirator)",
  },
  {
    headline: "Sim Hyon Sop — DPRK Foreign Trade Bank crypto laundering — Apr 2023 OFAC",
    chain: "bitcoin",
    address: "125W5ek3DT6Zqy5S2iPt4FHQdNMCbZA3FU",
    label: "Wu Huihui BTC #2 (OFAC SDN Apr 2023)",
    role: "counterparty",
    notes: "Wu Huihui OFAC-listed BTC address. Source: home.treasury.gov/news/press-releases/jy1435",
    category: "sanctioned",
    ownerName: "Wu Huihui (China OTC, DPRK conspirator)",
  },
  {
    headline: "Sim Hyon Sop — DPRK Foreign Trade Bank crypto laundering — Apr 2023 OFAC",
    chain: "bitcoin",
    address: "1Kc6egXevyLEaeTxLFA1Zyw7GuhCN8jQtt",
    label: "Wu Huihui BTC #3 (OFAC SDN Apr 2023)",
    role: "counterparty",
    notes: "Wu Huihui OFAC-listed BTC address. Source: home.treasury.gov/news/press-releases/jy1435",
    category: "sanctioned",
    ownerName: "Wu Huihui (China OTC, DPRK conspirator)",
  },
  {
    headline: "Sim Hyon Sop — DPRK Foreign Trade Bank crypto laundering — Apr 2023 OFAC",
    chain: "bitcoin",
    address: "12w6v1qAaBc4W8h8C2Cu5SKFaKDSv3erUW",
    label: "Wu Huihui BTC #4 (OFAC SDN Apr 2023)",
    role: "counterparty",
    notes: "Wu Huihui OFAC-listed BTC address. Source: home.treasury.gov/news/press-releases/jy1435",
    category: "sanctioned",
    ownerName: "Wu Huihui (China OTC, DPRK conspirator)",
  },
  {
    headline: "Sim Hyon Sop — DPRK Foreign Trade Bank crypto laundering — Apr 2023 OFAC",
    chain: "bitcoin",
    address: "1CPJak9ZyddbawMGJPyEhCiJLXXb4sYv8N",
    label: "Wu Huihui BTC #5 (OFAC SDN Apr 2023)",
    role: "counterparty",
    notes: "Wu Huihui OFAC-listed BTC address. Source: home.treasury.gov/news/press-releases/jy1435",
    category: "sanctioned",
    ownerName: "Wu Huihui (China OTC, DPRK conspirator)",
  },
  {
    headline: "Sim Hyon Sop — DPRK Foreign Trade Bank crypto laundering — Apr 2023 OFAC",
    chain: "bitcoin",
    address: "1DJoVLgn1foJHHngduRPJvRbwpaFEKxvxd",
    label: "Wu Huihui BTC #6 (OFAC SDN Apr 2023)",
    role: "counterparty",
    notes: "Wu Huihui OFAC-listed BTC address. Source: home.treasury.gov/news/press-releases/jy1435",
    category: "sanctioned",
    ownerName: "Wu Huihui (China OTC, DPRK conspirator)",
  },

  // === Silk Road / James Zhong DOJ seizure (Nov 2021) ===
  // Consolidation address used for dust collection. Bulk of the 50,676 BTC
  // moved through multiple US Marshals wallets and is being auctioned; only
  // residual remains at this address, so balanceEstimateUsd is left unset
  // (would be misleading to attribute the full $4.8B to one residual address).
  {
    headline: "Silk Road / James Zhong — 50,676 BTC seized 2021 — popcorn-tin justice",
    chain: "bitcoin",
    address: "bc1qnysx9sr0s7uw39awr3hh099d5m0lvrnxz7ga54",
    label: "Silk Road / Zhong DOJ consolidation address (dust remainder)",
    role: "subject",
    notes: "DOJ-attributed consolidation address used to collect dust transactions from the 50,676 BTC seized from James Zhong's Gainesville GA home in Nov 2021. Bulk of the seizure moved through multiple US Marshals wallets, DOJ liquidation clearance Jan 2025. Source: protos.com/who-moved-3m-in-silk-road-btc-dormant-addresses-spring-back-to-life",
    category: "government-seized",
    ownerName: "US Department of Justice (US Marshals Service)",
  },

  // === Cream Finance Oct 2021 — primary + 2 dispersal wallets ===
  {
    headline: "Cream Finance $130M hack — Oct 2021 — flash loan, 68 assets, two-attacker split",
    chain: "ethereum",
    address: "0x24354D31bC9d90F62fe5f2454709C32049cf866B",
    label: "Cream Finance Exploiter (primary, flash-loan executor)",
    role: "subject",
    notes: "Etherscan-tagged 'Cream Finance Exploiter'. Executed the flash-loan + yUSDVault donation-oracle manipulation across 68 assets in a single 9+ ETH gas transaction. Source: medium.com/immunefi/hack-analysis-cream-finance-oct-2021-fc222d913fc5 + halborn.com/blog/post/explained-the-cream-finance-hack-october-2021",
    category: "hack-source",
    ownerName: "Cream Finance Oct-2021 attacker(s)",
  },
  {
    headline: "Cream Finance $130M hack — Oct 2021 — flash loan, 68 assets, two-attacker split",
    chain: "ethereum",
    address: "0x921760e71Fb58dcC8de902Ce81453e9E3d7fe253",
    label: "Cream Finance Exploiter — dispersal wallet 1",
    role: "observed",
    notes: "Receiver of half the Cream-Finance Oct 2021 attack proceeds. The two-wallet split led several investigators to theorize either two collaborating teams or single-team opsec compartmentalization. Source: medium.com/immunefi/hack-analysis-cream-finance-oct-2021-fc222d913fc5",
    category: "hack-destination",
    ownerName: "Cream Finance Oct-2021 attacker(s)",
  },
  {
    headline: "Cream Finance $130M hack — Oct 2021 — flash loan, 68 assets, two-attacker split",
    chain: "ethereum",
    address: "0x70747df6Ac244979A2Ae9ca1E1A82899D02BBEa4",
    label: "Cream Finance Exploiter — dispersal wallet 2",
    role: "observed",
    notes: "Receiver of the other half of the Cream-Finance Oct 2021 attack proceeds. Source: medium.com/immunefi/hack-analysis-cream-finance-oct-2021-fc222d913fc5",
    category: "hack-destination",
    ownerName: "Cream Finance Oct-2021 attacker(s)",
  },

  // === Chaos ransomware — FBI seizure Apr 2025 ($2.4M) — government-seized ===
  // Promoted to its own intel piece (see seed-intel-incidents.ts). Linked
  // here as subject of the dedicated Chaos ransomware writeup.
  {
    headline: "Chaos ransomware — FBI seizes $2.4M from operator 'Hors' — Apr 2025",
    chain: "bitcoin",
    address: "bc1q5d8af0crjhlnepjq08muhh55899rf2ktye3sxd",
    label: "Chaos ransomware FBI-seized address (~$2.4M, Apr 2025)",
    role: "subject",
    notes: "FBI seized 20.2891382 BTC from this address on 2025-04-15. DOJ civil-forfeiture complaint filed 2025-07-24. Attacker handle 'Hors' tied to Chaos ransomware operations. Source: bleepingcomputer.com/news/security/fbi-seizes-24m-in-bitcoin-from-new-chaos-ransomware-operation",
    category: "government-seized",
    ownerName: "US Federal Bureau of Investigation",
    balanceEstimateUsd: 20.29 * 95_000, // ~$1.93M
    nativeAmount: 20.29,
    nativeSymbol: "BTC",
  },

  // === Multichain "asset preservation" addresses — Zhaojun's sister ===
  // After CEO Zhaojun's disappearance, his sister moved the remaining bridge
  // funds to these two addresses, claiming "asset preservation" — before
  // being arrested by Chinese police. Linkable to the existing Multichain
  // collapse incident; expands the address-graph fingerprint of the case.
  {
    headline: "Multichain $125M+ collapse — Jul 2023 — the CEO arrest and missing MPC keys",
    chain: "ethereum",
    address: "0x1eed63efba5f81d95bfe37d82c8e736b974f477b",
    label: "Multichain \"asset preservation\" wallet #1 (Zhaojun's sister)",
    role: "observed",
    notes: "Receiving address used by CEO Zhaojun's sister to move remaining bridge funds after Zhaojun's reported arrest, claiming \"asset preservation.\" She was arrested by Chinese police shortly after. Source: cointelegraph.com/news/multichain-zhaojun-sister-asset-preservation",
    category: "hack-destination",
    ownerName: "Zhaojun family member (Multichain CEO sister)",
  },
  {
    headline: "Multichain $125M+ collapse — Jul 2023 — the CEO arrest and missing MPC keys",
    chain: "ethereum",
    address: "0x6b6314f4f07c974600d872182dcde092c480e57b",
    label: "Multichain \"asset preservation\" wallet #2 (Zhaojun's sister)",
    role: "observed",
    notes: "Second \"asset preservation\" address used by Zhaojun's sister in the post-arrest move of remaining Multichain bridge funds. Source: cointelegraph.com/news/multichain-zhaojun-sister-asset-preservation",
    category: "hack-destination",
    ownerName: "Zhaojun family member (Multichain CEO sister)",
  },

  // === Wintermute Sep 2022 — Profanity vanity-address vulnerability ===
  {
    headline: "Wintermute $160M hack — Sep 2022 — the Profanity vanity-address vulnerability",
    chain: "ethereum",
    address: "0xe74b28c2eAe8679e3cCc3a94d5d0dE83CCB84705",
    label: "Wintermute Exploiter (external attacker EOA)",
    role: "subject",
    notes: "Etherscan-tagged 'Wintermute Exploiter'. Funded with 10 ETH from Tornado Cash pre-attack, then sent 2 ETH to the Profanity-vulnerable Wintermute hot wallet as gas. Source: halborn.com/blog/post/explained-the-wintermute-hack-september-2022",
    category: "hack-source",
    ownerName: "Wintermute Sep-2022 attacker",
  },
  {
    headline: "Wintermute $160M hack — Sep 2022 — the Profanity vanity-address vulnerability",
    chain: "ethereum",
    address: "0x0000000fe6a514a32abdcdfcc076c85243de899b",
    label: "Wintermute compromised hot wallet (Profanity-generated, leading zeros)",
    role: "subject",
    notes: "Wintermute's gas-optimized leading-zero vanity hot wallet. The address was generated using the Profanity tool, whose 32-bit CPRNG seed made the private key brute-forceable in hours on modest GPU hardware (1inch published warning 2022-09-15, attack 2022-09-20). Source: numencyber.com/an-analysis-of-wintermutes-usd160-million-hacking",
    category: "hack-destination",
    ownerName: "Wintermute (compromised hot wallet)",
  },

  // === Orbit Bridge Dec 2023 — Lazarus-attributed insider-aided drain ===
  {
    headline: "Orbit Bridge $81M hack — Dec 31 2023 — New Year's Eve Lazarus drain",
    chain: "ethereum",
    address: "0x9263e7873613DdC598a701709875634819176aff",
    label: "Orbit Bridge Exploiter (primary, 26,741 ETH recipient)",
    role: "subject",
    notes: "Etherscan-tagged 'Orbit Bridge Exploiter'. Primary recipient of the 26,741.6 ETH drained from Orbit's ETH vault on 2023-12-31. Funded via Tornado Cash through an intermediary. Source: halborn.com/blog/post/explained-the-orbit-bridge-hack-december-2023",
    category: "hack-source",
    ownerName: "Orbit Bridge attacker (Lazarus-attributed)",
  },
  {
    headline: "Orbit Bridge $81M hack — Dec 31 2023 — New Year's Eve Lazarus drain",
    chain: "ethereum",
    address: "0x70462BfB204Bf3CcB0560f259072F8e3A85B3512",
    label: "Orbit Bridge Exploiter (secondary, fan-out wallet)",
    role: "observed",
    notes: "Secondary attacker wallet receiving fan-out from the primary Orbit Bridge drain. Source: halborn.com/blog/post/explained-the-orbit-bridge-hack-december-2023",
    category: "hack-source",
    ownerName: "Orbit Bridge attacker (Lazarus-attributed)",
  },

  // === Eterbase Sep 2020 — Slovak exchange Lazarus drain (4 addresses) ===
  {
    headline: "Eterbase $5.4M hack — Sep 2020 — Slovak exchange, early Lazarus exemplar",
    chain: "ethereum",
    address: "0x8D76166C22658A144c0211d87Abf152e6a2d9D95",
    label: "Eterbase hot ETH wallet (compromised, source of theft)",
    role: "observed",
    notes: "Eterbase's pre-hack ETH hot wallet. Drained 387.4 ETH to the attacker consolidation. Source: blog.merklescience.com/hacktrack/hack-track-eterbase-cryptocurrency-exchange",
    category: "exchange",
    ownerName: "Eterbase (pre-hack hot wallet)",
  },
  {
    headline: "Eterbase $5.4M hack — Sep 2020 — Slovak exchange, early Lazarus exemplar",
    chain: "ethereum",
    address: "0x7860F7b2874e77E80bE0fC6EbfB9414f89781aD9",
    label: "Eterbase Hacker ETH consolidation (Lazarus)",
    role: "subject",
    notes: "Lazarus attacker's ETH consolidation address. Received 387.4 ETH from the Eterbase hot wallet drain. Source: blog.merklescience.com/hacktrack/hack-track-eterbase-cryptocurrency-exchange",
    category: "hack-source",
    ownerName: "Eterbase Sep-2020 attacker (Lazarus)",
    nativeAmount: 387.4,
    nativeSymbol: "ETH",
  },
  {
    headline: "Eterbase $5.4M hack — Sep 2020 — Slovak exchange, early Lazarus exemplar",
    chain: "bitcoin",
    address: "17qQhHmNs9X3D4YWqvkp6St1YSsXWPdAty",
    label: "Eterbase hot BTC wallet (compromised, source of theft)",
    role: "observed",
    notes: "Eterbase's pre-hack BTC hot wallet. Drained 11.45 BTC to the attacker consolidation. Source: blog.merklescience.com/hacktrack/hack-track-eterbase-cryptocurrency-exchange",
    category: "exchange",
    ownerName: "Eterbase (pre-hack hot wallet)",
  },
  {
    headline: "Eterbase $5.4M hack — Sep 2020 — Slovak exchange, early Lazarus exemplar",
    chain: "bitcoin",
    address: "1ANLZZ2YFGumRXaD3EMii92zWQgvX2CK9c",
    label: "Eterbase Hacker BTC consolidation (Lazarus)",
    role: "subject",
    notes: "Lazarus attacker's BTC consolidation address. Received 11.45 BTC from the Eterbase hot wallet drain. Source: blog.merklescience.com/hacktrack/hack-track-eterbase-cryptocurrency-exchange",
    category: "hack-source",
    ownerName: "Eterbase Sep-2020 attacker (Lazarus)",
    nativeAmount: 11.45,
    nativeSymbol: "BTC",
  },

  // === KuCoin Sep 2020 — verified Lazarus attacker primary EOA ===
  // Funds fully recovered (84% on-chain + 16% KuCoin insurance fund); no
  // current balance worth pricing. Adding for historical-graph completeness
  // — this is the canonical Lazarus DEX-laundering pivot incident.
  {
    headline: "KuCoin $281M hack — Sep 2020 — Lazarus exchange drain, 84% recovered",
    chain: "ethereum",
    address: "0xeb31973E0FeBF3e3D7058234a5eBbAe1aB4B8c23",
    label: "Kucoin Hacker (Lazarus, Sep 2020)",
    role: "subject",
    notes: "Etherscan-tagged 'Kucoin Hacker'. Primary EOA that received the Ethereum-side drain (1,008 BTC + ~$153M in ETH/ERC20s + others). Chainalysis attribution; canonical case study for Lazarus's DEX-based laundering pivot. KuCoin ultimately recovered 100% of user funds. Source: etherscan.io/address/0xeb31973e0febf3e3d7058234a5ebbae1ab4b8c23 + chainalysis.com/blog/lazarus-group-kucoin-exchange-hack",
    category: "hack-source",
    ownerName: "KuCoin Sep-2020 attacker (Lazarus)",
  },

  // === Liquid Global Aug 2021 — verified Lazarus attacker EOA ===
  {
    headline: "Liquid Global $97M hack — Aug 2021 — Lazarus drain of Japanese exchange",
    chain: "ethereum",
    address: "0x5578840AaE68682a9779623FA9e8714802B59946",
    label: "Liquid Exchange Hacker 1 (Lazarus)",
    role: "subject",
    notes: "Etherscan-tagged 'Liquid Exchange Hacker 1'. One of the primary attacker EOAs that received the drained Ethereum-side assets. Subsequently laundered through Uniswap/SushiSwap into ETH then Tornado Cash. Source: etherscan.io/address/0x5578840aae68682a9779623fa9e8714802b59946 + elliptic.co/blog/liquid-exchange-hacked-94-million-stolen",
    category: "hack-source",
    ownerName: "Liquid Aug-2021 attacker (Lazarus)",
  },

  // === Mt. Gox Trustee Hot Wallet — adds Trustee custody to graph ===
  // Arkham-identified hot wallet that the Trustee uses during creditor
  // distributions. Balance fluctuates as funds move out to exchanges for
  // payout; balanceEstimateUsd intentionally not set (any number would be
  // out of date within days). Category "exchange" since Mt. Gox is technically
  // still an exchange in bankruptcy administration, not government-seized.
  {
    headline: "Mt. Gox cold wallet — 79,956 BTC dormant since 2011",
    chain: "bitcoin",
    address: "1JbezDVd9VsK9o1Ga9UqLydeuEvhKLAPs6",
    label: "Mt. Gox Trustee Hot Wallet (1Jbez) — active distribution wallet",
    role: "observed",
    notes: "Arkham-identified hot wallet operated by Mt. Gox Trustee Nobuaki Kobayashi for creditor distributions. Moved ~$2.2B in BTC during 2024 distribution waves; final repayment deadline currently Oct 2026. Source: intel.arkm.com/explorer/address/1JbezDVd9VsK9o1Ga9UqLydeuEvhKLAPs6 + theblock.co/post/325357/mt-gox-linked-cold-wallet-moves-over-2-billion-worth-of-bitcoin",
    category: "exchange",
    ownerName: "Mt. Gox Trustee (Nobuaki Kobayashi)",
  },

  // === Platypus Finance (Avalanche) — opens the AVALANCHE lane ===
  {
    headline: "Platypus Finance $8.5M hack — Feb 2023 — Avalanche flash-loan emergencyWithdraw",
    chain: "avalanche",
    address: "0xeff003d64046a6f521ba31f39405cb720e953958",
    label: "Platypus Finance Exploiter EOA",
    role: "subject",
    notes: "Snowtrace-tagged 'Platypus Finance Exploiter'. The externally-owned account that orchestrated the $44M Aave flash-loan + emergencyWithdraw-bypass attack on Avalanche. Source: snowtrace.io/address/0xeff003d64046a6f521ba31f39405cb720e953958 + medium.com/immunefi/hack-analysis-platypus-finance-february-2023-d11fce37d861",
    category: "hack-source",
    ownerName: "Platypus Feb-2023 attacker",
  },
  {
    headline: "Platypus Finance $8.5M hack — Feb 2023 — Avalanche flash-loan emergencyWithdraw",
    chain: "avalanche",
    address: "0x67afdd6489d40a01dae65f709367e1b1d18a5322",
    label: "Platypus Finance Attack Contract (emergencyWithdraw bypass)",
    role: "subject",
    notes: "Snowtrace-tagged Platypus attack contract. Source: snowtrace.io/address/0x67afdd6489d40a01dae65f709367e1b1d18a5322",
    category: "hack-source",
    ownerName: "Platypus Feb-2023 attacker",
  },

  // === Hal Finney first-BTC-transaction recipient — historical-dormant ===
  // Hal received the first peer-to-peer Bitcoin transaction (10 BTC from
  // Satoshi on 2009-01-12). This single address is the cleanest "dormant
  // historical-significance" exemplar to anchor the dormant category.
  // Attached to the Bitcoin Genesis Block intel so it links visually with
  // Satoshi-era addresses in the graph.
  {
    headline: "Bitcoin Genesis Block — 50 BTC unspendable since 2009",
    chain: "bitcoin",
    address: "12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX",
    label: "Hal Finney first-BTC-tx recipient (10 BTC, 2009-01-12, dormant)",
    role: "observed",
    notes: "Recipient of the first peer-to-peer Bitcoin transaction in history — 10 BTC from Satoshi Nakamoto to Hal Finney, 2009-01-12 (block 170). Hal died 2014; the original 10 BTC plus subsequent residue sits at this address. Confirmed-cited historical exemplar of the 'long-dormant key-presumed-lost' category. Source: en.bitcoin.it/wiki/Hal_Finney",
    category: "dormant",
    ownerName: "Hal Finney (deceased 2014)",
    balanceEstimateUsd: 10 * 95_000, // ~$950k (original 10 BTC; ignoring residue dust)
    nativeAmount: 10,
    nativeSymbol: "BTC",
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

  // Build the optional-attribution patch — only includes fields the entry set.
  const attrPatch: Record<string, unknown> = {};
  if (entry.category !== undefined) attrPatch.category = entry.category;
  if (entry.ownerName !== undefined) attrPatch.ownerName = entry.ownerName;
  if (entry.balanceEstimateUsd !== undefined)
    attrPatch.balanceEstimateUsd = entry.balanceEstimateUsd.toString();
  if (entry.nativeAmount !== undefined)
    attrPatch.nativeAmount = entry.nativeAmount.toString();
  if (entry.nativeSymbol !== undefined)
    attrPatch.nativeSymbol = entry.nativeSymbol.toUpperCase();

  if (existing) {
    // Always refresh label/notes + any provided attribution fields.
    await db
      .update(addresses)
      .set({
        label: entry.label,
        notes: entry.notes,
        ...attrPatch,
        updatedAt: new Date(),
      })
      .where(eq(addresses.id, existing.id));
    return existing.id;
  }

  const [inserted] = await db
    .insert(addresses)
    .values({
      chain,
      address: entry.address,
      label: entry.label,
      notes: entry.notes,
      ...attrPatch,
    })
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
