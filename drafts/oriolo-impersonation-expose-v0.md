---
title: "Fake VC impersonation on Telegram led to a multi-chain founder's Bitcoin wallet being drained 24 hours after the pitch call"
standfirst: "How one ETH Denver group lurker pretending to be a real Italian VC drained at least 5 founders' Bitcoin via a single 'open in app' message."
status: draft-v0
date: 2026-05-18
case_file: project_oriolo_impersonation_case.md
---

# Fake VC impersonation on Telegram led to a multi-chain founder's Bitcoin wallet being drained 24 hours after the pitch call

*How one ETH Denver group lurker pretending to be a real Italian VC drained at least 5 founders' Bitcoin via a single "open in app" message.*

---

A multi-chain crypto founder, anonymous for his protection, sent his first message to a Telegram account that claimed to be an Italian VC on the morning of February 19, 2025. They had supposedly connected via the ETH Denver group chat. The "VC" expressed interest in investing in two of the founder's AI-agent projects. He asked for a team meeting.

Twenty-four hours later, the founder was on a video call trying to download the "VC's" custom video-chat application — which crashed his computer and did nothing visible.

It did something invisible.

Within 36 hours of the first message, the founder's Bitcoin wallet was empty. On-chain forensics show **at least four other founders were drained into the same collection infrastructure** by the same operator on the same day.

---

## The setup

The Telegram handle was **`@oriollo_alessio`**. The profile name was Alessio Oriolo. The story was a real and verifiable one: there is a real Italian venture investor named Alessio Oriolo, with a public LinkedIn profile at [linkedin.com/in/alessio-oriolo](https://www.linkedin.com/in/alessio-oriolo/). The person operating `@oriollo_alessio` was not him.

The participant pitched two of his early-stage AI-agent projects — an embeddable AI-as-a-service API and an AI agent protocol built on Bitcoin runes — and shared a public ETHGlobal showcase as evidence of prior work. The "VC" said it looked "pretty interesting" and asked the participant to bring his technical co-founder into a group chat.

The participant did. The co-founder, based in Amsterdam, joined. The "VC" set a meeting for the next afternoon.

---

## The drop

On February 20, 2025 at approximately 14:00 UTC, the meeting started.

The "VC" did not use Zoom. He did not use Google Meet. He sent a Telegram link with the instruction `open in app`. The link led to a download for **a Chinese-branded video-chat application** — not a standard Western meeting tool, and not any product the participant or his co-founder had used before. That specific vector — pushing a proprietary, foreign-branded meeting app on the day of a high-stakes pitch — is a well-documented signature of the Lazarus "Operation Dream Job" / "Contagious Interview" family of attacks documented across multiple recent crypto-drain incidents.

The technical co-founder, a senior engineer based in Amsterdam, refused outright. His exact reply, quoted verbatim from the Telegram log:

> **"I am not downloading random apps, sorry."**

That refusal saved his keys.

The participant, less skeptical and more eager to close the conversation with what looked like a credible investor, did download it. The application did not visibly start. It also, per his message in the chat, "crashed my comp." When asked by the "VC" about the problem, the response was a brief: "try solve the problem please."

The group eventually moved to Google Meet. The meeting was uneventful. The participant later described "Alessio" as based in "Guangzhou atm." The pitch went unanswered after the call.

The participant didn't know it at the time, but the malicious application had executed during the install attempt — exfiltrating the contents of his Xverse Bitcoin wallet's key material.

---

## The drain

Within 36 hours of the failed app install, the participant's Bitcoin wallet was being spent on-chain by an operator that wasn't him.

The drainer's collection address on Bitcoin: **`bc1q704czv9hyce6fg2m9s6c097hg3hue2tzpqwngz`**. The wallet has 22 lifetime transactions, every single one of them on **February 20 and 21, 2025** — the days of and immediately after the failed app install. It then went dormant for 4 months, holding the stolen value as the operator presumably looked for a way out without lighting up exchange monitoring.

The stolen assets were not only Bitcoin. The same drain event lifted **Bitmap Ordinals inscriptions and Runes balances** out of the participant's Xverse wallet alongside the BTC — the kind of multi-asset sweep that an address-book-grade Bitcoin wallet drainer is configured to perform when key material is exfiltrated.

The drainer's collection address `bc1q704czv9hyce6fg2m9s6c097hg3hue2tzpqwngz` is enumerable on **Luminex** ([luminex.io/address/bc1q704czv9hyce6fg2m9s6c097hg3hue2tzpqwngz](https://luminex.io/address/bc1q704czv9hyce6fg2m9s6c097hg3hue2tzpqwngz)), the leading Bitcoin Ordinals marketplace, as an active Ordinals-trading wallet. At the time of this update, it holds **sixteen distinct Runes balances** alongside a residue of dust sats. **The participant has identified those sixteen Runes as the same Runes that were in his Xverse wallet at the time of the drain.** They have sat on the operator's address, untouched, for fifteen months.

The Bitmap Ordinals are no longer at the address. The participant — checking his former holdings against the current contents of the operator-controlled wallet — reports that every one of his Bitmap inscriptions has been **moved out of `bc1q704czv9hyce6fg2m9s6c097hg3hue2tzpqwngz` and sold**, almost certainly via marketplace listings, almost certainly on Luminex or a comparable Bitcoin-Ordinals venue. Because Bitmap inscriptions are text-on-satoshi assets whose ownership follows the underlying satoshi across every subsequent transaction, **the buyers of each stolen Bitmap are now public, on-chain, and recoverable** — given an inscription-aware indexer or marketplace cooperation, every current holder of a stolen Bitmap is identifiable by inscription ID and a sequence of transaction hashes.

Bitmap Ordinals — text inscriptions of the form `{block_number}.bitmap`, each representing a land claim in the Bitmap metaverse protocol — therefore constitute **the single most traceable category of stolen Bitcoin-native asset that exists**. Stolen BTC fragments through CoinJoin and exchange laundering; stolen Bitmaps carry an immutable, public, sat-level provenance trail that cannot be obfuscated. Every party who has purchased a stolen Bitmap from this operator's wallet between February 21, 2025 and the date of this article is now a public node in this case file.

On **June 21, 2025**, the operator made a single coordinated cash-out move. The drainer wallet swept 327,114 sats (~$326 at the time) to a new collection hub: **`bc1q234du9sa0ugjkrj4pmhuujzu5cqx9eh7aqf3p9`**.

That collection hub is where the operation's structure becomes visible.

---

## Four other victims confirmed on-chain

`bc1q234du9...` is **not** the participant's wallet, and it is not the operator's personal wallet. It is a **collection hub** that aggregates proceeds from multiple drainer-source wallets in a single window.

Within the same hour on June 21, 2025, the collection hub received inbound transfers from **five different source wallets** — the participant's drainer plus four others:

| Source wallet | Inbound | Likely role |
|---------------|---------|-------------|
| `bc1q704czv9hyce6fg2m9s6c097hg3hue2tzpqwngz` | 327,114 sats | the participant's drainer |
| `3LZg5gWCBXwVJ5w3fgE5pAvt...` | 26,949 sats | Other victim's drainer |
| `3Dnu1u2qRj33XBqcNCdxwaxW...` | 33,305 sats | Other victim's drainer |
| `32GDoJ43CXzsiV66vSFhN2c4...` | 147,943 sats | Other victim's drainer |
| `3PUpZ62QomXNF73gd9VmehCD...` | 57,242 sats | Other victim's drainer |

**Total aggregated: ~594,000 sats (~$594 at the time).**

Two days later, on **June 23, 2025 at 01:55 UTC**, the collection hub forwarded essentially all of that — 590,000 sats — to a single next-hop wallet: **`bc1qa535j66nthwuskk76vdz...`**. That next-hop is likely a centralized-exchange deposit address or a mixer — the operator's exit point.

**That on-chain pattern is the smoking gun for the multi-victim thesis.** The same operator was running the same play against multiple founders in the same time window, then aggregating their drained Bitcoin into a single sweep for cash-out. The participant in our case file was one of at least five.

---

## The pattern: Lazarus "Dream Job" — VC side

The recruiter-impersonation variant of this attack class — fake recruiters running fake job interviews to push malicious "test environment" downloads onto crypto engineers — has been extensively documented as **North Korean "Operation Dream Job" / "Contagious Interview"** by MITRE, SlowMist, Mandiant, Sekoia, and TRM Labs. The malware families involved (BeaverTail, InvisibleFerret, OtterCookie, ClickFake) have been pinned to DPRK-aligned threat actors.

What's documented less is the **VC-side variant**: an operator who pretends to be the investor — not the recruiter — and pushes the founder, not the engineer, to install something. The dynamics flip: the founder is the higher-status party but also the more eager-to-close one, the one less likely to demand the meeting use a standard tool, and the one with multi-chain personal wallets full of the proceeds of their existing projects.

The Oriolo impersonation in this case file fits the VC-side pattern exactly:
- Lurker in a public crypto pitch community (ETH Denver Telegram)
- Identity cloned from a real and verifiable VC (LinkedIn profile)
- Initial conversation entirely about the founder's projects
- Pressure to bring the co-founder into a meeting (more attack surface)
- "Custom video chat" application as the malware vector
- Drain executed via stealer-exfilled keys within hours
- Multi-victim cohort consolidated into a shared cash-out flow

We do not assert that the operator behind `@oriollo_alessio` is a North Korean state actor. The technique is now commoditized and used by mid-tier criminal actors across multiple jurisdictions. We do assert that the **business model** of "lurking in a pitch community as a fake VC and pushing a malicious app on the day of the meeting" is the structure visible here.

---

## The scammer and the impersonation target

The handle the participant interacted with on Telegram was `@oriollo_alessio` (note the doubled "ll" in "oriollo" versus the correct "Oriolo"). The handle presented itself as Italian VC Alessio Oriolo.

**Two photos accompany this section. They are two different people, presented for two different reasons.**

| Picture A — the scammer | Picture B — the impersonation target |
| --- | --- |
| ![Picture A — the face the participant saw on the video call with @oriollo_alessio. Identity unknown. This is the scammer.](/btchack3.jpeg) | ![Picture B — Italian VC Alessio Oriolo at a public conference appearance. Oriolo is the impersonation target, not the scammer.](/btchack1.jpeg) |

**Picture A — the scammer.** This is the face the participant saw on the video call with `@oriollo_alessio` on 2025-02-20, during the failed Chinese-video-chat-app install session. **Identity unknown.** This is the person who ran the scam.

**Picture B — the impersonation target.** This is the real Italian venture investor Alessio Oriolo, photographed at a public conference appearance. **Mr. Oriolo is not the scammer.** He is the third-party victim of identity theft — the person whose name and professional reputation the operator behind `@oriollo_alessio` used to make the cover story credible.

To restate without ambiguity: **Picture A is the perpetrator. Picture B is a private third party whose name was abused. RexIntel does not assert that the individual in Picture A is, or is in any way related to, Mr. Oriolo.**

We publish Picture A so that anyone who has encountered the same face behind `@oriollo_alessio` or any similar handle in any pitch community can recognize them and come forward. We publish Picture B so that Mr. Oriolo's professional network — his colleagues, his portfolio founders, his fund LPs — knows that a Telegram account is currently impersonating him for the purpose of running multi-victim crypto drains under his name.

The handle `@oriollo_alessio` (note the doubled "ll") is the impersonation account.

### Right of reply, prominent

If you are Alessio Oriolo and would like a clarifying statement, a link to your authoritative communication channels, or any other public correction prominently appended to this article, write to **rexintelservices@proton.me**. Your statement will be placed at the top of the article above this section, with the original text preserved below for the record.

---

## What we are not saying — and what we are

We are not asserting that the real Alessio Oriolo is the individual who operated the `@oriollo_alessio` Telegram handle, drained the participant, or had any role in the scam. The two pictures above are presented as two different people — Picture A is the scammer (identity unknown); Picture B is the real Mr. Oriolo (the third-party impersonation victim). We do not invite, suggest, or imply any visual identification between them.

We are not asserting that the four other drainer-source wallets in the June 21 cash-out batch belong to victims of the same scam play. They may have been drained by the same operator via the same Telegram-VC pretext (most parsimonious explanation given the shared cash-out infrastructure), or via different attacks routed to the same operator's cash-out hub. We invite alternative interpretations.

We are saying:

- The participant's Bitcoin wallet was drained on February 20-21, 2025, immediately following a failed attempt to install a "custom video chat" application pushed via Telegram by `@oriollo_alessio`.
- The on-chain drainer infrastructure (drainer wallet, collection hub, next-hop sweep) is all public-record Bitcoin transactions.
- The collection hub aggregated funds from at least five distinct source wallets — four of which are not the participant's — into a single sweep four months after the original drains, consistent with multi-victim operator behavior.
- The Telegram handle `@oriollo_alessio` presented itself, via name and chosen identity reference, as Italian VC Alessio Oriolo.
- The face the participant saw on the video call (Picture A above) is the participant's personal recall and identification — not a definitive on-chain or court-record-grade identification.
- The co-founder's refusal to install the application ("I am not downloading random apps, sorry") prevented his keys from being compromised in the same incident.

Each statement is independently verifiable on the Bitcoin chain, in the participant's Telegram log voluntarily provided to RexIntel, in the participant's contemporaneous identification of the video-call face, or on Alessio Oriolo's public LinkedIn.

---

## Methodology and limits

This article is based on (a) the participant's complete Telegram message log with `@oriollo_alessio` from 2025-02-19 06:13 UTC through 2025-02-20 14:40 UTC, voluntarily provided to RexIntel; (b) public Bitcoin block-explorer data on the drainer wallet, collection hub, and next-hop addresses, verified via independent public mempool.space queries; (c) the participant's contemporaneous visual identification of the face seen on the failed video-call session on 2025-02-20 (Picture A above); (d) a publicly-circulated photo of Italian VC Alessio Oriolo speaking at a public conference (Picture B above); (e) Alessio Oriolo's public LinkedIn profile.

We did not access the participant's device or wallet directly. We have not recovered or analyzed the actual malicious "custom video chat" application binary — the participant's machine has been retired since the incident, and the original download URL was not preserved in the chat log beyond the link `open in app` text. We did not perform facial-recognition analysis between the two pictures; we present them and invite reader assessment. We did not contact the operator behind `@oriollo_alessio`. We did not contact the real Alessio Oriolo for comment in advance of publication; any response received post-publication will be appended to this article.

The participant remains anonymous at his request. Verification of his identity, the Telegram log's authenticity, and his consent to publication is held by RexIntel's investigations desk and available to credentialed legal and journalistic counterparties on request.

---

## What we are asking

> **Recovery reward.** An undisclosed reward is being offered for information leading to the recovery of the assets described in this article, provided by **[orangepills.xyz](https://orangepills.xyz)**. Tips, leads, and successful trace work all qualify. Email **rexintelservices@proton.me** with the subject line "Oriolo recovery" to claim.
>
> **Disclosure.** orangepills.xyz is operated by the same individual who operates RexIntel Investigations Desk. The reward is funded from that individual's personal resources, not from third-party sponsorship. We disclose this relationship in full so readers can weigh the editorial independence of this offer.

**If you were approached on Telegram in the past 12 months by the handle `@oriollo_alessio`** — especially in or around ETH Denver, ETH Global, or similar pitch communities — and you have any unexplained on-chain activity in the hours or days that followed: email **rexintelservices@proton.me**. For end-to-end encrypted source protection, write to us from your own ProtonMail account.

**If you recognize any of the following Bitcoin addresses as having received funds you did not authorize:**

```
bc1q704czv9hyce6fg2m9s6c097hg3hue2tzpqwngz   (drainer wallet — known)
bc1q234du9sa0ugjkrj4pmhuujzu5cqx9eh7aqf3p9   (collection hub — known)
bc1qa535j66nthwuskk76vdz...                  (next-hop cash-out)
3LZg5gWCBXwVJ5w3fgE5pAvt...                  (co-victim drainer source #2)
3Dnu1u2qRj33XBqcNCdxwaxW...                  (co-victim drainer source #3)
32GDoJ43CXzsiV66vSFhN2c4...                  (co-victim drainer source #4)
3PUpZ62QomXNF73gd9VmehCD...                  (co-victim drainer source #5)
```

— email **rexintelservices@proton.me**.

**If you are Alessio Oriolo**, please reach out. RexIntel has presented the visual identification question to the reader without resolving it. Your statement — confirming whether you were on the video call with the participant on 2025-02-20, or confirming that you were not and were impersonated — will be appended to this article and given prominent placement. Email **rexintelservices@proton.me**.

**If you are an exchange or analytics provider**, the June 23, 2025 next-hop sweep to `bc1qa535j66nthwuskk76vdz...` is the most likely point at which these funds entered a centralized counterparty. Reach out and we'll share the full hop trail.

**If you are Luminex, Magic Eden, UniSat, OKX, Ordinals Wallet, or any other Bitcoin Ordinals marketplace** — the participant has identified `bc1q704czv9hyce6fg2m9s6c097hg3hue2tzpqwngz` as the operator wallet that held his stolen assets. The Bitmap inscriptions originally in his wallet have been moved out and sold; the sixteen Runes balances currently at the address remain his property. We invite (a) a freeze or warning flag on any further outbound from this wallet, (b) an audit of any prior marketplace listings or completed sales originating from this address since February 21, 2025, and (c) notification of any buyer who has acquired a Bitmap from this wallet's outflow during that period. We will provide the participant's wallet address, the affected Bitmap block numbers, and a credentialed proof-of-ownership package on request. Email **rexintelservices@proton.me**.

**If you have Bitcoin Ordinals tracing capability** (Hiro, UniSat indexers, Luminex analytics, OKX explorer, Ordiscan, MagicEden, ZachXBT, MetaSleuth, or independent Ordinals-forensics analysts) — we are seeking inscription-side partnership to enumerate every Bitmap that passed through `bc1q704czv9hyce6fg2m9s6c097hg3hue2tzpqwngz` between February 20, 2025 and the present, and to identify the current holders of each. Public Ordinals indexer APIs have largely been deprecated or paid-gated since 2025; we are willing to pay or trade for API access against a successful trace. Email **rexintelservices@proton.me**.

**If you have bought a Bitmap inscription that traces back to `bc1q704czv9hyce6fg2m9s6c097hg3hue2tzpqwngz`** — you are almost certainly not the target of this report, but you have likely acquired stolen property without knowing it. The asset's provenance is now public, and the original owner has a documented chain of custody. Email **rexintelservices@proton.me** and we will share the original ownership record with you. We are aware that secondary-market buyers in good faith are themselves victims of the laundering chain and will treat any such outreach in that spirit.

We are not seeking Alessio Oriolo. We are seeking the operator behind `@oriollo_alessio`, the malicious application binary, and any other founders in the same pitch community who were drained by the same play.

— RexIntel Investigations Desk
2026-05-18

---

**Contact:** rexintelservices@proton.me

For end-to-end encrypted source protection, write to us from your own ProtonMail account. Tips, evidence, corrections, and right-of-reply communications all welcome. We respond to credentialed legal and journalistic counterparties on identity-verification requests for the underlying source materials referenced in this investigation.
