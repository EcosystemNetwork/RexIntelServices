# RexIntel

**Crypto + AI intelligence for builders. One weekly briefing, plus live boards the field contributes to.**

Live at **[rexintelservices.com](https://rexintelservices.com)**.

RexIntel is a self-hosted intelligence platform: a public-facing field guide of accelerators, fellowships, grants, capital, perks, residencies and pop-up cities — plus a community intel wire for tips, originals and investigative reporting — wrapped around a production-grade newsletter stack with subscriber management, campaign sending, bounce/complaint handling, an on-chain address attribution graph, a victim-trace tool, and a recovery-bounty board.

Built on Next.js 14, Drizzle + Postgres, Resend, and Upstash.

---

## What it does

### Public surfaces

- **Landing** (`/`) — Hero, subscriber capture, signal preview
- **Intel** (`/intel`) — Lane-switcher across Signals, Accel, Fellowships, Grants, Capital, Perks, Cities, Residencies; list / grid view toggle (default grid). Theme-adaptive: respects `prefers-color-scheme` with a flash-free no-paint script.
- **Intel detail** (`/intel/[publicId]`) — Public intel pages with kind kicker (tip / original / incident), source attribution, OG cards. Featured investigative pieces (RexIntel Investigations Desk) sort to the top.
- **Address graph** (`/graph`) — Force-directed visualization of on-chain entity relationships; community-data toggle (industry-only vs industry + community)
- **Address lookup** (`/intel/address/[chain]/[address]`) — Per-address attribution view fed by harvesters + community submissions
- **Victim trace** (`/trace`, `/trace/[publicId]`) — Etherscan-driven 3-hop outbound BFS with shareable result pages; counterparties land in the moat as `victim-trace`-sourced rows
- **Recovery bounties** (`/bounties`, `/bounties/new`, `/bounties/[publicId]`) — Public bounty board with victim-verification via email OTP and white-hat claim submission. **Custody rail is currently paused** (`BOUNTY_CUSTODY_RAIL_ENABLED=false`); listings + claim submissions remain open while a new escrow rail is selected.
- **Expo** (`/expo`) — AI & Big Data Expo submission portal: investigator briefs + Gemini-powered RAG query interface over the moat layer
- **Submit** (`/submit`, `/submit/edit/[token]`) — Public intake for intel, programs, capital, events, jobs, perks; token-gated edits for in-flight submissions
- **Leaderboard** (`/intel/leaderboard`) — Contributor ranking + community prize pool balance
- **Contributors** (`/contributors`, `/contributors/[slug]`) — Contributor profiles
- **Search** (`/search`) — Site-wide search across lanes + intel
- **Hackathons / Events / Jobs / Pop-up cities / Accelerators / Fellowships / Grants / Capital / Perks / Residencies** — Directory routes
- **Feed** (`/intel/feed.xml`) — RSS for the intel wire
- **Unsubscribe** (`/unsubscribe/[token]`) — Branded one-click unsub, RFC 8058 compliant
- **Sign-in** (`/login`) — Magic-Link OTP for operators; Magic-Link wallet sign-in for contributors via the connect-wallet button (Base mainnet)

### Admin (`/dashboard`)

- Dashboard with subscriber and campaign stats
- Subscriber management — CSV import, XLSX export, bulk ops, dedup, suppression filtering, status tracking
- Tag management — create / rename / delete subscriber tags, drive campaign segmentation
- Suppression list — global, respected by every send and import; manage entries directly
- Users (contributors) — operator view of contributor accounts, points, tier
- Campaign composer — HTML editor, live preview, merge tags (`{{firstName}}`), recipient counts, duplicate, schedule, test-send
- Batched sending — chunks via Resend, rate-limited, resumable
- Open + click tracking — own-hosted pixel and redirect, no third-party trackers
- Bounce + complaint webhook auto-suppresses hard bounces and spam complaints
- Submission moderation queue — approve / reject inbound intel and listings, single + bulk review, feature toggle
- Bounty overview — counters, failed/stuck payouts, awaiting verification, unfunded drafts
- Bounty claims queue — adjudicate white-hat claim submissions, approve with payout amount or reject with reason
- Magic-Link OTP sign-in (no passwords), iron-session encrypted cookies, allowlist via `OPERATOR_EMAILS`

### Scheduled jobs (Vercel Cron)

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/dispatch-scheduled` | every 5 min | Send queued campaigns at their scheduled time |
| `/api/cron/sweep-expired-bounties` | hourly :15 | Mark expired bounties + flag payouts that need attention |
| `/api/cron/settle-monthly-prizes` | daily 01:00 UTC | Compute monthly prize-pool settlement |
| `/api/cron/sweep-vote-tokens` | daily 03:00 UTC | Expire stale magic-link vote tokens |
| `/api/cron/harvest-ofac` | Mon 04:00 UTC | Pull US Treasury OFAC SDN crypto addresses |
| `/api/cron/harvest-ofsi` | Mon 05:00 UTC | Pull UK OFSI consolidated list crypto addresses |
| `/api/cron/harvest-eu-sanctions` | Mon 06:00 UTC | Pull EU consolidated sanctions crypto addresses |
| `/api/cron/import-rekt-leaderboard` | Mon 02:00 UTC | Mirror rekt.news leaderboard into incidents |
| `/api/cron/import-defillama-hacks` | Sun 23:00 UTC | Mirror DefiLlama Hacks feed into incidents |
| `/api/cron/harvest-luma` | daily 13:00 UTC | Harvest curated Luma events |
| `/api/cron/backfill-program-images` | daily 14:00 UTC | Fetch missing OG / hero images for programs |
| `/api/cron/draft-digest` | Sun 22:00 UTC | Auto-draft the weekly digest from approved intel |
| `/api/cron/gemini-draft-intel` | daily 16:00 UTC | Auto-draft pending intel for ≥$1M DefiLlama hacks via Gemini Pro |

---

## Cost

For ~5,000 subscribers and one campaign per month:

| Component | Cost |
|---|---|
| Domain | ~$1/mo (annualized) |
| Postgres (Neon / Supabase free tier) | $0 |
| Resend (Free 3k/mo, Pro $20 covers 50k) | $0–$20 |
| Hosting (Vercel Hobby / Railway $5) | $0–$5 |
| **Total** | **$1–$26/mo** |

---

## Setup

### 1. Postgres

Pick one:
- [Neon](https://neon.tech) — 3 GB free
- [Supabase](https://supabase.com) — 500 MB free, includes a UI

### 2. Resend + domain

1. Sign up at [resend.com](https://resend.com)
2. **Domains → Add Domain**, then add the SPF / DKIM / DMARC records
3. Grab an API key from **API Keys**

### 3. Clone + install

```bash
git clone https://github.com/<you>/RexIntelServices
cd RexIntelServices
npm install
```

### 4. Configure

```bash
cp .env.example .env
```

Fill in:
- `DATABASE_URL` — your Postgres URL (Neon pooled endpoint, `sslmode=require`)
- `RESEND_API_KEY` — from Resend
- `APP_URL` — `http://localhost:3000` for dev, your domain for prod
- `SESSION_PASSWORD` — `openssl rand -base64 32`
- `RESEND_WEBHOOK_SECRET` — fill in after step 8
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — rate limiting on public endpoints
- `CRON_SECRET` — shared secret for Vercel Cron headers
- `DIGEST_FROM_EMAIL` / `DIGEST_FROM_NAME` — sender used by the weekly digest cron
- `OPERATOR_EMAILS` — comma-separated allowlist for operator Magic-Link sign-in (REQUIRED; empty allowlist locks everyone out)
- `NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY` / `MAGIC_SECRET_KEY` — Magic-Link auth (live `pk_live_`/`sk_live_`, test `pk_test_`/`sk_test_`)
- `NEXT_PUBLIC_MAGIC_RPC_URL` / `NEXT_PUBLIC_MAGIC_CHAIN_ID` — chain Magic provisions contributor wallets on (defaults to Base mainnet, `8453`)
- `ETHERSCAN_API_KEY` — powers `/trace` (free key from etherscan.io); optional `ETHERSCAN_RPS` override
- `GEMINI_API_KEY` — powers `/expo` RAG query interface and the `gemini-draft-intel` cron
- `BOUNTY_CUSTODY_RAIL_ENABLED` — `false` while the escrow rail is being re-selected; gates `/bounties/new` and POST
- `DIGEST_BYPASS_EDITORIAL_BAR` — `true` only when force-drafting an empty week (default off)

### 5. Database

```bash
npm run db:push
```

### 6. Provision an operator

Authentication is Magic-Link OTP — there are no passwords. The script below
ensures the `users` row exists for an operator email so FK targets (review,
award, etc.) resolve before the operator first signs in. The same row is
upserted on first sign-in too, so this step is optional.

```bash
npm run create-admin -- you@yourdomain.com
```

Then add that address to `OPERATOR_EMAILS` in your `.env` (and on Vercel).

### 7. Run it

```bash
npm run dev
```

Public landing at `http://localhost:3000`, sign in at `/login` (Magic-Link OTP), admin at `/dashboard`.

### 8. Webhook (before sending real campaigns)

1. Resend → **Webhooks → Add Endpoint**
2. URL: `https://<your-domain>/api/webhooks/resend`
3. Events: `email.delivered`, `email.bounced`, `email.complained`
4. Copy the signing secret into `.env` as `RESEND_WEBHOOK_SECRET`

### 9. Seed (optional)

Populate intel lanes and directories with curated data:

```bash
npx tsx scripts/seed-accelerators.ts
npx tsx scripts/seed-fellowships.ts
npx tsx scripts/seed-grants.ts
npx tsx scripts/seed-capital.ts
npx tsx scripts/seed-perks.ts
npx tsx scripts/seed-residencies.ts
npx tsx scripts/seed-popup-cities.ts
npx tsx scripts/seed-hackathons.ts
npx tsx scripts/seed-events-flagships.ts
npx tsx scripts/seed-jobs.ts
npx tsx scripts/seed-intel-tips.ts
npx tsx scripts/seed-intel-originals.ts
npx tsx scripts/seed-intel-incidents.ts
npx tsx scripts/seed-intel-addresses.ts

# Investigations Desk pieces (featured at top of /intel):
npx tsx scripts/seed-intel-casper-hackathon-expose.ts
npx tsx scripts/seed-intel-investigations-2026-05-18.ts   # Despark / Oriolo / Pink Drainer
npx tsx scripts/seed-intel-github-key-sweeper-expose.ts
```

---

## Architecture

```
src/
├── app/
│   ├── page.tsx                # Public landing
│   ├── intel/                  # Lane-switcher + detail + leaderboard + address views
│   │   ├── page.tsx
│   │   ├── _lanes/             # signals, accelerators, fellowships, grants, capital,
│   │   │                       # perks, cities, residencies
│   │   ├── [publicId]/         # Intel detail page
│   │   ├── address/            # Per-address attribution view
│   │   ├── leaderboard/
│   │   └── feed.xml/
│   ├── graph/                  # Force-directed address graph + community toggle
│   ├── trace/                  # Victim trace tool (3-hop outbound BFS)
│   │   └── [publicId]/         # Shareable trace result page
│   ├── bounties/               # Public bounty board + claim flow
│   │   ├── new/                # Post a bounty
│   │   └── [publicId]/         # Detail, victim-verify panel, claim form
│   ├── search/                 # Site-wide search
│   ├── contributors/           # Contributor profiles
│   ├── accelerators|fellowships|grants|capital|perks|residencies|
│   │   pop-up-cities|hackathons|events|jobs/
│   ├── submit/                 # Public submission intake + token-gated edit
│   ├── (admin)/                # Operator-gated admin
│   │   ├── dashboard/
│   │   ├── subscribers/        # List, import, export, bulk
│   │   ├── tags/               # Subscriber tags
│   │   ├── suppressions/       # Suppression list
│   │   ├── users/              # Contributors view
│   │   ├── campaigns/          # CRUD + composer + send
│   │   ├── submissions/        # Moderation queue
│   │   ├── bounty-overview/    # Counters + failed/stuck payouts
│   │   └── bounty-claims/      # Adjudication queue
│   ├── api/
│   │   ├── subscribe           # Public signup
│   │   ├── submit              # Public submission intake
│   │   ├── trace               # Victim trace (Etherscan-driven)
│   │   ├── bounties            # Post/list/claim bounty
│   │   ├── intel/vote          # Magic-link voting for prize pool
│   │   ├── auth/operator/      # Operator Magic-Link OTP
│   │   ├── auth/magic/         # Contributor Magic-Link wallet auth
│   │   ├── auth/email/         # Email-OTP (victim verification)
│   │   ├── auth/logout
│   │   ├── subscribers         # CRUD, bulk, import, export
│   │   ├── tags, suppressions  # Admin CRUD
│   │   ├── submissions         # Admin moderation (single + bulk + feature)
│   │   ├── campaigns           # CRUD, schedule, send, test-send, duplicate
│   │   ├── admin/              # contributors, bounties, bounty-claims
│   │   ├── webhooks/resend     # Bounce + complaint handler
│   │   ├── cron/               # 12 Vercel Cron handlers (see table above)
│   │   ├── graph               # Address graph data
│   │   ├── events/parse-url    # Event URL → structured payload
│   │   ├── jobs/parse-url      # Job URL → structured payload
│   │   ├── diag/otp-health     # OTP delivery diagnostic
│   │   └── track/{open,click}  # Pixel + redirect
│   ├── login/
│   └── unsubscribe/[token]/
├── lib/
│   ├── auth.ts                 # iron-session, operator allowlist, Magic verification
│   ├── db/                     # Drizzle schema + connection
│   ├── email/                  # Merge tags, link rewriting, batched sender
│   └── intel/                  # Kind taxonomy, editorial bar, voting
├── components/                 # Shared UI (PublicShell, chips, icons, vote, connect-wallet)
└── middleware.ts               # Route protection
```

---

## Intel kind taxonomy

Every intel record carries a `kind`:

- **tip** — anonymous sighting or rumor, lower bar to publish
- **original** — RexIntel-authored analysis or reporting
- **incident** — confirmed exploit / hack / failure with on-chain or public evidence

`original` and `incident` are load-bearing for the editorial bar: the weekly digest cron will not draft an issue unless at least one of those exists for the period (override with `DIGEST_BYPASS_EDITORIAL_BAR=true`).

---

## Investigations Desk

RexIntel runs an investigations pillar alongside the wire. Each piece is anonymous in copy by default (sources protected; identifying material held in the case file and shared only with credentialed legal / journalistic / forensics counterparties on request), follows a fixed editorial structure (lede + on-chain timeline + "what we are not saying / what we are saying" + methodology + CTA), and ships as a featured `kind=original` intel record sorted to the top of `/intel`.

Featured pieces live alongside their drafts under `drafts/` and are version-controlled with the article copy. Re-running the corresponding seed script in `scripts/` refreshes the live record idempotently. Naming doctrine: corporate principals in their official capacity are named; private individuals are not named until a regulator or court does so first.

---

## Tech

- **Next.js 14** (App Router) on Node
- **Drizzle ORM** + Postgres (Neon serverless driver)
- **Resend** for transactional + campaign email, **svix** for webhook verification
- **Magic SDK** for Magic-Link OTP (operators) and Magic-Link wallet sign-in (contributors, Base mainnet)
- **iron-session** encrypted-cookie sessions
- **Upstash Redis** for rate limiting public endpoints
- **react-force-graph-2d** for the address graph
- **papaparse** + **exceljs** for subscriber CSV import / XLSX export
- **Etherscan API** for the victim trace tool
- **Google Gemini** for the `/expo` RAG query interface and the daily intel-draft cron
- **Tailwind** for styling, theme-adaptive design tokens (light / dark via `data-theme` attribute with `prefers-color-scheme` default and flash-free no-paint script)
- **Vercel Analytics** + **Speed Insights**

---

## License

MIT.
