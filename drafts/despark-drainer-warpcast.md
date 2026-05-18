---
title: Despark drain Warpcast cast (companion to canonical article)
status: draft-v0
date: 2026-05-18
canonical: drafts/despark-drainer-expose-v0.md
---

# Warpcast cast (single post + extended thread)

Warpcast supports longer posts than X. One main cast with the strongest hook, then a 4-cast follow-on thread. Drop after the canonical RexIntel article ships.

---

## Main cast (≤1024 chars)

🧵 New investigation:

A crypto founder accepted a $54 user-research interview booked through Despark.io — a Consensys-funded recruitment platform that staffs MetaMask research.

47 minutes after the call ended, his Solana wallet executed 8 transactions in 80 seconds. Every liquid asset gone, swept to a one-time burner address.

He had told the researcher, on camera, what was in that wallet.

The drainer's infrastructure was pre-staged before he signed up. Two of the operator wallets in that batch are receiving fresh victim funds **right now** — $27K of SOL in the last 4 days alone.

Four other addresses share the same operator batch, drained the same minute. Five known victims, on-chain.

Full investigation, methodology, addresses, receipts: [link to canonical]

Tip line: rexintelservices@proton.me

---

## Reply cast 1

The architecture of the attack:

➡️ 11:00 AM PT — call ends
➡️ 11:15 AM PT — Despark "Mission Complete" auto-email
➡️ 11:45:43 AM PT — first drain tx signed with the victim's own Phantom keypair
➡️ 11:47:36 AM PT — final 15.110 SOL swept to a one-use burner
➡️ 11:49:38 AM PT — 2 minutes later, relayed forward to operator consolidation wallet

The mechanism: stolen private key + scheduled bot trigger. Not a sig exploit during the call. The call's role: probably the timing signal.

---

## Reply cast 2

The drainer kept the keys.

Four months later, in September 2025, the same victim's MetaMask wallet was hijacked AGAIN via Ethereum's EIP-7702 mechanism — code-pointed at two different malicious delegate contracts, both with creators labeled "Fake_Phishing" by Etherscan.

The Sept 22 delegation is LIVE as of today. The wallet, right now, is code-pointed at a Fake_Phishing-labeled contract.

This is persistent. Once an operator has your keys, they sit on them forever.

---

## Reply cast 3

What we're NOT saying:

❌ That the researcher drained him (we don't name her; insufficient evidence)
❌ That Despark, Consensys, or Consensys Mesh are aware or complicit (no evidence)
❌ That every flagged address is conclusively stolen-funds (forensic inference, not proof)

What we ARE saying:

✅ Every on-chain claim is independently verifiable on any block explorer
✅ Despark released only the victim's own speech, citing "lawyer review"
✅ At least 4 other on-chain identifiable victims exist in the same batch
✅ The operator is still active today, $27K of fresh inflows in last 96h

---

## Reply cast 4

Asking publicly:

🟢 **Despark.io participants since Feb 2025** with weird on-chain activity post-call — email us, anonymously
🟢 **Exchanges + analytics firms** — the active operator wallets need attention; addresses in the canonical piece
🟢 **Despark / Consensys / Consensys Mesh** — we'll append any response

We are not seeking the researcher. We are seeking the operator, the channel that gave them this victim's keys, and the other affected parties in the same batch.

— RexIntel Investigations Desk
[link to canonical]
