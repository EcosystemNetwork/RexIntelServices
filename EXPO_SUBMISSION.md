# RexIntel — AI & Big Data Expo NA 2026 Submission

**Track 4 — Data & Intelligence**
**Live demo:** `/expo` (on the production deployment)
**Models:** `gemini-2.5-flash` (live synthesis), `gemini-2.5-pro` (available for deeper paths)
**Access:** Free Google AI Studio API key — no billing required.

---

## Project: RexIntel — Crypto Investigations for the AI Era

RexIntel is a working, in-production crypto-intelligence service. We unify five
public attribution sources (OFAC, OFSI, EU sanctions, L2Beat, curated industry
labels) and two community sources (victim traces, community loss reports) into
one address attribution graph, then point Gemini at it.

**What the demo shows on stage:**

1. **Paste a wallet → Gemini investigator brief.** Pull every attribution we
   have on the address, hand the structured context to Gemini 2.5 Flash, get
   back a case-file brief with verdict, attribution, linked incidents, and
   next steps. Every claim is cited against a source label.

2. **Natural-language Q&A over the corpus.** Ask the indexed intel corpus
   anything in plain English. Citations are forced — Gemini cites by
   `publicId` or it says "not in the indexed corpus." No hallucinated answers.

3. **The moat toggle.** Same graph, two trust modes — industry-only
   (sanctions + curated) vs industry + community (adds victim-trace,
   community-loss-report, bounty-claim sources). The delta is the proof.

---

## Why this fits Track 4

| Track 4 focus | What we shipped |
|---|---|
| RAG over proprietary/multi-source data | 7 attribution sources unified; Gemini does retrieval-augmented synthesis at query time |
| AI-powered data pipelines + validation | Cron harvesters for OFAC SDN, OFSI consolidated list, EU sanctions, L2Beat — re-ingest and dedupe nightly with source-precedence rules |
| Analytics agents for NL querying | `POST /api/expo/query` — plain English over approved intel corpus with forced publicId citations |
| Anomaly detection | `/trace` runs outbound 3-hop BFS from a victim address, terminating at sanctioned/mixer/bridge/exchange categories; trail writes back as community-class graph attributions |
| Knowledge graph extraction | Address ↔ incident edges, owner-cluster edges, co-occurrence edges all derived from approved community intel |

---

## Architecture

```
                  /expo (Next.js page)
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
 /api/expo/brief  /api/expo/query   /graph (existing)
        │              │
        ▼              ▼
  lookupAddress   lookupIntel + extractKeywords
   Context           getGraphSummary
        │              │
        ▼              ▼
  addresses +      submissions (intel) + addresses (stats)
  address_attribs
  intel_addresses
        │              │
        └──────┬───────┘
               ▼
       Gemini 2.5 Flash
   (system prompt enforces source citation)
```

**Stack:** Next.js 14 (App Router) · Neon Postgres + Drizzle ORM · Upstash
Redis rate-limiting · `@google/generative-ai` SDK · Vercel-hosted.

**Data scale (as of submission):**
- ~83 curated seed addresses + OFAC/OFSI/EU harvesters (1000s of sanctioned wallets)
- Approved intel corpus with `kind ∈ {tip, original, incident}` taxonomy
- $9.4B+ in priced lost/seized crypto tracked on-chain

---

## What's measurably new for the expo

The graph + harvesters were already in production. **What this hackathon
added:**

1. `src/lib/gemini.ts` — model wrapper (Flash + Pro)
2. `src/lib/expo-context.ts` — context builders (address lookup, intel
   retrieval, graph summary)
3. `src/app/api/expo/brief/route.ts` — POST endpoint, rate-limited 20/hr/IP
4. `src/app/api/expo/query/route.ts` — POST endpoint, rate-limited 30/hr/IP
5. `src/app/expo/page.tsx` + `expo-demo.tsx` — the live demo surface

Total surface added: ~5 files, ~900 LOC. The underlying graph (5k+ symbols,
9k+ relationships) is what makes the briefs actually useful.

---

## Security / governance posture

- **No PII in prompts.** Gemini sees the address graph + approved intel
  bodies — never submitter emails, IPs, or unverified queue items.
- **Citations enforced via system prompt.** Both endpoints' system prompts
  refuse fallback knowledge and require source labels or publicIds.
- **Rate-limited at the IP layer** via Upstash Redis (production) with an
  in-process fallback.
- **No new attack surface on the database** — both routes are read-only.

---

## How to run locally

```sh
# Add a free Google AI Studio key to .env.local:
#   GEMINI_API_KEY=...

npm install
npm run dev
# Visit http://localhost:3000/expo
```

A free Google AI Studio key supplies plenty of headroom for the live stage demo.

---

## Team

Solo founder build — Rex Deus.
Stack experience: crypto forensics, Postgres at scale, Next.js, security.
RexIntel has been live since early 2026 and is the production substrate this
demo sits on top of.

Repo: this repository
Public site: rexintelservice (X: [@rexintelservice](https://x.com/rexintelservice))
