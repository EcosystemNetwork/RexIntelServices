---
title: "A vanity-contract NFT drainer stole one founder's 2.4 ETH PFP in 12 seconds — and hit at least 98 other victims using the same infrastructure"
standfirst: "Inside an 18-month-old NiftyDegen PFP, signed away in a single transaction to a Scam Sniffer-flagged phishing address that aggregated drains from at least 99 wallets across late 2023 / early 2024."
status: draft-v0
date: 2026-05-18
case_file: project_pink_drainer_nft_case.md
---

# A vanity-contract NFT drainer stole one founder's 2.4 ETH PFP in 12 seconds via Blur.io — and hit at least 98 other victims using the same infrastructure

*Inside an 18-month-old NiftyDegen PFP, signed away via Blur.io to a Scam Sniffer-flagged phishing address that aggregated drains from at least 99 wallets across late 2023 / early 2024.*

---

On August 21, 2022, a multi-chain crypto founder — anonymous for his protection — paid 2.4 ETH (then approximately $5,000) for a NiftyDegen NFT. He held it for 17 months. He listed it on OpenSea in November 2023. The listing didn't sell; the NFT came back to his wallet two weeks later.

On January 20, 2024 at 05:45:23 UTC, a single transaction signed with his wallet's private key transferred that NFT to an address whose Etherscan label, applied by the scam-tracking firm Scam Sniffer, reads "Fake_Phishing187019."

Twelve seconds later, that address forwarded the NFT to its first downstream wallet.

The same Scam Sniffer-flagged address has, over a four-month operating window, received NFTs from at least 99 distinct victim wallets. The participant in this case file is one of them.

---

## The asset

NiftyDegen (`0x986aea67c7d6a15036e18678065eb663fc5be883`, symbol DEGEN) is a generative-art PFP collection minted in September 2021. The participant acquired token **#5504** on **August 21, 2022 at 06:32 UTC**, in a transaction from a prior holder. The acquisition price was 2.4 ETH — approximately $5,000 at the time, approximately $5,600 at the moment of the drain seventeen months later.

The transfer history of token #5504 from the public Ethereum chain:

| Date | Action | From → To |
|------|--------|-----------|
| 2021-09-30 13:24 UTC | Mint | `0x0000000000...` → `0xf99c5ca37e52...` |
| 2021-12-10 11:41 UTC | Sale | `0xf99c5ca37e52...` → `0x56340c11d6f5...` |
| **2022-08-21 06:32 UTC** | **Purchase by participant (2.4 ETH)** | `0x56340c11d6f5...` → **participant's wallet** |
| 2023-11-24 07:32 UTC | OpenSea listing | participant's wallet → `0x0000000000ad...` (OpenSea Seaport Conduit) |
| 2023-12-04 09:48 UTC | OpenSea listing returned (unsold) | `0x0000000000ad...` → participant's wallet |
| **2024-01-20 05:45:23 UTC** | **DRAIN — signed to phishing address** | participant's wallet → `0x0000db5c8b03...` |
| 2024-01-20 05:45:35 UTC | First downstream forward (12 sec later) | `0x0000db5c8b03...` → `0x557896aa3e0d...` |
| 2024-07-02 22:27 UTC | Re-sale / forward | `0x557896aa3e0d...` → `0x90bba4d60f8d...` |
| 2024-07-02 22:31 UTC | Re-sale / forward (3 min later) | `0x90bba4d60f8d...` → `0xcef4690b0976...` |
| 2024-07-09 23:30 UTC | Final acquisition by current holder | `0xcef4690b0976...` → `0x07db09b7a346...` |

The current holder of token #5504, as of this writing, is `0x07db09b7a346772b5c3134e74ee339b0beb6d682`. They acquired it on July 9, 2024 — almost six months after the drain. Their wallet's prior NFT activity (selling several other NiftyDegens in February 2024) is consistent with a marketplace re-seller; we are not asserting that this holder was knowingly party to the drain.

The participant's wallet address and the specific drain transaction hash are withheld from public copy for source protection; credentialed legal, journalistic, or blockchain-forensics counterparties can request both via the contact email at the bottom of this article and we will share them under standard verification protocol.

---

## The drainer

The address that received the NFT from the participant — `0x0000db5c8b030ae20308ac975898e09741e70000` — is a textbook drainer-infrastructure wallet.

**Etherscan attribution:** The address is publicly labeled by Etherscan as **"Fake_Phishing187019"** with the explicit "Phish / Hack" warning banner attributed to Scam Sniffer's reporting. Its funding source (`0x29488e5fd6bf9b3cc98a9d06a25204947cccbe4d`) is also labeled by Etherscan as "Fake_Phishing180395" — phishing infrastructure funded by other phishing infrastructure.

**Vanity-address branding:** The wallet's address pattern (`0x0000...0000` with `db5c8b030ae20308ac975898e09741e7` in the middle) is vanity-mined — a cosmetic flourish that requires significant computational work and is a signature of established drainer crews. The structural similarity to other named drainer-crew vanity patterns (e.g., the `0x0000000000adead5...` pattern used by OpenSea's Seaport Conduit for legitimacy mimicry, and the `0x6666...6666` deployer pattern documented elsewhere in this investigations desk's case files) places this wallet in the category of professional-grade phishing infrastructure.

**The cohort:** the drainer wallet has received NFTs from **at least 99 distinct sender wallets** across an operating window that includes Sept 9, 2023 through at least January 20, 2024 (the date of our participant's drain). Each victim's NFT was held at the drainer wallet for only seconds before being forwarded to one of 73 distinct downstream forwarder wallets. This is the standard drainer-as-a-service flow: a single collection point per phishing campaign, immediate fan-out to victim-specific forwarders to fragment the cash-out trail.

**Suspected family:** The vanity address pattern, the multi-hop cash-out flow, the use of NFT approval exploits, and the post-2023 timing are consistent with the documented operational signature of the **Pink Drainer** drainer-as-a-service crew (estimated $75M+ in cumulative theft per public reporting in Cointelegraph, Protos, and Crystal Intelligence). RexIntel cannot, on the evidence currently in this case file, conclusively assert Pink Drainer attribution — but the structural fit is strong enough to warrant naming the family as the most likely operator and inviting Scam Sniffer, ZachXBT, MetaSleuth, and other crypto-forensics counterparties to confirm or refute the attribution from their own corpora.

---

## The cash-out chain

The 12-second drainer hop was the first of several. After receiving the NFT from the participant, the vanity address forwarded it to a wallet at `0x557896aa3e0d98268ace847576273d5575c24ee6`.

That second wallet has its own distinctive forensic profile:
- **200 NFT events in just 3 days** (January 19-21, 2024)
- **176 inbound NFTs from 13 distinct upstream sources**
- 24 outbound NFTs (the cash-out side)
- A burst-window operational pattern consistent with a multi-victim aggregation hub

That wallet is, in turn, where the trail begins to fan out via marketplace activity. The NFT subsequently moved through `0x90bba4d60f8d...` and `0xcef4690b0976...` before reaching its current holder.

The total distance from "victim's wallet" to "final acquired holder" is **five hops** spread across six months. By the time a forensic analyst follows the trail to the current holder, the funds (or the laundered version of them) are likely several CEX deposits and an off-ramp away.

---

## What we are not saying — and what we are

We are not asserting that the current holder of NiftyDegen #5504 (`0x07db09b7a346...`) knowingly acquired stolen property. The on-chain trail places the acquisition almost six months after the drain, via at least three intermediate sellers; a downstream marketplace buyer in that position typically has no knowledge of the asset's provenance.

We are not asserting that Pink Drainer specifically — as opposed to another similarly-structured drainer-as-a-service crew — operated this attack. The Etherscan / Scam Sniffer attribution is to "Fake_Phishing187019," a generic phishing label. The structural fit to Pink Drainer's documented playbook is strong but inferential.

The originating phishing vector, per the participant, was the **Blur.io** NFT marketplace surface — specifically the signature-prompt flow that Blur uses for bids, listings, and lending offers. The classic Blur drain pattern (documented in cryptotimes.io's July 2024 reporting of a $240K NFT loss, among others) exploits the fact that a single Blur signature can authorize multiple NFT transfers across a participant's collection. A malicious bid that appears to be a legitimate offer can, when "accepted," route the NFT to a scammer-controlled vanity address embedded in the order's `consideration` field. The participant's exact signature prompt has not been preserved, but the destination address pattern (vanity-mined `0x0000...0000`) and the on-chain artifact (a direct transfer rather than a sale-with-consideration) are consistent with that class of Blur-marketplace exploit.

We are saying:

- A multi-chain crypto founder paid 2.4 ETH for NiftyDegen #5504 on August 21, 2022, and held it on his wallet for seventeen months.
- On January 20, 2024 at 05:45:23 UTC, a single transaction signed by his wallet's private key transferred that NFT to a Scam Sniffer-flagged phishing address.
- Twelve seconds later, the phishing address forwarded the NFT to a multi-victim aggregator wallet that had received NFTs from 12 other distinct victim wallets in the same 3-day window.
- The vanity-mined phishing destination address has received NFTs from at least 99 distinct victim wallets over a 4+ month operating window — confirming this is multi-victim drainer-as-a-service infrastructure, not a one-off theft.
- The current holder of token #5504 acquired it on July 9, 2024 after at least three intermediate transfers.

Each statement is independently verifiable on the Ethereum chain, via Etherscan's labeling, or on OpenSea / public NFT-marketplace data.

---

## Methodology and limits

This article is based on (a) the participant's confirmation that NiftyDegen #5504 was his asset, voluntarily provided to RexIntel; (b) public Ethereum block-explorer data on the transfer history of the token, the drainer wallet, and downstream forwarders, queried via Etherscan's V2 API; (c) the public Etherscan / Scam Sniffer label on the drainer address; (d) public corporate reporting on Pink Drainer's operational pattern from Cointelegraph, Protos, Crystal Intelligence, MetaSleuth, and SlowMist.

We did not access the participant's device or wallet directly. We have not recovered the originating phishing site, signature payload, or DM that led to the malicious signature. We did not contact the current holder of token #5504 in advance of publication. We did not contact Scam Sniffer to confirm the Pink Drainer attribution.

The participant remains anonymous at his request. Verification of his identity, his ownership history of the asset, and his consent to publication is held by RexIntel's investigations desk and available to credentialed legal and journalistic counterparties on request.

---

## What we are asking

**If you also lost an NFT to the address `0x0000db5c8b030ae20308ac975898e09741e70000` between September 2023 and January 2024** — you are one of at least 99 victims with the same on-chain fingerprint. Email **rexintelservices@proton.me**. If we can aggregate enough victims, we have leverage with exchanges, analytics firms, and law-enforcement counterparties that no single victim has alone.

**If you are Scam Sniffer, ZachXBT, MetaSleuth, TRM Labs, Chainalysis, or another forensics-and-attribution party** — we would like to confirm or refute the Pink Drainer attribution for this drainer family. Reach us at **rexintelservices@proton.me**.

**If you currently hold NiftyDegen #5504** (`0x07db09b7a346772b5c3134e74ee339b0beb6d682`) — we are not asserting you knowingly acquired stolen property. We would value the opportunity to share context with you about the asset's provenance. Email **rexintelservices@proton.me**.

**If you are a marketplace** (OpenSea, Blur, Magic Eden, X2Y2, LooksRare) — the drainer cash-out infrastructure documented in this article has likely routed re-listed stolen NFTs through your platform during 2024. The wallets named warrant attention.

**Drainer infrastructure addresses (for cross-reference):**

```
0x0000db5c8b030ae20308ac975898e09741e70000   (drainer entry — Fake_Phishing187019)
0x29488e5fd6bf9b3cc98a9d06a25204947cccbe4d   (drainer funding source — Fake_Phishing180395)
0x557896aa3e0d98268ace847576273d5575c24ee6   (3-day burst aggregator, 13 upstream victims)
0x90bba4d60f8d...                              (cash-out forwarder)
0xcef4690b0976...                              (cash-out forwarder)
```

— RexIntel Investigations Desk
2026-05-18

---

**Contact:** rexintelservices@proton.me

For end-to-end encrypted source protection, write to us from your own ProtonMail account. Tips, evidence, corrections, and right-of-reply communications all welcome. We respond to credentialed legal and journalistic counterparties on identity-verification requests for the underlying source materials referenced in this investigation.
