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

The "VC" did not use Zoom. He did not use Google Meet. He sent a Telegram link with the instruction `open in app`. The link led to a download for what was described as a custom video-chat application.

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

On **June 21, 2025**, the operator made a single coordinated cash-out move. The drainer wallet swept 327,114 sats (~$326 at the time) to a new collection hub: **`bc1q234du9sa0ugjkrj4pmhuujzu5cqx9eh7aqf3p9`**.

That collection hub is where the operation's structure becomes visible.

---

## Four other victims confirmed on-chain

`bc1q234du9...` is **not** Rex's wallet, and it is not the operator's personal wallet. It is a **collection hub** that aggregates proceeds from multiple drainer-source wallets in a single window.

Within the same hour on June 21, 2025, the collection hub received inbound transfers from **five different source wallets** — Rex's drainer plus four others:

| Source wallet | Inbound | Likely role |
|---------------|---------|-------------|
| `bc1q704czv9hyce6fg2m9s6c097hg3hue2tzpqwngz` | 327,114 sats | Rex's drainer |
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

## Identification: an unresolved question we put to the reader

The handle the participant interacted with on Telegram was `@oriollo_alessio` (note the doubled "ll" in "oriollo" versus the correct "Oriolo"). The handle presented itself as Italian VC Alessio Oriolo, whose real public LinkedIn profile is at [linkedin.com/in/alessio-oriolo](https://www.linkedin.com/in/alessio-oriolo/).

During the failed-application-install session on 2025-02-20, the participant briefly saw the operator's face on a video call. After the incident, the participant cross-referenced what he had seen against publicly available photos of the real Alessio Oriolo.

We are not in a position to assert from a single video-call identification whether the person the participant saw is or is not the same individual as the real Alessio Oriolo. We are in a position to publish the visual evidence and let the reader form an assessment.

**Picture A — the face the participant saw on the video call with `@oriollo_alessio` on 2025-02-20:**

![The face the participant saw on the video call with @oriollo_alessio](/btchack1.jpeg)

**Picture B — verified public photo of Italian VC Alessio Oriolo, speaking at a public conference appearance:**

![Verified public photo of Italian VC Alessio Oriolo at a public conference](/btchack3.jpeg)

Two possibilities are consistent with this visual evidence:

1. **The faces match.** The person on the `@oriollo_alessio` video call was, in fact, the same individual who runs the public-record professional identity of Italian VC Alessio Oriolo — meaning the case is not an impersonation but an actual perpetrator using his own name and likeness.
2. **The faces do not match, or match only superficially.** The scammer is a separate individual whose face the participant either saw briefly enough to misidentify, or who deliberately resembles the real Oriolo enough to make the impersonation visually credible.

RexIntel does not assert which possibility is correct. Readers can form their own assessment from the two images above, the public LinkedIn profile linked, and any further conference / press photography of Alessio Oriolo they can locate. Any party with information that resolves the question definitively — including Mr. Oriolo himself — is invited to contact RexIntel via the email at the bottom of this article.

---

## What we are not saying — and what we are

We are not asserting that the real Alessio Oriolo is the individual who operated the `@oriollo_alessio` Telegram handle, drained the participant, or had any role in the scam. We have placed the visual evidence above and we invite the reader to form their own assessment; we do not, on the available evidence, foreclose either possibility.

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

We are not seeking Alessio Oriolo. We are seeking the operator behind `@oriollo_alessio`, the malicious application binary, and any other founders in the same pitch community who were drained by the same play.

— RexIntel Investigations Desk
2026-05-18

---

**Contact:** rexintelservices@proton.me

For end-to-end encrypted source protection, write to us from your own ProtonMail account. Tips, evidence, corrections, and right-of-reply communications all welcome. We respond to credentialed legal and journalistic counterparties on identity-verification requests for the underlying source materials referenced in this investigation.
