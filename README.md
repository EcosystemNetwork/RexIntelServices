# Rex Intel Services — self-hosted newsletter & intelligence platform

A production-ready Next.js app that powers your monthly intelligence briefing newsletter. Features a public landing page for subscriber acquisition, a full admin backend for email management, campaign composition, and sending — all with premium dark-mode UI.

**Realistic monthly cost** for 5,000 subscribers sending 1 campaign/month:

| | Cost |
|---|---|
| Domain | ~$1/mo (annualized) |
| Postgres (Neon/Supabase free tier) | $0 |
| Resend (Free tier covers 3k/mo, Pro $20 covers 50k) | $0–$20 |
| Hosting (Vercel Hobby / Railway $5) | $0–$5 |
| **Total** | **$1–$26/mo** |

---

## What's in the box

### Public-facing
- **Landing page** (`/`) — Premium dark-mode hero with email signup form
- **Public subscribe API** (`POST /api/subscribe`) — Handles dedup, re-subscription, suppression list checks
- **Branded unsubscribe page** — Compliant one-click unsubscribe + RFC 8058 for Gmail/Yahoo

### Admin backend (`/dashboard`)
- **Dashboard** — Overview stats for active subscribers, unsubscribed, bounced, campaigns
- **Subscriber management** — CSV import (with dedup, validation, suppression-list filtering), search, status tracking
- **Campaign composer** — HTML editor, live preview, merge tags (`{{firstName}}`)
- **Batched sending** — sends in chunks of 100 via Resend's batch endpoint, rate-limited, resumable on crash
- **Open & click tracking** — own-hosted pixel + redirect, no third-party trackers
- **Bounce & complaint handling** — webhook auto-suppresses hard bounces and spam complaints
- **Suppression list** — global do-not-email list, automatically respected by all sends and imports
- **Admin auth** — encrypted-cookie sessions, bcrypt passwords, server-side logout

---

## Setup

### 1. Get a Postgres database

Easiest free options:
- [Neon](https://neon.tech) — 3 GB free, generous compute
- [Supabase](https://supabase.com) — 500 MB free, includes a UI

### 2. Get a Resend account and verify your domain

1. Sign up at [resend.com](https://resend.com)
2. Go to **Domains → Add Domain**, enter the domain you'll send from
3. Add the SPF, DKIM, and DMARC DNS records Resend gives you
4. Get an API key from **API Keys**

### 3. Clone and install

```bash
git clone <this-repo> RexIntelServices
cd RexIntelServices
npm install
```

### 4. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:
- `DATABASE_URL` from your Postgres provider
- `RESEND_API_KEY` from Resend
- `APP_URL` — `http://localhost:3000` for dev, your real URL for prod
- `SESSION_PASSWORD` — generate with `openssl rand -base64 32`
- `RESEND_WEBHOOK_SECRET` — leave blank for now, fill in after step 7

### 5. Set up the database

```bash
npm run db:push
```

### 6. Create your admin user

```bash
npm run create-admin
```

### 7. Start the app

```bash
npm run dev
```

Visit `http://localhost:3000` for the public landing page. Log in at `/login` to access the admin at `/dashboard`.

### 8. Set up the webhook (before sending real campaigns)

1. In Resend dashboard → **Webhooks → Add Endpoint**
2. URL: `https://your-domain.com/api/webhooks/resend`
3. Events: `email.delivered`, `email.bounced`, `email.complained`
4. Copy the signing secret to `.env` as `RESEND_WEBHOOK_SECRET`

---

## Architecture

```
src/
├── app/
│   ├── page.tsx                       # Public landing page with signup
│   ├── (admin)/                       # Auth-protected admin UI
│   │   ├── layout.tsx                 # Admin sidebar shell
│   │   ├── dashboard/page.tsx         # Dashboard stats
│   │   ├── subscribers/page.tsx       # List + CSV import
│   │   └── campaigns/                 # List + composer
│   │       ├── page.tsx
│   │       └── new/page.tsx
│   ├── api/
│   │   ├── subscribe                  # POST (public signup)
│   │   ├── auth/login                 # POST { email, password }
│   │   ├── auth/logout                # POST (destroy session)
│   │   ├── subscribers                # GET (list), POST (create)
│   │   ├── subscribers/import         # POST CSV
│   │   ├── campaigns                  # GET (list), POST (create)
│   │   ├── campaigns/[id]/send        # POST trigger send
│   │   ├── webhooks/resend            # Bounce + complaint handler
│   │   └── track/
│   │       ├── open/[id]              # 1x1 pixel
│   │       └── click/[id]             # tracked redirect
│   ├── login/                         # Login page
│   └── unsubscribe/[token]/           # Public unsub page (+ RFC 8058)
├── lib/
│   ├── auth.ts                        # iron-session + bcrypt
│   ├── db/
│   │   ├── schema.ts                  # Drizzle schema
│   │   └── index.ts                   # DB connection
│   └── email/
│       ├── render.ts                  # Merge tags, link rewriting, pixel
│       └── sender.ts                  # Batched send with retries
└── middleware.ts                      # Route protection
```

---

## Routes

| Route | Auth | Description |
|---|---|---|
| `/` | Public | Landing page with newsletter signup |
| `/login` | Public | Admin login |
| `/dashboard` | Admin | Overview dashboard |
| `/subscribers` | Admin | Subscriber list + CSV import |
| `/campaigns` | Admin | Campaign list |
| `/campaigns/new` | Admin | Campaign composer + send |
| `/unsubscribe/[token]` | Public | Branded unsubscribe page |

---

## License

MIT — do whatever you want.
