/**
 * Run with: npx tsx scripts/seed-lost-crypto.ts
 *
 * Seeds the famous "lost crypto" cases — wallets whose owners can no longer
 * spend the funds for technical or human-failure reasons (lost keys, dead
 * custodian, locked contract). Each case becomes:
 *   1. An intel submission (kind="original", category="Lost crypto")
 *   2. Address rows tagged category='lost' with owner_name + balance_estimate_usd
 *   3. intel_addresses links (role='subject') so the wallets appear on /graph
 *
 * USD balance estimates are calculated against price snapshots noted below.
 * Update PRICE_BTC / PRICE_ETH when reseeding — the graph header aggregates
 * sum(balance_estimate_usd) across category='lost' addresses.
 *
 * Curation rule (same as the rest of the address graph): every on-chain
 * address has a primary-source citation in the address.notes field. Famous
 * cases without published addresses (James Howells HDD, Stefan Thomas IronKey)
 * get intel coverage but no address rows.
 *
 * Idempotent: matches intel on payload.headline; matches addresses on
 * (chain, lower(address)).
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import {
  addresses,
  db,
  intelAddresses,
  submissions,
} from "../src/lib/db";
import type { IntelPayload } from "../src/lib/db/schema";
import type { PersonaSlug } from "../src/lib/personas";

// Snapshot prices used to compute balance_estimate_usd. Treat these as
// approximate — graph header should eventually pull live prices, but for the
// MVP a periodic re-seed is fine.
const PRICE_BTC_USD = 95_000;
const PRICE_ETH_USD = 3_500;

// Lost-crypto stories speak to a broader audience than incident postmortems —
// not just compliance/investigators but the general crypto-curious. Default
// to all five priority personas; override per-entry if needed.
const LOST_DEFAULT_PERSONAS: PersonaSlug[] = [
  "investigator",
  "compliance",
  "fund-risk",
  "exchange-risk",
  "gov-le",
];

type LostAddress = {
  chain: string;
  address: string;
  label: string;
  ownerName: string;
  balanceEstimateUsd: number;
  // Native-token amount + symbol (uppercase). Feeds the per-token counter
  // on /graph alongside the USD figure.
  nativeAmount: number;
  nativeSymbol: string;
  notes: string;
};

type LostCase = {
  intel: IntelPayload;
  addresses: LostAddress[]; // empty for intel-only cases
};

const cases: LostCase[] = [
  // === Bitcoin Genesis Block coinbase — unspendable by protocol design ===
  {
    intel: {
      headline: "Bitcoin Genesis Block — 50 BTC unspendable since 2009",
      kind: "original",
      category: "Lost crypto",
      severity: "low",
      anonymous: true,
      body: [
        "The 50 BTC coinbase reward of Bitcoin's genesis block (block 0, mined 3 Jan 2009 by Satoshi Nakamoto) sits at `1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa` and has never moved. It can never move — the coinbase transaction in the genesis block is not included in Bitcoin Core's UTXO database, by a quirk of how Satoshi wrote the original software. Any attempt to spend it would be rejected by every Bitcoin node.",
        "",
        "**The quirk.** Genesis was hardcoded into Bitcoin's original C++ source rather than added through the normal block-acceptance code path. As a side-effect, when the UTXO index was built, the genesis coinbase output was never indexed. Even if Satoshi could produce a valid signature, no node would accept the spend — the inputs don't exist from the network's perspective.",
        "",
        "**The residue.** The address still receives small donations from Bitcoin enthusiasts — over 50 BTC of *additional* deposits have accumulated on top of the original 50 BTC. Those additional sats *are* technically spendable, but the address's private key (if Satoshi even kept it) has never signed anything. So in practice, ~100 BTC sits at this address that the network is unlikely to ever see move.",
        "",
        "**Why it matters.** This is the first and most famous lost-by-design wallet in crypto. It's a daily reminder, in the public-ledger sense, that lost coins are gone forever — there is no rewind, no court order, no recovery. Every later technique for handling lost-key situations (multisig, social recovery, account abstraction) is downstream of the simple observation: if Satoshi can't move 50 BTC, no one is recovering yours by complaining.",
      ].join("\n"),
      sources: [
        "https://en.bitcoin.it/wiki/Genesis_block",
        "https://bitcointalk.org/index.php?topic=2407.0",
        "https://www.blockchain.com/explorer/addresses/btc/1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      ],
    },
    addresses: [
      {
        chain: "bitcoin",
        address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
        label: "Bitcoin Genesis Block coinbase (50 BTC, unspendable since 2009)",
        ownerName: "Satoshi Nakamoto",
        balanceEstimateUsd: 50 * PRICE_BTC_USD,
        nativeAmount: 50,
        nativeSymbol: "BTC",
        notes: `Genesis block coinbase output, mined 2009-01-03. Cannot be spent — the coinbase tx of block 0 is not in any node's UTXO database (Satoshi hardcoded genesis outside the normal block-acceptance path). Has accumulated ~50+ BTC in donations on top of the original 50 BTC. Source: en.bitcoin.it/wiki/Genesis_block`,
      },
    ],
  },

  // === Parity Multisig Library Self-Destruct — 513,774 ETH frozen ===
  {
    intel: {
      headline: "Parity Multisig — 513,774 ETH frozen forever — Nov 2017",
      kind: "original",
      category: "Lost crypto",
      severity: "critical",
      anonymous: true,
      body: [
        "On 6 Nov 2017 at 14:33 UTC, an anonymous GitHub user posting as 'devops199' triggered a self-destruct on the shared Parity multisig wallet library at `0x863DF6BFa4469f3ead0bE8f9F2AAE51c91A907b4`. The library was not initialized after deployment — meaning anyone could call `initWallet` to become its owner. devops199 did. Then they called `kill`. The library vanished from the chain.",
        "",
        "**The blast radius.** 587 multisig wallets that had been deployed pointing to this library as their implementation contract were instantly bricked. The wallets themselves still exist on-chain; their funds (513,774.16 ETH plus various ERC-20s) are still recorded as belonging to them. But every function call those wallets need to make routes through the destroyed library, so no transaction can ever execute. The funds are frozen at $1.6B+ depending on ETH price.",
        "",
        "**Why no recovery.** Multiple EIPs were proposed to restore the library state — most notably EIP-999 in early 2018, which would have re-deployed the destroyed contract at its original address. EIP-999 was a contentious vote: the broader community refused to endorse a one-off bailout, even for an obvious infrastructure failure. The funds remain locked.",
        "",
        "**The lesson.** This is the canonical case study for *uninitialized contract = ownerless contract*. Every modern smart-contract framework (OpenZeppelin Initializable, Solidity 0.5+ `constructor`-only patterns) was hardened in direct response. The Parity Multisig wallets themselves were also widely used by ICO-era projects — Polkadot's pre-mainnet treasury (~300k ETH at the time) was the single largest holder.",
      ].join("\n"),
      sources: [
        "https://www.parity.io/blog/a-postmortem-on-the-parity-multi-sig-library-self-destruct/",
        "https://github.com/openethereum/parity-ethereum/issues/6995",
        "https://etherscan.io/address/0x863df6bfa4469f3ead0be8f9f2aae51c91a907b4",
      ],
    },
    addresses: [
      {
        chain: "ethereum",
        address: "0x863DF6BFa4469f3ead0bE8f9F2AAE51c91A907b4",
        label: "Parity Multisig Library (self-destructed, 513,774 ETH frozen in 587 wallets)",
        ownerName: "587 Parity multisig wallet owners (including Polkadot treasury)",
        balanceEstimateUsd: 513_774 * PRICE_ETH_USD,
        nativeAmount: 513_774,
        nativeSymbol: "ETH",
        notes: `Etherscan-tagged 'Parity Bug: Trigger'. Self-destructed 2017-11-06 by anonymous user 'devops199' via uninitialized library exploit. 587 dependent multisig wallets bricked; 513,774.16 ETH locked. EIP-999 recovery proposal rejected by community. Source: parity.io/blog/a-postmortem-on-the-parity-multi-sig-library-self-destruct + etherscan.io/address/0x863df6bfa4469f3ead0be8f9f2aae51c91a907b4`,
      },
    ],
  },

  // === Mt. Gox 80,000 BTC cold wallet — dormant since 2011 ===
  {
    intel: {
      headline: "Mt. Gox cold wallet — 79,956 BTC dormant since 2011",
      kind: "original",
      category: "Lost crypto",
      severity: "high",
      anonymous: true,
      body: [
        "The Bitcoin address `1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF` received 79,956 BTC on 1 Mar 2011, shortly after the Mt. Gox Linode hack — and has never sent a single satoshi out since. At current BTC prices the address holds ~$7.6B in untouched value, making it one of the most-watched dormant wallets in crypto.",
        "",
        "**The Linode hack connection.** BitMEX Research's 2017 forensic work tied this address to the breach of Mt. Gox's Linode-hosted infrastructure in June 2011, which moved approximately 80,000 BTC out of Mt. Gox's hot wallets. The funds were swept to this address and have not moved in the ~15 years since. The owner is unknown — most likely the original Linode attacker(s), but no public attribution has been made.",
        "",
        "**Why 'lost' rather than just 'dormant.'** Three reads coexist:",
        "1. The private key has been lost. The simplest explanation — somebody compromised Linode, swept the BTC, and lost the key before they could move it.",
        "2. The owner is waiting indefinitely. Unlikely given 15 years of price appreciation.",
        "3. The owner is dead. Plausible given the timeframe and the absence of any movement around major life events most operators would react to.",
        "",
        "Whatever the answer, the on-chain behavior — zero outflows across the largest Bitcoin price moves in history, including the 2017, 2021, and 2024 cycle tops — is the strongest signal the crypto community has for 'lost' versus merely 'dormant.'",
        "",
        "**The 2024 scam wave.** In early 2024, multiple actors began sending small OP_RETURN messages to this address linking to phishing sites that claimed to be 'recovery services.' BitMEX and BleepingComputer have warned publicly. Funds remain untouched.",
      ].join("\n"),
      sources: [
        "https://protos.com/mt-gox-wallet-with-80000-btc-attacked-via-op_return-message/",
        "https://decrypt.co/329146/hackers-target-bitcoin-wallet-holding-billions-swiped-mt-gox",
        "https://www.spark.money/address/1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF",
      ],
    },
    addresses: [
      {
        chain: "bitcoin",
        address: "1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF",
        label: "Mt. Gox Linode-hack cold wallet (79,956 BTC dormant since 2011)",
        ownerName: "Unknown (Mt. Gox Linode-hack attribution per BitMEX Research)",
        balanceEstimateUsd: 79_956 * PRICE_BTC_USD,
        nativeAmount: 79_956,
        nativeSymbol: "BTC",
        notes: `Received 79,956 BTC on 2011-03-01 in the immediate aftermath of the Mt. Gox Linode-hosting breach. Never sent a single satoshi since. BitMEX Research is the canonical public attribution. Targeted by phishing OP_RETURN messages in 2024 — funds untouched. Source: protos.com/mt-gox-wallet-with-80000-btc-attacked-via-op_return-message`,
      },
    ],
  },

  // === QuadrigaCX — Cotten's "death" and the empty cold wallets ===
  {
    intel: {
      headline: "QuadrigaCX — $190M missing after Cotten's death — Jan 2019",
      kind: "original",
      category: "Lost crypto",
      severity: "critical",
      anonymous: true,
      body: [
        "Gerald Cotten, founder and sole director of Canadian crypto exchange QuadrigaCX, was reported to have died on 9 Dec 2018 while travelling in India. Cotten had been the only person with access to Quadriga's cold wallet keys. ~$190M (CAD ~$250M) of customer funds — BTC, ETH, LTC, and BCH — went with him to the grave. Ernst & Young's forensic work as bankruptcy trustee surfaced a story far stranger than the original 'lost keys' framing.",
        "",
        "**The empty wallets.** Ernst & Young identified six addresses Quadriga publicly described as cold wallets. All six had been emptied by April 2018 — eight months *before* Cotten's reported death. Five primary BTC cold addresses are documented in EY's reports: `1HyYMMCdCcHnfjwMW2jE4cv9qVkVDFUzVa`, `1JPtxSGoekZfLQeYAWkbhBhkr2VEDADHZB`, `1MhgmGaHwLAvvKVyFvy6zy9pRQFXaxwE9M`, `1ECUQLuioJbFZAQchcZq9pggd4EwcpuANe`, `1J9Fqc3TicNoy1Y7tgmhQznWrP5AVLXj9R`. Funds moved out of these addresses over 2017-2018 long before the bankruptcy.",
        "",
        "**Where did it go.** EY's blockchain analysis and the OSC's 2020 final report concluded that Cotten had been running QuadrigaCX as a Ponzi-like operation for years — using customer deposits to fund his own trading on other exchanges, where he lost large amounts. The 'lost keys' framing was a cover story for what was, materially, a fraud.",
        "",
        "**The 2022 movement.** In December 2022, the long-dormant addresses moved >100 BTC for the first time in three years. EY publicly confirmed the trustee did *not* initiate the transfers. Who did is still unknown — either Cotten survived (long-standing community theory), an inheritor of his keys acted, or a previously-unknown party acquired the keys.",
        "",
        "**The lesson.** QuadrigaCX is the canonical 'sole-custody risk' case — and the most-cited reason every serious crypto exchange now operates under multi-party computation, multi-sig with operational independence, or a regulated custodian framework. The 'one CEO holding all the keys' design was never safe; QuadrigaCX is what it looks like when it fails.",
      ].join("\n"),
      sources: [
        "https://www.coindesk.com/markets/2019/02/13/blockchain-analysis-ties-5-bitcoin-addresses-to-quadrigacx-exchange",
        "https://www.coindesk.com/policy/2022/12/19/bitcoin-addresses-tied-to-defunct-canadian-crypto-exchange-quadrigacx-wake-up",
        "https://www.osc.ca/en/news-events/news/osc-issues-final-report-quadrigacx",
      ],
    },
    addresses: [
      {
        chain: "bitcoin",
        address: "1HyYMMCdCcHnfjwMW2jE4cv9qVkVDFUzVa",
        label: "QuadrigaCX cold wallet #1 (Cotten custody — emptied pre-2018)",
        ownerName: "QuadrigaCX (Gerald Cotten sole custody)",
        balanceEstimateUsd: 36 * PRICE_BTC_USD,
        nativeAmount: 36.38,
        nativeSymbol: "BTC",
        notes: `One of five QuadrigaCX cold wallets identified by blockchain-analysis firms in EY's bankruptcy-trustee investigation. Received 36.38 BTC; emptied by April 2018 (eight months before Cotten's reported death). Subject of 2022 unauthorized movement. Source: coindesk.com/markets/2019/02/13/blockchain-analysis-ties-5-bitcoin-addresses-to-quadrigacx-exchange`,
      },
      {
        chain: "bitcoin",
        address: "1JPtxSGoekZfLQeYAWkbhBhkr2VEDADHZB",
        label: "QuadrigaCX cold wallet #2 (Cotten custody — emptied pre-2018)",
        ownerName: "QuadrigaCX (Gerald Cotten sole custody)",
        balanceEstimateUsd: 33 * PRICE_BTC_USD,
        nativeAmount: 33.2,
        nativeSymbol: "BTC",
        notes: `QuadrigaCX cold wallet, 33.20 BTC. Same custody/emptying pattern as the other four. Source: coindesk.com/markets/2019/02/13/blockchain-analysis-ties-5-bitcoin-addresses-to-quadrigacx-exchange`,
      },
      {
        chain: "bitcoin",
        address: "1MhgmGaHwLAvvKVyFvy6zy9pRQFXaxwE9M",
        label: "QuadrigaCX cold wallet #3 (Cotten custody — emptied pre-2018)",
        ownerName: "QuadrigaCX (Gerald Cotten sole custody)",
        balanceEstimateUsd: 20 * PRICE_BTC_USD,
        nativeAmount: 19.54,
        nativeSymbol: "BTC",
        notes: `QuadrigaCX cold wallet, 19.54 BTC. Source: coindesk.com/markets/2019/02/13/blockchain-analysis-ties-5-bitcoin-addresses-to-quadrigacx-exchange`,
      },
      {
        chain: "bitcoin",
        address: "1ECUQLuioJbFZAQchcZq9pggd4EwcpuANe",
        label: "QuadrigaCX cold wallet #4 (Cotten custody — emptied pre-2018)",
        ownerName: "QuadrigaCX (Gerald Cotten sole custody)",
        balanceEstimateUsd: 10 * PRICE_BTC_USD,
        nativeAmount: 10.34,
        nativeSymbol: "BTC",
        notes: `QuadrigaCX cold wallet, 10.34 BTC. Source: coindesk.com/markets/2019/02/13/blockchain-analysis-ties-5-bitcoin-addresses-to-quadrigacx-exchange`,
      },
      {
        chain: "bitcoin",
        address: "1J9Fqc3TicNoy1Y7tgmhQznWrP5AVLXj9R",
        label: "QuadrigaCX cold wallet #5 (Cotten custody — emptied pre-2018)",
        ownerName: "QuadrigaCX (Gerald Cotten sole custody)",
        balanceEstimateUsd: 5 * PRICE_BTC_USD,
        nativeAmount: 4.88,
        nativeSymbol: "BTC",
        notes: `QuadrigaCX cold wallet, 4.88 BTC. Source: coindesk.com/markets/2019/02/13/blockchain-analysis-ties-5-bitcoin-addresses-to-quadrigacx-exchange`,
      },
    ],
  },

  // === James Howells — Welsh landfill HDD — 7,500 BTC, no published address ===
  {
    intel: {
      headline: "James Howells — 7,500 BTC in a Welsh landfill since 2013",
      kind: "original",
      category: "Lost crypto",
      severity: "medium",
      anonymous: true,
      body: [
        "In mid-2013, Newport-based IT worker James Howells accidentally threw out a Dell laptop hard drive containing the wallet for 7,500 BTC he had mined in 2009. The drive went to Newport's Docksway landfill. At 2026 prices, the loss is ~$712M. Howells has spent the last decade trying to get permission to excavate the landfill; Newport City Council has consistently refused.",
        "",
        "**Why no specific address.** Howells has never publicly disclosed the wallet's Bitcoin address. The 7,500 BTC sit on-chain somewhere — likely in addresses controllable by the private key on the disposed-of drive — but without Howells releasing the public key or a transaction signed by the wallet, there is no way for external researchers to identify which addresses hold these funds. As a result this case does not appear in the address graph as a specific node.",
        "",
        "**The legal saga.** Howells has offered Newport Council escalating cuts of the recovered funds (most recently 10% of recovered value, ~$70M+ at 2024 prices). The Council has refused on environmental and operational grounds, and a 2025 UK High Court ruling found Howells had no right to require excavation. He is reportedly considering buying the landfill outright.",
        "",
        "**The lesson.** This is the canonical 'lost media' case in crypto. It's also the one most-cited in arguments for hardware-wallet seed backup and multi-location key storage. A single physical device controlling 7,500 BTC was a reasonable architecture in 2013 — when 7,500 BTC was worth ~$750. It became a $712M architecture as Bitcoin appreciated, without anyone re-evaluating the storage assumptions.",
      ].join("\n"),
      sources: [
        "https://www.bbc.com/news/uk-wales-67926774",
        "https://www.theguardian.com/uk-news/2025/jan/09/man-loses-bid-to-search-newport-tip-for-hard-drive-with-bitcoin",
      ],
    },
    addresses: [], // No published address — intel-only entry
  },

  // === PlusToken — $4.2B Chinese gov seizure of the biggest Ponzi in crypto ===
  // Intel-only because the specific seized addresses haven't been comprehensively
  // published — Chinese court records list amounts but not the on-chain breakdown
  // in a way RexIntel can verify with primary sources. The story is too big to
  // skip; it's the largest seizure-by-volume crypto event after Bitfinex.
  {
    intel: {
      headline: "PlusToken — $4.2B seized in the largest crypto Ponzi takedown",
      kind: "original",
      category: "Lost crypto",
      severity: "high",
      anonymous: true,
      body: [
        "PlusToken was a Chinese-language crypto 'wallet with yield' scheme that defrauded ~2.6M investors of 314,000 BTC, 9M ETH, 1.8M LTC, 928M XRP, 11B DOGE, plus large amounts of EOS, DASH, and BCH between Apr 2018 and Jun 2019. The total nominal take at peak prices was ~$3B, ranking it among the top three largest crypto-related scams in absolute value. Chinese law enforcement made first arrests in Jun 2019 (six Chinese nationals in Vanuatu) and the case wrapped through a 2020 Jiangsu Yancheng court ruling that ordered all seized assets forfeited to the national treasury.",
        "",
        "**The seizure.** Per the Jiangsu Yancheng Intermediate People's Court Nov 2020 judgment, Chinese authorities seized: 194,775 BTC, 833,083 ETH, 1.4M LTC, 27.6M EOS, 74,167 DASH, 487M XRP, 6B DOGE, 79,581 BCH, 213,724 USDT. At 2026 prices the BTC alone is ~$18.5B; the total package, if reckoned at current spot, would be in the $20B+ range. This makes PlusToken the largest crypto seizure-by-spot-value on record — larger than the Bitfinex DOJ seizure.",
        "",
        "**The market impact.** CryptoQuant's 2020 forensic work tied the persistent sell pressure on Bitcoin during the second half of 2019 (BTC roughly halved from ~$13k to ~$7k between Jul-Dec 2019) to the PlusToken operator group laundering the stolen BTC through Huobi, Binance, and mixers as they tried to off-ramp ahead of arrest. CryptoQuant later identified continued large-block movements (e.g. the Oct 2024 transfer of ~7,000 ETH) that they attribute to the Chinese government's own offloading of the seized stash.",
        "",
        "**Why this is in 'lost crypto' rather than 'seizure.'** From the 2.6M defrauded investors' perspective, these funds are *lost* — the Chinese government's seizure forfeits them to the state treasury rather than restituting victims. The QuadrigaCX / Mt. Gox bankruptcy precedent of creditor-class restitution does not apply under PRC law. The funds are not 'unspent forever' the way Howells HDD coins are, but they are unrecoverable to their original owners — a different but functionally equivalent kind of loss.",
        "",
        "**Why no specific addresses (yet).** The PRC court records and the post-2020 sell-side movements provide enough specificity for a research team with subpoena power to trace, but a comprehensive *public* list of PlusToken-attributable addresses has not been published by Chinese authorities. Arkham, Chainalysis, and CryptoQuant have published partial sets. RexIntel will add specific addresses to this case as the curation rule (primary-source citation per address) can be satisfied.",
      ].join("\n"),
      sources: [
        "https://www.theblock.co/post/85873/china-seize-billion-cryptos-from-plustoken-crackdown",
        "https://coingeek.com/plustoken-scam-china-seizes-4-2b-digital-currencies/",
        "https://crypto.news/cryptoquant-ceo-china-sold-194k-bitcoin-from-plustoken/",
      ],
    },
    addresses: [],
  },

  // === Stefan Thomas — IronKey, 2 password attempts left ===
  {
    intel: {
      headline: "Stefan Thomas — 7,002 BTC on an IronKey with 2 attempts left",
      kind: "original",
      category: "Lost crypto",
      severity: "medium",
      anonymous: true,
      body: [
        "San Francisco programmer Stefan Thomas owns an IronKey USB drive containing the private key for 7,002 BTC he was given in 2011 for making a video explaining Bitcoin. He has forgotten the IronKey's password and lost the piece of paper he wrote it on. IronKey drives wipe themselves after 10 wrong attempts. As of his last public update, Thomas had used 8 of those 10. The wallet has not been spent.",
        "",
        "**The recovery saga.** In 2022, security researcher Joe Grand (Kingpin of Hak5 fame) — who had previously cracked a different lost-crypto case (the Trezor One device of Dan Reich) — publicly offered to help Thomas. As of 2025 there's no confirmed recovery. The Wired profile that surfaced Thomas's case in 2021 remains the most-cited account.",
        "",
        "**Why no specific address.** As with James Howells, Thomas has not publicly disclosed the Bitcoin address. The 7,002 BTC sit somewhere on-chain; without Thomas releasing the public key or a signed transaction, no external observer can identify which specific UTXOs are at risk. This case does not appear as a node in the address graph.",
        "",
        "**The architectural lesson.** The IronKey design — count-limited password attempts then permanent wipe — is the same threat-model assumption that protects banking USB tokens against brute-force, transplanted into a context (long-term cold storage) where the user is *also* the attacker against themselves. The pattern recurs in modern hardware-wallet PIN policies; the right ratio of 'protects against thieves' versus 'protects against your future self' is still a live question in custody design.",
      ].join("\n"),
      sources: [
        "https://www.nytimes.com/2021/01/12/technology/bitcoin-passwords-wallets-fortunes.html",
        "https://www.wired.com/story/this-guy-locked-himself-out-of-his-bitcoin-fortune/",
      ],
    },
    addresses: [],
  },
];

async function upsertSubmission(payload: IntelPayload) {
  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "intel"),
        sql`${submissions.payload}->>'headline' = ${payload.headline}`,
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const [row] = await db
      .update(submissions)
      .set({
        payload,
        status: "approved",
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, existing[0].id))
      .returning({ id: submissions.id, publicId: submissions.publicId });
    return { id: row.id, publicId: row.publicId, action: "updated" as const };
  }
  const [row] = await db
    .insert(submissions)
    .values({
      type: "intel",
      status: "approved",
      payload,
      publishedAt: new Date(),
    })
    .returning({ id: submissions.id, publicId: submissions.publicId });
  return { id: row.id, publicId: row.publicId, action: "inserted" as const };
}

async function upsertLostAddress(entry: LostAddress): Promise<string | null> {
  const chain = entry.chain.toLowerCase().trim();

  const [existing] = await db
    .select({ id: addresses.id })
    .from(addresses)
    .where(
      and(
        eq(addresses.chain, chain),
        sql`lower(${addresses.address}) = lower(${entry.address})`,
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(addresses)
      .set({
        label: entry.label,
        notes: entry.notes,
        category: "lost",
        ownerName: entry.ownerName,
        balanceEstimateUsd: entry.balanceEstimateUsd.toString(),
        nativeAmount: entry.nativeAmount.toString(),
        nativeSymbol: entry.nativeSymbol.toUpperCase(),
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
      category: "lost",
      ownerName: entry.ownerName,
      balanceEstimateUsd: entry.balanceEstimateUsd.toString(),
      nativeAmount: entry.nativeAmount.toString(),
      nativeSymbol: entry.nativeSymbol.toUpperCase(),
    })
    .onConflictDoNothing()
    .returning({ id: addresses.id });
  if (inserted) return inserted.id;

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

async function main() {
  let intelInserted = 0;
  let intelUpdated = 0;
  let addrLinked = 0;
  let addrSkipped = 0;

  for (const c of cases) {
    const payload: IntelPayload = {
      ...c.intel,
      personas: c.intel.personas ?? LOST_DEFAULT_PERSONAS,
    };
    const sub = await upsertSubmission(payload);
    if (sub.action === "inserted") intelInserted++;
    else intelUpdated++;
    console.log(
      `  ${sub.action.padEnd(8)} /intel/${sub.publicId}  ${payload.headline}`,
    );

    for (const entry of c.addresses) {
      const addressId = await upsertLostAddress(entry);
      if (!addressId) {
        console.warn(`    SKIP — address upsert failed: ${entry.address}`);
        addrSkipped++;
        continue;
      }
      await db
        .insert(intelAddresses)
        .values({ submissionId: sub.id, addressId, role: "subject" })
        .onConflictDoNothing();
      addrLinked++;
      console.log(
        `    linked  ${entry.chain}:${entry.address.slice(0, 12)}…  $${entry.balanceEstimateUsd.toLocaleString()}  ${entry.label.slice(0, 60)}`,
      );
    }
  }

  console.log(
    `\n✓ ${cases.length} lost-crypto cases processed (${intelInserted} new intel, ${intelUpdated} updated, ${addrLinked} address links, ${addrSkipped} skipped).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
