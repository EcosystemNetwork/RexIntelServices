# Newsletter — a self-hosted email platform for web3 events

A production-ready Next.js app that does the core of what Mailchimp does, for the cost of a domain, a Postgres host, and Resend's email API. Built specifically to be cheap to run and easy to extend.

**Realistic monthly cost** for 5,000 subscribers sending 4 campaigns/month:

| | Cost |
|---|---|
| Domain | ~$1/mo (annualized) |
| Postgres (Neon/Supabase free tier) | $0 |
| Resend (Free tier covers 3k/mo, Pro $20 covers 50k) | $0–$20 |
| Hosting (Vercel Hobby / Railway $5) | $0–$5 |
| **Total** | **$1–$26/mo** |

Compare to Mailchimp at ~$75/mo for 5k contacts.

---

## What's in the box

- **Subscriber management** — CSV import (with dedup, validation, suppression-list filtering), search, status tracking
- **Campaign composer** — HTML editor, live preview, merge tags (`{{firstName}}`)
- **Batched sending** — sends in chunks of 100 via Resend's batch endpoint, rate-limited, resumable on crash
- **Open & click tracking** — own-hosted pixel + redirect, no third-party trackers
- **Bounce & complaint handling** — webhook auto-suppresses hard bounces and spam complaints (this is the #1 thing that protects sender reputation)
- **Compliant unsubscribe** — branded page, plus RFC 8058 one-click unsubscribe header for Gmail/Yahoo bulk sender requirements
- **Suppression list** — global do-not-email list, automatically respected by all sends and CSV imports
- **Admin auth** — encrypted-cookie sessions, bcrypt passwords

## What's intentionally not done yet (with notes on how to add)

- **Drag-and-drop email builder** — the composer takes raw HTML. For a visual builder, drop in [`unlayer/react-email-editor`](https://github.com/unlayer/react-email-editor) on the new-campaign page.
- **A/B testing** — the schema supports it (you'd add a `variant` column to `sends`), but the UI doesn't.
- **Scheduled sends** — `campaigns.scheduledFor` exists in the schema. Wire up a cron worker (Vercel cron, Inngest, or a Railway background job) that polls for scheduled campaigns.
- **Double opt-in** — the `pending` subscriber status exists. Build a public signup page that creates a `pending` subscriber and emails a confirmation link (`/confirm/[token]`), set status to `active` on click.
- **Multi-user / teams** — single admin user only.
- **Templates** — campaigns are saved one-off. Adding a `templates` table is straightforward.

---

## Setup

### 1. Get a Postgres database

Easiest free options:
- [Neon](https://neon.tech) — 3 GB free, generous compute
- [Supabase](https://supabase.com) — 500 MB free, includes a UI

Copy the connection string. If you're using Supabase, use the **transaction pooler** URL (port 6543), not the direct connection.

### 2. Get a Resend account and verify your domain

1. Sign up at [resend.com](https://resend.com)
2. Go to **Domains → Add Domain**, enter the domain you'll send from (e.g. `mail.web3newsletter.xyz`)
3. Add the SPF, DKIM, and DMARC DNS records Resend gives you
4. **Wait for verification** (usually a few minutes, can take up to 48 hours)
5. Get an API key from **API Keys**

> ⚠️ **You cannot skip domain verification.** Sending from an unverified domain will result in your emails landing in spam or being rejected outright. Gmail and Yahoo now require SPF + DKIM + DMARC for any sender doing more than 5,000 messages/day.

### 3. Clone and install

```bash
git clone <this-repo> newsletter-app
cd newsletter-app
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

This creates all the tables. For production you'd use proper migrations (`db:generate` then `db:migrate`), but `db:push` is fine for getting started.

### 6. Create your admin user

```bash
npm run create-admin
```

Enter your email and a strong password.

### 7. Start the app

```bash
npm run dev
```

Visit http://localhost:3000, log in, import your 5,000 emails as CSV, and you're live.

### 8. Set up the webhook (do this before sending real campaigns)

After deploying:

1. In Resend dashboard → **Webhooks → Add Endpoint**
2. URL: `https://your-domain.com/api/webhooks/resend`
3. Events: `email.delivered`, `email.bounced`, `email.complained`
4. Copy the signing secret to `.env` as `RESEND_WEBHOOK_SECRET`
5. Redeploy

Without this, hard bounces won't be suppressed — and after enough bounces your sender reputation tanks.

---

## CSV format for importing

Required column: `email`
Optional columns: `first_name` (or `firstName` or `First Name`), `last_name` (or `lastName` or `Last Name`)

Example:
```csv
email,first_name,last_name
alice@example.com,Alice,Cooper
bob@example.com,Bob,
```

The importer:
- Validates email format
- Lowercases and dedupes within the file
- Filters out anything on the suppression list
- Filters out anything already in the database (no duplicates)
- Reports counts at the end

---

## Sending a campaign

1. **Compose** — Campaigns → New campaign. Use `{{firstName}}` to personalize. The composer has a preview pane.
2. **Save draft** — locks in the campaign so you can come back to it
3. **Send** — confirms, then sends in batches of 100 with a 1.1s delay between batches

For your 5,000-subscriber list, expect a send to take roughly **60–90 seconds**.

### Important: serverless timeout caveat

If you deploy to **Vercel Hobby**, serverless functions are capped at 60 seconds. That's borderline for 5k subscribers. Options:

- **Vercel Pro** — 300s limit, fine up to ~25k subscribers
- **Railway / Fly / DIY VPS** — no timeout, fine for any size
- **Background worker** — best for scale; use [Inngest](https://www.inngest.com), [Trigger.dev](https://trigger.dev), or a cron job that calls the send endpoint

For 50k+ subscribers, refactor `sendCampaign()` to enqueue jobs into a queue and process them in a worker.

---

## Deploy

### Vercel (easiest)

```bash
npx vercel
```

Then add all the env vars in the Vercel dashboard.

### Railway / Fly / VPS (better for sending at scale)

The app is a standard Next.js app. Just set the env vars and run `npm run build && npm start`.

---

## Architecture

```
src/
├── app/
│   ├── (admin)/                    # Auth-protected admin UI
│   │   ├── page.tsx                # Dashboard
│   │   ├── subscribers/            # List + CSV import
│   │   └── campaigns/              # List + composer
│   ├── api/
│   │   ├── auth/login              # POST { email, password }
│   │   ├── subscribers             # GET (list), POST (create)
│   │   ├── subscribers/import      # POST CSV
│   │   ├── campaigns               # GET (list), POST (create)
│   │   ├── campaigns/[id]/send     # POST trigger send
│   │   ├── webhooks/resend         # ⚡ bounce + complaint handler
│   │   └── track/
│   │       ├── open/[id]           # 1x1 pixel
│   │       └── click/[id]          # tracked redirect
│   ├── login/                      # Login page
│   └── unsubscribe/[token]/        # Public unsub page (+ RFC 8058 POST)
├── lib/
│   ├── auth.ts                     # iron-session + bcrypt
│   ├── db/
│   │   ├── schema.ts               # ⭐ Drizzle schema - the source of truth
│   │   └── index.ts                # DB connection
│   └── email/
│       ├── render.ts               # Merge tags, link rewriting, pixel injection
│       └── sender.ts               # ⭐ Batched send with retries + suppression
└── middleware.ts                   # Route protection
```

Key files to understand first: `lib/db/schema.ts` (data model) and `lib/email/sender.ts` (the actual send pipeline).

---

## Deliverability checklist (this is what makes or breaks you)

- ✅ Verified sending domain (SPF + DKIM + DMARC)
- ✅ Webhook configured to catch bounces & complaints
- ✅ Suppression list filters all sends
- ✅ One-click unsubscribe (RFC 8058)
- ✅ Plain-text fallback (auto-generated from HTML)
- ✅ List-Unsubscribe header

Things to do yourself:
- **Warm up your domain** — don't blast 5,000 emails on day 1 from a brand-new domain. Send 200 the first day, 500 the second, 1k the third, scale up over a week.
- **Send to engaged subscribers** — if your 5k list is old, segment it: send to people who've engaged in the last 6 months first. A high bounce rate on the first send will get you blocked.
- **Set up DMARC monitoring** — [dmarc.postmarkapp.com](https://dmarc.postmarkapp.com) is free and tells you if anyone's spoofing your domain.

---

## Cost projections at scale

| Subscribers | Sends/month | Resend cost | DB | Total |
|---|---|---|---|---|
| 5k | 20k | Free | Free | **$0** |
| 25k | 100k | $20 | Free | **$20** |
| 100k | 400k | $35 | $19 | **$54** |
| 500k | 2M | $90 | $69 | **$159** |

Compare Mailchimp: 100k contacts is ~$300/mo, 500k is ~$1,800/mo.

---

## License

MIT — do whatever you want.
