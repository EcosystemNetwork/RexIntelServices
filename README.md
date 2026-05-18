# RexIntel

**Crypto + AI intelligence for builders. One weekly briefing, plus live boards the field contributes to.**

Live at **[rexintelservices.com](https://rexintelservices.com)**.

RexIntel is a self-hosted intelligence platform: a public-facing field guide of accelerators, fellowships, grants, capital, perks, residencies and pop-up cities — plus a community intel wire for tips, originals and incident reports — wrapped around a production-grade newsletter stack with subscriber management, campaign sending, bounce/complaint handling and an on-chain address graph.

Built on Next.js 14, Drizzle + Postgres, Resend, and Upstash.

---

## What it does

### Public surfaces

- **Landing** (`/`) — Hero, subscriber capture, signal preview
- **Intel** (`/intel`) — Lane-switcher across Signals, Accel, Fellowships, Grants, Capital, Perks, Cities, Residencies; list / grid view toggle
- **Intel detail** (`/intel/[publicId]`) — Public intel pages with kind kicker (tip / original / incident), source attribution, OG cards
- **Address graph** (`/graph`) — Force-directed visualization of on-chain entity relationships; community-data toggle (industry-only vs industry + community)
- **Address lookup** (`/intel/address/[chain]/[address]`) — Per-address attribution view fed by harvesters + community submissions
- **Victim trace** (`/trace`) — Etherscan-driven 3-hop outbound BFS; counterparties land in the moat as `victim-trace`-sourced rows
- **Recovery bounties** (`/bounties`, `/bounties/new`, `/bounties/[publicId]`) — Public bounty board with victim-verification via email OTP and white-hat claim submission
- **Submit** (`/submit`, `/submit/edit/[token]`) — Public intake for intel, programs, capital, events, jobs, perks; token-gated edits for in-flight submissions
- **Leaderboard** (`/intel/leaderboard`) — Contributor ranking + community prize pool balance
- **Contributors** (`/contributors`, `/contributors/[handle]`) — Contributor profiles
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
- `DATABASE_URL` — your Postgres URL
- `RESEND_API_KEY` — from Resend
- `APP_URL` — `http://localhost:3000` for dev, your domain for prod
- `SESSION_PASSWORD` — `openssl rand -base64 32`
- `RESEND_WEBHOOK_SECRET` — fill in after step 7
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — rate limiting on public endpoints
- `CRON_SECRET` — shared secret for Vercel Cron headers
- `DIGEST_BYPASS_EDITORIAL_BAR` — `true` only when force-drafting an empty week (default off)

### 5. Database

```bash
npm run db:push
```

### 6. Create your admin

```bash
npm run create-admin
```

### 7. Run it

```bash
npm run dev
```

Public landing at `http://localhost:3000`, log in at `/login`, admin at `/dashboard`.

### 8. Webhook (before sending real campaigns)

1. Resend → **Webhooks → Add Endpoint**
2. URL: `https://rexintelservices.com/api/webhooks/resend`
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
```

---

## Architecture

```
src/
├── app/
│   ├── page.tsx                # Public landing
│   ├── intel/                  # Lane-switcher + detail + leaderboard + address graph
│   │   ├── page.tsx
│   │   ├── _lanes/             # signals, accel, fellowships, grants, capital,
│   │   │                       # perks, cities, residencies
│   │   ├── [publicId]/         # Intel detail page
│   │   ├── address/            # Address graph view
│   │   ├── leaderboard/
│   │   └── feed.xml/
│   ├── accelerators|fellowships|grants|capital|perks|residencies|
│   │   pop-up-cities|hackathons|events|jobs|contributors|graph|search/
│   ├── submit/                 # Public submission intake
│   ├── (admin)/                # Auth-protected admin
│   │   ├── dashboard/
│   │   ├── subscribers/
│   │   ├── campaigns/
│   │   └── submissions/        # Moderation queue
│   ├── api/
│   │   ├── subscribe           # Public signup
│   │   ├── submit              # Public submission intake
│   │   ├── intel/vote          # Magic-link voting for prize pool
│   │   ├── auth/{login,logout}
│   │   ├── subscribers         # List + import
│   │   ├── submissions         # Admin moderation
│   │   ├── campaigns           # CRUD + send
│   │   ├── webhooks/resend     # Bounce + complaint handler
│   │   ├── cron/               # Vercel Cron handlers
│   │   ├── graph               # Address graph data
│   │   └── track/{open,click}  # Pixel + redirect
│   ├── login/
│   └── unsubscribe/[token]/
├── lib/
│   ├── auth.ts                 # iron-session + bcrypt
│   ├── db/                     # Drizzle schema + connection
│   ├── email/                  # Merge tags, link rewriting, batched sender
│   └── intel/                  # Kind taxonomy, editorial bar, voting
├── components/                 # Shared UI (PublicShell, chips, icons)
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

## Tech

- **Next.js 14** (App Router) on Node
- **Drizzle ORM** + Postgres (Neon serverless driver)
- **Resend** for transactional + campaign email, **svix** for webhook verification
- **iron-session** + bcryptjs for admin auth
- **Upstash Redis** for rate limiting public endpoints
- **react-force-graph-2d** for the address graph
- **Tailwind** for styling, custom dark theme

---

## License

MIT.
