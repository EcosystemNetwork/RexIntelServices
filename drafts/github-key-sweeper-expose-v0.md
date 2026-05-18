---
title: "A GitHub-leaked private key turned one founder's wallet into a 10-day automated paycheck for a vanity-branded drainer crew — and 195 other victims hit the same operator sink in four days"
standfirst: "Inside an actively-operational, Scam-Sniffer-unattributed drainer aggregation wallet with a vanity-mined `aAaAaAaA` suffix — 196 inbound victim flows in four days, 47 ERC-20 tokens currently parked, fanning out at 1.4 transactions per minute as of publish."
status: draft-v0
date: 2026-05-18
case_file: project_github_key_sweeper_case.md
---

# A GitHub-leaked private key turned one founder's wallet into a 10-day automated paycheck for a vanity-branded drainer crew — and 195 other victims hit the same operator sink in four days

*Inside an actively-operational, Scam-Sniffer-unattributed drainer aggregation wallet with a vanity-mined `aAaAaAaA` suffix — 196 inbound victim flows in four days, 47 ERC-20 tokens currently parked, fanning out at 1.4 transactions per minute as of publish.*

---

On May 18, 2026 at 22:33:47 UTC, a multi-chain crypto founder — anonymous for his protection — watched a Crypto.com deposit of 0.00860779 ETH arrive in one of his Ethereum wallets. Twelve seconds later, before he could move it, the entire balance left for an address he had never authorized.

The destination wallet — `0x116C28e6DCABCa363f83217C712d79DCE168d90e` — had been created in the same block as the inbound deposit. It existed for exactly two transactions: one to receive his funds, one to forward them onward. Twelve seconds after that, it forwarded 0.00757485 ETH (the deposit minus gas) to a second address whose forty-character hexadecimal identifier ends, very deliberately, in **`aAaAaAaA`** — eight alternating-case characters that no random Ethereum address produces by accident.

That second address — the operator wallet, the aggregation point — is `0x63825239F09d8EC83bc556EC32B7773A8aAaAaAa`. As of this writing, it has received **196 inbound transactions** from **196 distinct per-victim forwarder wallets** in approximately **four days**. It is currently holding **47 different ERC-20 tokens** taken from those victim wallets. It is, at the moment of publication, cashing them out at a rate of approximately **1.4 transactions per minute** to a fan-out of more than 1,400 downstream addresses.

Neither Etherscan nor Scam Sniffer nor Chainabuse has labeled this wallet. RexIntel Investigations Desk is, to the best of our knowledge as of this writing, the first to name it in public.

This is the story of how an industrial-scale GitHub-leaked-private-key sweeper operation drained one founder's wallet five times in ten days — and what the on-chain evidence reveals about the crew running it.

---

## The participant's wallet — and the bot that was watching it

The founder is a multi-chain crypto-native operator who, in the course of normal use, funds an Ethereum-mainnet hot wallet from a Crypto.com retail account. The wallet was created on **May 8, 2026 at 20:21 UTC**, ten days before the events described in this article. It is one of a number of wallets he operates across multiple chains.

Between May 8 and May 18, the participant funded that wallet from Crypto.com on five separate occasions. The exchange-side withdrawal each time arrived as one or two on-chain transfers from a Crypto.com hot wallet (labeled "Crypto.com 12" on Etherscan). The participant's intent, in each case, was to use the funds for a subsequent on-chain action: a swap, a contract interaction, a transfer to another personal wallet.

He never got the chance. On every single one of those five occasions, the entire balance left the wallet — to a different destination each time — before he could complete the intended action.

| Date / time (UTC) | Crypto.com deposit | Sweep destination | Lag |
|---|---|---|---|
| 2026-05-08 20:21 + 21:01 | 0.0397 + 0.00728 ETH | `0x128e2D02…` | 10 min |
| 2026-05-09 02:48 | 0.137 ETH | `0x411Afd3a…` | 4 min |
| 2026-05-09 17:56 | 0.133 ETH | `0x61974C09…` | 27 min |
| 2026-05-15 03:47 | 0.130 ETH | `0xe71a7BD1…` | 48 min |
| 2026-05-18 22:33 | 0.00861 ETH | `0x116C28e6…` | sub-minute (same block) |

Total drained: approximately **0.456 ETH, or roughly $1,500–$1,600 at the prevailing exchange rate**, across five sweep events, five different destination wallets, ten days.

Three patterns matter:

1. **Every destination wallet is different.** This is the per-victim, per-event forwarder pattern — a hallmark of drainer-as-a-service infrastructure where the operator spawns a brand-new wallet for each individual sweep event in order to fragment the cash-out trail.
2. **Every sweep takes the entire balance minus gas.** The bot does not skim, does not wait for a threshold, does not selectively target token types — it sweeps the wallet to zero on every inbound deposit.
3. **The lag time compresses over the ten-day window.** The first sweep took ten minutes. By the fifth sweep, the bot was firing in the same Ethereum block as the inbound deposit — sub-minute latency. The operator's monitoring infrastructure was, in some sense, learning the participant's pattern. Or — more plausibly — graduating from polling-based monitoring to mempool-based monitoring once the wallet was confirmed as a recurring source of funds.

The participant did not initially recognize what he was seeing. Most cryptocurrency users, when funds disappear from a wallet, suspect themselves first: did I sign something I shouldn't have, did I use a phishing site, did I authorize a malicious approval. The pattern of "Crypto.com deposit → instant sweep, every single time, to a different address" only becomes legible when laid out as a chronology. It is, in retrospect, the classic and unambiguous signature of a **compromised-private-key sweeper** — an attacker who possesses the wallet's signing authority and is monitoring it continuously for any inbound value.

The vector in this case, confirmed by the participant, was a **private key inadvertently committed and pushed to GitHub** and subsequently harvested by an automated scraper. The specific commit and repository remain under investigation by the participant at the time of publication; the on-chain pattern is consistent with the well-documented behavior of public-Git-event firehose harvesters of the kind described below.

---

## The operator wallet — vanity-branded, unattributed, hot

The five sweep destinations from the participant's wallet were each used exactly once, then abandoned. Following the most recent one (`0x116C28e6…`) on-chain reveals that twelve seconds after receiving its single deposit, it forwarded the funds to a single address:

`0x63825239F09d8EC83bc556EC32B7773A8aAaAaAa`

This is the operator wallet — the aggregation point.

**Vanity branding.** The trailing eight characters — `aAaAaAaA` — are not random. EIP-55 checksum casing produces case patterns derived from the keccak-256 hash of the lowercase address, and the probability of an arbitrarily-chosen address producing eight consecutive alternating-case `a`/`A` characters is approximately one in 2^32 — about one in four billion. Generating such an address requires a vanity-address miner running for hours to days on commodity hardware. Drainer crews use vanity-mined addresses as cosmetic branding — a signature, a flag — in the same way that the documented Pink Drainer crew used the trailing-zero pattern `0x0000…0000` and the documented Inferno Drainer crew used distinctive prefix patterns in its known wallets. The vanity work is a marker of an established, multi-victim, professional-grade operation rather than an amateur opportunist.

**Operating tempo.** Public Etherscan data on the operator wallet, as of publication time:

- **First activity:** approximately four days ago — placing the wallet's launch around **2026-05-14**.
- **Total transactions:** **1,625**.
- **Inbound transactions:** **196** — the per-victim-forwarder inbounds, one per drain event.
- **Outbound transactions:** **1,435** — the cash-out fanout.
- **Current ERC-20 token holdings:** **47 distinct tokens** parked in the wallet, swept from victim wallets and not yet forwarded.
- **Current ETH balance:** approximately 0.06 ETH (~$130) — kept deliberately low, with the bulk of incoming value forwarded out within minutes of arrival.

**The batch-sweep signature.** On a single recent Ethereum block (`2026-05-18 22:32:23 UTC`), the operator wallet received **fourteen** distinct inbound transactions — fourteen different per-victim forwarders, each carrying a separate drain payload, all arriving in the same block. The following block (`22:32:35 UTC`, twelve seconds later) brought ten more. **Twenty-four victims swept in ninety-six seconds**, immediately before the participant's drain at `22:33:59 UTC`. This is not the cadence of an individual attacker monitoring a small number of wallets. This is the cadence of an automated scraper monitoring a large list of compromised keys and firing batched sweeps when any of them receives value.

**No public label.** As of this writing, the operator wallet carries **no Etherscan label**, **no Scam Sniffer tag**, and **no Chainabuse listing**. The wallet is four days old. The threat-intelligence industry has not caught up to it yet. RexIntel's Investigations Desk is, to the best of our knowledge, the first public reference to it as drainer-aggregation infrastructure.

That gap — between when a drainer wallet becomes operational and when the threat-intel industry tags it — is one of the structural opportunities our investigations desk exists to fill.

---

## The attack class: GitHub-leaked private keys and post-EIP-7702 sweepers

The compromise pattern documented in this case file fits a well-known and increasingly aggressive 2025–2026 attack class. Three converging dynamics make it the dominant individual-wallet-compromise vector of the year:

**1. Automated harvesting of public Git commits.** Tools originally built for defensive secret-detection — Truffle Security's `trufflehog`, GitGuardian's scanner, Gitleaks, and the GitHub-native secret-scanning push — are equally usable offensively. Attackers run continuous scans of the public GitHub event firehose (millions of new commits per day) looking for newly-pushed `.env` files, hardcoded private keys in deployment scripts, `hardhat.config.js` files with secrets in plaintext, accidentally-committed CI logs, and so on. The window from "key pushed to a public repo" to "key acquired by a sweeper bot" is, by widely-cited public testing, **measured in seconds**.

**2. Mempool-monitoring sweeper bots.** Once a key is acquired, the attacker does not need to drain the wallet immediately if it is empty. Instead, a sweeper bot is configured to monitor the wallet for any inbound value — either via JSON-RPC polling, or via mempool-level subscription. Any inbound transfer triggers an immediate outbound transfer of the full balance to an attacker-controlled forwarder. This is documented operationally in MetaMask's own published help center ("What to do if you have a sweeper bot on your account") and in the Flashbots Collective's research thread on the topic.

**3. EIP-7702 has made it cheaper.** Ethereum's Pectra upgrade (activated May 2025) introduced EIP-7702, which permits an externally-owned account (EOA) to temporarily delegate its execution authority to a smart contract. Sweeper operators have aggressively adopted EIP-7702 to atomically batch the "receive funds → sweep funds" sequence into a single contract-mediated operation, dramatically lowering the gas costs of running a multi-thousand-wallet monitoring operation and tightening the response window from "seconds" to "same block." Public reporting from AMBCrypto, Bitget, and others has documented at least $150,000+ in confirmed post-Pectra EIP-7702 sweeper losses across multiple operators, with the actual figure almost certainly an order of magnitude higher.

The participant's wallet exhibits the full signature of this attack class: a compromised key (not yet definitively traced to a specific repository at the time of this writing); five sequential sweep events on five separate deposits; sub-minute response latency by the fifth iteration; aggregation at a vanity-branded operator wallet shared with at least 195 other victims. The on-chain pattern is essentially diagnostic.

---

## The cohort: the participant is one of at least 196

The operator wallet has received 196 inbound transactions in approximately four days. Each is, by the per-victim-forwarder pattern documented above, almost certainly a distinct compromised wallet — a separate individual who, somewhere in the last few weeks, leaked a private key in a way that this crew's harvester found.

A small sample of the most recent inbound flows (drawn from public Etherscan transaction-list data at the time of writing) gives a sense of the scale and shape of the cohort:

- Inbound ETH amounts range from **fractions of a cent** (0.000003 ETH — a sub-$0.01 sweep) to roughly **$30 per event**. The bot does not discriminate.
- A single Ethereum block frequently contains **ten to fourteen** distinct inbound flows — the operator's monitoring infrastructure is firing batched sweeps multiple times per minute.
- The geographic and behavioral fingerprint of the victims is opaque from on-chain data alone. The funding-source patterns visible at the second-level upstream (i.e., who funded the victim wallets in the first place) include retail exchanges (Crypto.com, Coinbase, Binance, etc.) and other personal wallets, consistent with a victim population that is broadly distributed across normal crypto-using individuals.

The participant in this case file is, by these counts, approximately the **196th identifiable victim in four days** of an operation running at industrial scale. Each of the other 195 has, somewhere, a private key sitting in a public-internet location where an automated harvester found it — and most of them do not yet know.

---

## What we are not saying — and what we are

We are not asserting that this operator is identical to any specific previously-documented drainer-as-a-service crew (Pink Drainer, Inferno Drainer, Angel Drainer, Drainware, others). The infrastructure pattern — per-victim forwarder, vanity-branded aggregation sink, immediate cash-out fanout — is shared across the named families and any number of unnamed ones. RexIntel's evidence at this stage is sufficient to identify the operator wallet as drainer-aggregation infrastructure but not, by itself, sufficient to attribute it to a named family.

We are not asserting the identity of the harvesting tool, the specific GitHub repository, or the exact commit at which the key was first pushed. The participant has confirmed GitHub as the leak surface but the specific source-side artifact remains under investigation at the time of publication.

We are saying:

- A multi-chain crypto founder's Ethereum-mainnet hot wallet was compromised at some point on or before **2026-05-08 21:11 UTC**.
- Between that moment and **2026-05-18 22:33 UTC**, the wallet was swept on **five separate occasions** by automated sweeper infrastructure, totaling approximately **0.456 ETH (~$1,500–$1,600)** in cumulative drain.
- The most recent sweep routed funds via per-victim forwarder `0x116C28e6DCABCa363f83217C712d79DCE168d90e` to operator wallet **`0x63825239F09d8EC83bc556EC32B7773A8aAaAaAa`**.
- The operator wallet has, in approximately four days of operation, received **196 inbound flows from 196 distinct per-victim forwarder wallets**, currently holds **47 distinct ERC-20 tokens**, and is fanning out cash-out transactions at a rate of approximately **1.4 per minute** as of publication.
- The operator wallet carries **no public attribution label** from Etherscan, Scam Sniffer, or Chainabuse as of this writing.

Each of these statements is independently verifiable on Ethereum mainnet via Etherscan or any equivalent block explorer.

---

## Methodology and limits

This article is based on:

- The participant's voluntary confirmation that the wallet in question is his and that the disappearance of funds on each of the five sweep dates was not authorized by him.
- Public Ethereum block-explorer data on the participant's wallet, the five sequential forwarder wallets, the operator wallet, and the operator wallet's outbound fanout — queried via Etherscan's public web interface.
- Public reporting on the GitHub-leaked-private-key attack class and the EIP-7702 sweeper subgenre from TRM Labs ("Drainware: Unfortunately, coming to a cryptocurrency wallet near you"), AMBCrypto ("New Ethereum feature backfires — $150K stolen in sweeper attacks post-Pectra upgrade"), Bitget News ("Ethereum's EIP-7702 Feature Abused in Wallet-Draining Attacks"), the Flashbots Collective ("Sweeper/Drainer infected multiple MM"), MetaMask's published help center documentation on sweeper-bot accounts, and Bernhard Mueller's published reverse-engineering analyses of the Inferno and Angel drainer-as-a-service operations.

We did not access the participant's device, repositories, or wallet directly. We have not, at the time of this publication, recovered the specific public-internet location at which the private key was exposed; that investigation is ongoing. We have not contacted the operator of the vanity-branded sink wallet for comment, consistent with the RexIntel Investigations Desk's policy on actively-operational malicious infrastructure. We have not contacted Etherscan or Scam Sniffer to seek a labeling action in advance of publication, though we expect this article to function as that notice.

The participant remains anonymous at his request. Verification of his identity, his ownership of the wallet, his deposit history with Crypto.com, and his consent to publication is held by RexIntel's Investigations Desk and available to credentialed legal, journalistic, and blockchain-forensics counterparties on request.

---

## What we are asking

**If you have been swept by a similar pattern in May 2026** — Crypto.com or other exchange deposit instantly disappearing on arrival, to a different destination each time, on a wallet whose private key you may have exposed in a repository, a config file, or a CI log — you are likely one of the 196 other victims of this exact operator's infrastructure. Email **rexintelservices@proton.me**. We will cross-reference your wallet against the operator's inbound list and aggregate the cohort.

**If you are Scam Sniffer, ZachXBT, MetaSleuth, TRM Labs, Chainalysis, PhishDestroy, Crystal Intelligence, SlowMist, or another threat-intelligence or attribution party** — we would like to support an attribution call on this operator wallet, and to compare your corpora for prior overlap with the vanity-pattern signature. Reach us at **rexintelservices@proton.me**.

**If you are an exchange compliance team** (Crypto.com, Coinbase, Binance, Kraken, Bitstamp, OKX, Bybit, KuCoin) — the cash-out fanout from `0x63825239F09d8EC83bc556EC32B7773A8aAaAaAa` will, within a small number of hops, route to deposit addresses on your platforms. We are happy to share our outbound-trace data on a credentialed basis.

**If you operate GitHub** — the upstream-side intervention for this attack class is a continuous-scanning posture on the public commit firehose for known cryptocurrency-key formats, with automated repository-quarantine on detection. Public secret-scanning already covers parts of this; pre-push prevention has been shown to be materially more effective than post-push detection. We are willing to assist with a write-up of victim-side evidence.

**If you have ever committed a private key to a public repository, even briefly, even years ago, even immediately reverted** — assume that key is compromised. Rotate, do not reuse, and audit any wallet that has ever received funds at that address.

---

**Drainer infrastructure addresses (for cross-reference):**

```
0x63825239F09d8EC83bc556EC32B7773A8aAaAaAa   (operator sink — vanity, 196 inbound, no public label)
0x116C28e6DCABCa363f83217C712d79DCE168d90e   (per-victim forwarder — sweep #5, 2026-05-18)
0x128e2D02…                                  (per-victim forwarder — sweep #1, 2026-05-08)
0x411Afd3a…                                  (per-victim forwarder — sweep #2, 2026-05-09)
0x61974C09…                                  (per-victim forwarder — sweep #3, 2026-05-09)
0xe71a7BD1…                                  (per-victim forwarder — sweep #4, 2026-05-15)
```

---

— RexIntel Investigations Desk
2026-05-18

---

**Contact:** rexintelservices@proton.me

For end-to-end-encrypted source protection, write to us from your own ProtonMail account. Tips, evidence, corrections, and right-of-reply communications all welcome. We respond to credentialed legal and journalistic counterparties on identity-verification requests for the underlying source materials referenced in this investigation. Follow [@rexintelservice](https://x.com/rexintelservice) for follow-up reporting on this operator wallet and the broader GitHub-leaked-key sweeper ecosystem.
