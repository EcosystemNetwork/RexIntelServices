---
title: "Consensys-funded research call preceded a fully automated multi-chain drain. The same operator is hitting victims today."
standfirst: "How a $54 user-research interview became the most expensive Zoom call of one crypto founder's life — and exposed an active drainer ring."
status: draft-v0
date: 2026-05-18
case_file: project_despark_interview_drain.md
---

# Consensys-funded research call preceded a fully automated multi-chain drain. The same operator is hitting victims today.

*How a $54 user-research interview became the most expensive Zoom call of one crypto founder's life — and exposed an active drainer ring.*

---

A multi-chain crypto founder, anonymous for his protection, accepted a paid user-research interview booked through a Consensys-funded recruitment platform on 2025-05-12. The mission was titled "Web3 Identity." The fee was $54 USDC. The interviewer was introduced as a Consensys/MetaMask employee.

Forty-seven minutes after the call ended, his Solana wallet executed eight transactions in eighty seconds. By the time the bot finished, every liquid asset in the wallet was gone, swept to a one-time burner address controlled by an operator that, as of this writing, is still draining victims in real time.

He had told the researcher, on camera, what was in that wallet.

**At a glance:**

- **Consensys-Mesh-funded user-research platform.** Despark.io, the firm that booked the paid interview, is a Boston-based research recruiter whose publicly disclosed investors include Consensys Mesh — the venture arm of the company that makes MetaMask.
- **Researcher introduced as a Consensys/MetaMask employee.** Despark's co-founder later confirmed via email that the researcher was a verified Consensys employee with Slack and corporate-email accounts on file.
- **Wallet contents disclosed on camera.** Over a recorded ~46-minute Zoom call, the participant voluntarily catalogued his multi-chain wallet providers, his approved DeFi positions, and the rough scale of his holdings to the researcher.
- **Fully automated drain, 47 minutes after the call ended.** Eight transactions in 80 seconds emptied his Solana wallet to a one-time burner address — every transaction signed by his own Phantom keypair as fee payer.
- **Drain enabled by prior key theft, not a session compromise.** Solana has no ERC-20-style approvals; the operator already held the participant's private key when the call began. The call's role was either confirmation or trigger.
- **Same MetaMask wallet re-hijacked four months later.** In September 2025, the Polygon wallet the participant had disclosed in Despark's screener was authorized via EIP-7702 to two delegate contracts whose creators are labeled "Fake_Phishing" by Etherscan's community attribution system. One of those delegations is still live as of publication.
- **Despark released only one side of the recording.** After a California two-party-consent request, the company provided only the participant's own audio and a transcript of his own speech, withholding the researcher's video, audio, and questions, and attributing the partial release to lawyer review.
- **The operator's infrastructure is still active.** Two wallets in the same Solana Address Lookup Table batch as the participant's drain destination have received more than $27,000 in SOL inflows within the last 96 hours.
- **Four other addresses in the same batch share the participant's drainer-sink fingerprint.** Single-day activity envelopes, low signature counts, zero ending balances — a cohort of likely co-victims who may not yet know they were hit.

---

## The mission

Despark.io is a paid user-research firm that recruits crypto-active participants for product interviews. Its participants are vetted by demographics *and* on-chain wallet activity — a differentiator the company markets explicitly versus generic research-recruiter platforms like User Interviews or Respondent.io. Despark currently lists ~7,000 verified web3 users, and claims clients including CoW Protocol, Runtime Verification, and API3, with internal-network exposure to Consensys-funded products including MetaMask.

The founder — referred to here as the participant, for source-protection reasons — had completed two prior Despark missions before May 12, 2025. His third one was titled "Looking to speak to MetaMask users!" and was conducted over Zoom on the morning of May 12, recorded per Despark's standard process.

Over the course of a ~46-minute interview, the participant — comfortable, professional, treating it as a real research conversation — voluntarily catalogued the categories of his crypto operational footprint to the researcher: the wallet providers he used across multiple chains, the categories of DeFi venues where he held approved trading positions, the rough scale of his holdings, and the personal-opsec practices he relied on. Specific project names and exact wallet identifiers are withheld here for source protection; the disclosure pattern, not its contents, is what matters for what followed.

According to Despark's later metadata review, no chat messages were exchanged during the call and no screen was shared.

The call ended somewhere between 10:55 and 11:00 AM Pacific Time. Despark's automated "Mission Complete" email — which fires after the participant is credited — landed in the participant's inbox at **11:15 AM PT**.

---

## The 47 minutes

At **11:45:43 AM PT** — 30 minutes 43 seconds after the Mission Complete email, and (per the participant's recollection) approximately 47 minutes after the researcher hung up — the participant's Phantom wallet on Solana (`HeJkAGASQu8esawJyrEW4WFkdoqTpsZSGatkoFb4XqVa`) began signing transactions. Every claim in this section is independently verifiable by loading that address on any Solana block explorer and reading the May 12, 2025 transaction list.

The participant did not sign them. He was not at his computer. His Phantom wallet's private key was. Whoever held that key had decided, at that moment, to start.

Over the next 1 minute and 53 seconds, the wallet emitted eight transactions in unbroken sequence. Each one was signed using the participant's own Phantom keypair as fee payer — meaning whoever was executing them had full custody of the private key, not merely an approved swap signature (a mechanism that does not exist on Solana the way it does on Ethereum). Each transaction routed through a custom drainer router (`6m2CDdhRgxpH4WjvdzxAYbGxwdGUz5MziiL5jek2kBma`) that liquidated one of the wallet's token positions to native SOL, with a small fee skimmed to a persistent operator wallet (`9yj3zvLS3fDMqi1F8zhkaWfq8TZpZWHe6cz1Sgt7djXf`) on each swap.

The drain sequence, reconstructed from Solana RPC:

| Time (PT) | Action | Wallet SOL balance |
|----------|--------|--------------------|
| 11:45:43 | Token 7reSG61f… → 6p6xgHyF… via Raydium CLMM | 4.92 |
| 11:46:04 | Sell 4.4M HBoNJ5v8… → SOL | 7.27 |
| 11:46:15 | Sell 242K B5WTLaRw… → SOL | 9.13 |
| 11:46:26 | Sell 22.9 6p6xgHyF… → SOL | 10.78 |
| 11:46:37 | Sell 7,548 9wK8yN6i…Ebonk → SOL | 12.61 |
| 11:46:55 | Sell 2,400 Df6yfrKC…pump → SOL | 13.88 |
| 11:47:05 | Sell 1,124 CzLSujWB…pump → SOL | 15.15 |
| **11:47:36** | **15.110 SOL swept to `GmgHSpuXYejyfZ9E63YPR9XFdfHj4pyuu7cVu8jTrN9f`** | **0.036** |

The final sweep address, `GmgHSpuXYejyfZ9E63YPR9XFdfHj4pyuu7cVu8jTrN9f`, has exactly seven signatures in its entire history. All seven are on May 12, 2025. Its current balance is zero. This is a textbook one-time burner sink — created for one victim, used for one drain, then dormant forever after.

Two minutes after the drain landed there, at 11:49:38 AM PT, the 15.110 SOL was relayed forward to a consolidation wallet (`G2YxRa6wt1qePMwfJzdXZG62ej4qaTC7YURzuh2Lwd3t`), prepared by a separate operator relayer (`6vMuna31vRDs9u9RAEF8UeCSs9CNu6j4LkXpe4Ko1gBQ`) that constructed a Solana Address Lookup Table — a transaction-compression technique used when a batch of related operations is being prepared simultaneously.

That Lookup Table contained ten sink addresses.

The participant's was one of them.

---

## Despark.io is a Consensys-funded research network

To understand what kind of vendor relationship that interview represented, you have to look at who funds Despark.

Despark.io was co-founded in Boston by **Greg Eusden** (formerly Director of Product at SimpliSafe) and **Amar Kher** (formerly Global Head of Advertising Business Operations at Uber). The company has 2-10 employees per its LinkedIn. Its publicly disclosed investors include **Consensys Mesh** — the venture arm of Consensys, the company that makes MetaMask — and Qubic Labs. Consensys Mesh's own announcement of the Despark investment is on the public record, alongside the company's PitchBook and Crunchbase profiles.

This means: when a Despark mission is staffed by a "Consensys employee," that researcher and that platform and the eventual product the research feeds are not in an arms-length vendor relationship. They are all in the same network, funded by the same parent. A Consensys-affiliated researcher conducting a Consensys-themed mission via a Consensys-Mesh-portfolio platform is the structurally expected flow — not a red flag in itself.

What it does mean is that the controls around participant-facing data, researcher vetting, and call-content handling are *internal-Consensys-network controls*, not third-party-vendor controls. The threat model when a Consensys-Mesh-funded research firm with ~7 employees handles wallet-KYC'd participants and post-call disclosure data necessarily includes a single insider with access to both.

---

## What Despark said when the participant asked

After the drain, the participant emailed Despark's published support address. The thread was answered by **Greg Eusden**, co-founder of Despark, who confirmed via reply that the researcher was a verified Consensys employee with Slack and email accounts on file.

Asked how a drain could have followed from the call when no screen had been shared and no links had been clicked, Eusden wrote: "I glanced at the metadata, and I don't think you shared screen or interacted with anything on her behalf, so it's hard to know it's related to the interview." He noted that the researcher had interviewed "folks who I know for a fact have large value-holdings and we haven't had any issues so far."

The participant asked for a copy of the call video, citing California's two-party recording statute and his right as a recorded party to obtain a copy. Despark initially declined. After three months of follow-up, on 2025-08-18, the company released only the portion of the video in which the participant himself spoke, along with a transcript of only his own speech. The researcher's video portion, audio, and questions were withheld. Eusden attributed the partial release to lawyer review.

Receiving only one side of a recorded two-party conversation is not a position California's recording statute requires the participant to accept. It is, however, the position Despark has held since.

The participant's screener responses — the questions Despark sends prospective participants before booking the mission — included one wallet address, which Eusden confirmed was the only wallet identifier shared with the researcher via the platform: the Polygon-active MetaMask wallet `0x118EDd03335D07B498A511213cDb9FDfB448EcA3`.

That same wallet was later hijacked again, in a separate event, in September 2025 — via Ethereum's EIP-7702 mechanism, by delegate contracts both explicitly flagged as phishing operations by Etherscan's community-attribution system. More on that below.

---

## How the keys were actually compromised

The participant's initial working theory was that an AI-driven signature exploit had abused DEX approvals he had previously granted on Raydium and QuickSwap.

That theory is wrong, but in a way that matters.

Solana does not have ERC-20-style approvals. To swap on Raydium, the wallet's private key must sign each transaction at submission time. Every one of the eight drain transactions on May 12 was signed by the participant's Phantom keypair — visible on-chain as the fee payer for every transaction in the burst. Nobody can sign with that key unless they hold it.

What this means is: at some point before the call, the participant's Phantom private key had been exfiltrated. The drain wasn't enabled by any signature given *during* the call — Despark's metadata, on this narrow point, appears to be accurate. The drain was enabled by the participant's keys already being in the operator's possession. The call's role was either (a) confirmation — a watcher on the operator's side hearing the participant catalogue what was in the wallet and triggering the drain accordingly — or (b) trigger via timing — the operator running a scheduled extraction bot keyed to a specific UTC window (which is consistent with the same operator's subsequent behavior on the same wallet — see below).

Crypto information stealers that exfiltrate browser-extension wallet state — Phantom, MetaMask, Xverse — are a well-documented and growing attack class, often delivered via fake job applications, malicious Chrome extensions, and Discord links. The North Korean "Operation Dream Job" / "Contagious Interview" campaigns are the highest-profile instance, but the technique is now commoditized and used by mid-tier crypto-criminal actors across multiple jurisdictions. SlowMist, Mandiant, Sekoia, and TRM Labs have all published detailed write-ups of the malware families involved.

The unanswered question for the Despark case is: at what point, and through what channel, did this participant's Phantom keys get stolen — and is the same channel sourcing Despark's research recruits, or sourcing the researcher's call list, or sourcing nothing at all related to either?

We will return to this question once we've explained why the operator infrastructure is still alive.

---

## The drainer ring is still active right now

The Solana Address Lookup Table that the operator's relayer prepared at 11:48:14 AM PT on May 12, 2025 — the one used to compress the addresses for the participant's drain cash-out — contained ten distinct sink addresses. The participant's sink was one of them.

We profiled all ten.

| Address | Sig count | Activity range | Current balance | Read |
|---------|-----------|----------------|-----------------|------|
| `GmgHSpuXYejy…jTrN9f` | 7 | 2025-05-12 only | 0 SOL | Participant's drain destination (burner-sink pattern) |
| `4Z91xTzhDs7e…y7z2u` | 26 | 2025-05-12 only | 0 SOL | Burner-sink pattern |
| `9gLYqGrhPiRk…sPyo` | 24 | 2025-05-12 only | 0.001 SOL | Burner-sink pattern |
| `9SzPrMxtv76z…B9av` | 20 | 2025-05-12 to 14 | 0 SOL | Burner-sink pattern |
| `9GS4pvLLqVV7…RUgG` | 50+ | 2025-05-11 to 12 | 0 SOL | Burner-sink pattern |
| `4tMW38hehQ5o…XoVR` | 14 | 2025-05-07 to 12 | 0.001 SOL | Adjacent burner-sink pattern |
| `7Q5hoiFy3FJu…K4Dhn` | 50+ | 2025-04 to 2026-02 | 0 SOL | Long-running infrastructure address (continuous activity) |
| **`7MoK8H31L7YB…hQy1`** | 50 | **2026-05-15 to 2026-05-17** | **131.69 SOL (~$22,000)** | **Heavy current inflow activity** |
| **`CYt5zhUNZfyX…eh71`** | 50 | **2026-05-14 to 2026-05-17** | **32.22 SOL (~$5,500)** | **Heavy current inflow activity** |
| `HFUGwNE5Jj5G…LYXn` | 50 | 2026-05-13 to 14 | 0 SOL | Recent flow-through activity |

Two observations of public consequence:

**Four other addresses in the same operator batch share the participant's drain-destination fingerprint.** Each shows a single-day-or-narrow-window activity envelope, a low signature count, and a zero or near-zero ending balance — the same operational pattern as the participant's confirmed drain destination. We do not assert from this on-chain pattern alone that these are stolen-funds destinations; we are stating that the patterns are consistent and that the addresses warrant attention. Anyone who recognizes one of those four addresses as having received funds they did not authorize — we want to hear from you. Tip line at the end of this article.

**The address cluster contains wallets receiving substantial current inflows.** Two addresses in that same May-2025 Lookup Table — `7MoK8H31L7YB…hQy1` and `CYt5zhUNZfyX…eh71` — have received inflows in the last 96 hours totaling more than $27,000 in SOL. We are reporting the on-chain balances and timing as facts; the interpretation of those facts is left to readers and to the analytics firms we expect will examine the cluster.

A long-running infrastructure address (`7Q5hoiFy3FJu…K4Dhn`) shows continuous activity from April 2025 through February 2026, with multiple shared-batch touchpoints between the May-2025 sink cohort and the currently-active addresses above. The on-chain signature is consistent with a single coordinating actor across that period, though attribution of pseudonymous addresses to a single real-world entity is necessarily inferential.

The participant was not the only address in his batch. He was one entry in a cohort.

---

## September: they came back

In September 2025, the same Polygon MetaMask wallet (`0x118EDd03335D07B498A511213cDb9FDfB448EcA3`) that the participant had disclosed via Despark's screener — and that, on the day of the drain, contained relatively little — was hijacked again.

On 2025-09-10 and 2025-09-11, that wallet executed five EIP-7702 authorization transactions on Ethereum mainnet, each delegating the wallet's execution to a smart contract at address `0x5A77f0DFc729700300c22e7b0111a5cfbC32431B`. EIP-7702, activated as part of Ethereum's Pectra upgrade in May 2025, lets an externally owned account ("EOA") delegate its code to a contract — effectively giving that contract smart-account-style control over the wallet's actions. Used legitimately, this is the foundation of the new generation of smart wallets. Used maliciously, a single 7702 authorization can give an attacker persistent, batched, programmable control over a victim's wallet.

The delegate contract that the participant's wallet was authorized to is unverified. Its creator address is labeled "Fake_Phishing2277658" by Etherscan's community attribution system. It was deployed on June 21, 2025 via the CreateX factory — a common drainer-deployment pattern — and has executed 2,278 transactions to date.

Eleven days later, on 2025-09-22, the same wallet executed a sixth EIP-7702 authorization to a different delegate contract (`0x63245b9fADc65C3a6d61b1A1a812808ffC91BD29`). That contract is also unverified; its creator is labeled "Fake_Phishing1685665" by Etherscan; its deployer address is a vanity-mined `0x6666…f56666` — the kind of cosmetic flourish associated with established drainer crews.

The Sept 22 delegation is still live as of 2026-05-18. An `eth_getCode` call against the wallet on Ethereum mainnet returns the EIP-7702 prefix `0xef0100` followed by the malicious delegate address — meaning the wallet is, at this moment, code-pointed at a contract whose creator is labeled "Fake_Phishing1685665" by Etherscan. (Each new EIP-7702 authorization overwrites the previous one, so the Sept 10-11 delegations to `0x5A77f0DF...` were superseded by the Sept 22 delegation; only the most recent — to `0x63245b9f...` — is currently active.) Anyone using that wallet to sign any transaction today is doing so through that attacker-controlled contract.

What the September re-hijack proves, beyond the May drain, is that whoever has the participant's keys never let them go. When a new attack tool (EIP-7702) became viable in mid-2025, they weaponized it against the same victim four months after the original drain. This is persistence. This is the signature of an actor who has automated long-tail monetization of compromised key inventory.

---

## What we are not saying — and what we are

We are not asserting that the researcher who interviewed the participant on May 12, 2025 drained him, instigated the drain, or had any knowledge of it. The researcher may be a Consensys employee acting in entirely good faith whose call was simply incidental to a drain enabled by an unrelated prior compromise of the participant's keys. We do not name her, because we cannot on the available evidence establish her involvement, and because RexIntel's editorial doctrine names corporate entities — not individuals — until a regulator or a court does so first.

We are not asserting that Despark.io, Greg Eusden, Amar Kher, Consensys, Inc., or Consensys Mesh are aware of, sanction, or are complicit in the pattern described in this article. The evidence we have gathered does not establish those claims, and we do not make them. They are named in this article because their identification as the corporate principals and parent organization of Despark is a matter of public record (LinkedIn, Crunchbase, PitchBook, Consensys Mesh's own public investment announcement), and because Eusden's emails to the participant were sent in his official capacity as a Despark co-founder.

We are not asserting that the addresses we identify as exhibiting drainer-pattern activity are conclusively the destinations of stolen funds. We are reporting on-chain facts (signature counts, balances, activity ranges, shared batches) and the inferences that any forensic reader would reasonably draw from them. We invite alternative interpretations and counter-evidence.

We are saying:

- A multi-chain crypto founder, recruited via a paid user-research mission on a Consensys-Mesh-funded platform, lost the contents of a Solana wallet to a fully automated transaction sequence approximately 47 minutes after the recorded call ended.
- The Solana transactions are public-record on-chain facts, verifiable by anyone with a Solana block-explorer URL.
- The wallet later disclosed in the same participant's Despark screener was subsequently authorized, via Ethereum's EIP-7702 mechanism, to two delegate contracts whose creators are explicitly labeled "Fake_Phishing" by Etherscan's community attribution system.
- Despark, when asked, released only the portion of the recorded call in which the participant himself speaks, attributing the partial release to lawyer review.
- Four other addresses share a single Solana Address Lookup Table prepared in the same minute as the participant's drain-destination address, and exhibit the same operational fingerprint.
- Two other addresses in the same Lookup Table show heavy current inflows totaling more than $27,000 in SOL in the last four days.

Each of those statements is independently verifiable on-chain, in the email correspondence the participant has provided to RexIntel, or in publicly available corporate disclosures.

---

## Methodology and limits of this investigation

This article is based on (a) timestamped email correspondence between the participant and Despark, voluntarily provided to RexIntel for the purpose of this investigation; (b) a recording-clip and transcript released by Despark to the participant on 2025-08-18; (c) public on-chain transaction records on the Solana and Ethereum networks, verified via independent public RPC endpoints; and (d) public corporate filings, announcements, and LinkedIn profiles of the parties named.

We did not access Despark's internal systems. We have not independently verified Despark's metadata claims (no chat messages exchanged, no screen shared) other than to note their consistency with the on-chain mechanism evidence. We did not contact the researcher. We did not contact Despark, Consensys, or Consensys Mesh for comment in advance of publication; any response received post-publication will be appended to this article.

The participant remains anonymous at his request. Verification of his identity, his disclosure to RexIntel, and his consent to publication is held by RexIntel's investigations desk and available to credentialed legal and journalistic counterparties on request.

---

## What we are asking

**If you participated in a Despark.io user-research mission since February 2025** — especially one branded as a MetaMask, Consensys, or "Web3 Identity" interview — and you have *any* unusual on-chain activity in the hours, days, or weeks following the call, we want to hear from you. Email **rexintelservices@proton.me** — for end-to-end encrypted source protection, write us from your own ProtonMail account.

**If you recognize any of the operator addresses below as having received funds you did not authorize:**

```
GmgHSpuXYejyfZ9E63YPR9XFdfHj4pyuu7cVu8jTrN9f   (Solana — May 12, 2025 drainer sink)
4Z91xTzhDs7e5aV8cc6dLgJdjpRidtQJ2vBGVi4y7z2u   (Solana — May 12, 2025 drainer sink)
9gLYqGrhPiRkcPYt9gAuT15yWzpNZSwt3P19pi2KsPyo   (Solana — May 12, 2025 drainer sink)
9SzPrMxtv76zD4rZ8sUdYtxqV4onWBvXhrYjq6N1B9av   (Solana — May 12-14, 2025 drainer sink)
9GS4pvLLqVV7Sm2zkjFLN5pFD9dJ8eMRG7W6boMhRUgG   (Solana — May 11-12, 2025 drainer sink)
7MoK8H31L7YBsf5xG8g2bQaasW4HmuWP7XH8yhw8hQy1   (Solana — CURRENTLY ACTIVE operator wallet)
CYt5zhUNZfyXy7j95Sn9rcPUc5FByNj6A4SD8aAmeh71   (Solana — CURRENTLY ACTIVE operator wallet)
6m2CDdhRgxpH4WjvdzxAYbGxwdGUz5MziiL5jek2kBma   (Solana — operator's drain router)
9yj3zvLS3fDMqi1F8zhkaWfq8TZpZWHe6cz1Sgt7djXf   (Solana — operator's persistent fee wallet)
0x5A77f0DFc729700300c22e7b0111a5cfbC32431B       (Ethereum — EIP-7702 phishing delegate)
0x63245b9fADc65C3a6d61b1A1a812808ffC91BD29       (Ethereum — EIP-7702 phishing delegate)
```

— email **rexintelservices@proton.me**. We will protect your identity and your reporting.

**If you are an exchange or analytics provider** — these addresses have received inflows totaling over $27,000 in SOL within the last four days, are operating in a Solana Lookup Table batch shared with a year-old confirmed drain destination, and warrant attention. Reach us at **rexintelservices@proton.me**.

**If you are Despark, Consensys, or Consensys Mesh** — this article will be updated to reflect any response you choose to make. Statements may be sent to **rexintelservices@proton.me**.

We are not seeking the researcher. We are seeking the operator, the channel that gave them this participant's keys, and any other affected parties in the same batch.

— RexIntel Investigations Desk
2026-05-18

---

**Contact:** rexintelservices@proton.me

For end-to-end encrypted source protection, write to us from your own ProtonMail account. Tips, evidence, corrections, and right-of-reply communications all welcome. We respond to credentialed legal and journalistic counterparties on identity-verification requests for the underlying source materials referenced in this investigation.
