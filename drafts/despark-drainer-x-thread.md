---
title: Despark drain X / Twitter thread (companion to canonical article)
status: draft-v0
date: 2026-05-18
canonical: drafts/despark-drainer-expose-v0.md
---

# X / Twitter thread (12 tweets)

Drop after the canonical RexIntel article goes live. Each tweet ≤280 chars. Link the canonical article in the final tweet.

---

**1/**
🧵 Investigation: A multi-chain crypto founder accepted a $54 user-research interview booked through a Consensys-funded platform.

47 minutes after the call ended, his Solana wallet executed 8 transactions in 80 seconds. Fully automated drain.

He had told the researcher what was in that wallet.

**2/**
The platform is Despark.io — backed by Consensys Mesh, the venture arm of the company that makes MetaMask. ~7 employees, Boston. They source crypto-native interview participants for portfolio products including MetaMask itself.

The mission was titled "Web3 Identity."

**3/**
Call ended ~11:00 AM PT on 2025-05-12.

Despark "Mission Complete" email landed at 11:15 AM PT.

At **11:45:43 AM PT**, the participant's Phantom wallet (HeJkAGASQu8esawJyrEW4WFkdoqTpsZSGatkoFb4XqVa) began signing transactions. He wasn't at his computer. The keys were.

**4/**
Over the next 1m 53s, the wallet emitted 8 transactions liquidating every token position to native SOL via a custom drainer router, with a small fee skimmed to a persistent operator wallet on each swap.

Final tx: 15.110 SOL swept to a single-use burner.

You can replay every one of these on any Solana block explorer.

**5/**
The burner sink (GmgHSpuXYejyfZ9E63YPR9XFdfHj4pyuu7cVu8jTrN9f) has exactly 7 signatures in its entire history. All 7 are on May 12, 2025. Balance: 0.

Two minutes after the drain landed, the SOL was relayed to a consolidation wallet via a Solana Address Lookup Table the operator pre-staged.

**6/**
That Lookup Table contained **10 sink addresses**. Our victim's was one of them.

Four others have the same one-day burner fingerprint — drained the same minute, same operator, never used again.

This wasn't a one-off attack. It was an operator batch.

**7/**
Two MORE wallets in the same Lookup Table show heavy current inflows:

`7MoK8H31L7YBsf5xG8g2bQaasW4HmuWP7XH8yhw8hQy1` — 131.69 SOL ($22K) in last 3 days
`CYt5zhUNZfyXy7j95Sn9rcPUc5FByNj6A4SD8aAmeh71` — 32.22 SOL ($5.5K) in last 4 days

The operator is still draining victims **right now, as you read this**.

**8/**
One more layer. The MetaMask wallet our victim disclosed to Despark via their screener (0x118EDd…EcA3) was hijacked AGAIN four months later, in September 2025.

Via Ethereum's EIP-7702 mechanism. Twice. By delegate contracts both labeled "Fake_Phishing" by Etherscan.

Same persistent access.

**9/**
The Sept 22 EIP-7702 delegation to 0x63245b9fADc65C3a6d61b1A1a812808ffC91BD29 is LIVE AS OF TODAY. `eth_getCode` returns 0xef0100… + delegate addr.

The victim's wallet, right now, is code-pointed at a contract whose creator Etherscan labels "Fake_Phishing1685665."

**10/**
What we are NOT saying: that the researcher drained him. We don't name her — she may be a Consensys employee acting in good faith, called by an operator who watched the call from elsewhere.

What we ARE saying: every fact above is independently verifiable on-chain or in writing.

**11/**
What we are asking:

🟢 Other Despark participants since Feb 2025 with weird post-call on-chain activity — email us
🟢 Exchanges + analytics — these operator wallets are receiving live funds, freeze them
🟢 Despark, Consensys, Consensys Mesh — we'll append any response you send

**12/**
Full investigation + methodology + addresses + receipts here:

[link to canonical RexIntel article]

Tip line: rexintelservices@proton.me
(ProtonMail-to-ProtonMail for source protection.)

— RexIntel Investigations Desk
