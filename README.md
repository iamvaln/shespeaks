# SheSpeaks platform

Diagnostic journey for women in tech (front office) + coach follow-up space (admin), per
`SheSpeaks-Specification-plateforme.pdf` and the brand guide. See [`PLAN.md`](PLAN.md) for the build checklist.

- **Front office** (`/`): home → diagnostic (profile, diagnostic, branch A/B/C/D, speaker photo) → confirmation + personalised roadmap. FR/EN, mobile first, no account, autosave at every screen, resume via cookie or emailed link.
- **Admin** (`/admin`): passwordless coach login, dashboard, candidates list + fiche (answers, topic tracks review, subject, review grid, roadmap preview, status history, notes, photos), DevFest calendar, coaches, settings, email log.

## Stack

Next.js 15 (App Router, TypeScript) · **Postgres on Supabase** (`postgres` driver) · **Supabase Storage** for speaker photos · nodemailer (SMTP) · deployed on **Vercel**.

## Deploy: Supabase + Vercel

1. **Supabase** → create a project. Copy:
   - the **Transaction pooler** connection string (Project Settings → Database → Connection pooling, port 6543) → `DATABASE_URL`
   - the project URL → `SUPABASE_URL`, and the `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-side only).
2. **Create the schema** (once, then after each new file in `supabase/migrations/`):
   ```bash
   DATABASE_URL="postgresql://…" ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" npm run db:migrate
   ```
   (or paste `supabase/migrations/0001_init.sql` in the Supabase SQL editor). It seeds the DevFest calendar, enables Row Level Security on every table with no policy (the public Supabase API can't read any candidate data; the app uses the database role), and creates the first coach.
3. **Vercel** → import the repo and set the variables from `.env.example` (`APP_URL`, `DATABASE_URL`, `SUPABASE_*`, `SESSION_SECRET`, `CRON_SECRET`, `ADMIN_EMAIL`, `SMTP_*`, `MAIL_FROM`). The private `speaker-photos` bucket is created automatically on first upload.
4. **Reminders** run from **Vercel Cron** (`vercel.json`, daily at 07:00 UTC; Vercel sends `Authorization: Bearer $CRON_SECRET` itself). Hobby plans only allow daily crons; on Pro, change the schedule to hourly (`0 * * * *`) for finer reminder timing.

Photos: browsers upload **directly to Supabase Storage** through a short-lived signed URL (Vercel functions cap request bodies at ~4.5 MB; photos can be 10 Mo). The server then re-checks what landed (magic bytes, size, count) before registering it. Photos are shown through an authenticated route that redirects to a 5-minute signed URL.

## Run locally

```bash
cp .env.example .env.local      # set DATABASE_URL (any Postgres, e.g. a local one or a Supabase project), SESSION_SECRET, ADMIN_EMAIL…
npm install
npm run db:migrate              # creates tables + first coach
npm run dev                     # http://localhost:3000  — admin: /admin
npm test                        # unit tests (pure logic)
node scripts/smoke.mjs          # API journey for the 4 branches (server must be running)
```

Without `SUPABASE_URL`, photos are stored in `./data/uploads` (dev only). Without `SMTP_HOST`, emails are only recorded in Admin → Emails. The first coach logs in at `/admin/login` with an emailed one-time link (in dev without SMTP, the link is shown on screen).

## Emails

| Event | To | Content |
|---|---|---|
| Candidate leaves her email on the profile screen | candidate | welcome + personal resume link |
| **Diagnostic completed** | **candidate** | confirmation of reception + roadmap link (her language) |
| **Diagnostic completed** | **assigned coach + extra notification emails** | name, city, starting point, subject, contacts, direct link to the fiche |
| **Unfinished diagnostic** (default: after 24 h, then every 48 h, max 2) | **candidate** (if she gave an email) | reminder with resume link and progress |
| **Unfinished diagnostic** (same trigger) | **coach + extra notification emails** | digest of stalled candidates with WhatsApp numbers (works even without candidate email) |
| Coach login / invitation | coach | one-time link (15 min) |

Without `SMTP_HOST`, emails are only recorded in **Admin → Emails** (nothing is sent) — handy for local testing. Delay, interval, max count, extra recipients: **Admin → Paramètres**.

Reminders are driven by `/api/cron/reminders` (Vercel Cron, or any scheduler: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/reminders`). Runs are idempotent: each candidate is claimed before any email is sent.

## Notes on spec interpretation

- "Écran" split: Profil (1), Diagnostic (2: D1–D3, D4–D6), branch screens (A:2, B:2, C:2, D:2), Photo, final plan → 7 steps in the progress bar.
- A/B tracks: if fewer than 5 are produced by the spec rules (e.g. one domain × one angle), remaining angles on the same domain top up to 5 so the coach always has a full set. Parentheticals in domain names (e.g. "(Android, Flutter, iOS)") are dropped inside generated titles.
- Branch C abstract: regenerated from C1–C6 until the candidate edits it by hand; English template when she chose English (or "both" and the UI is English).
- Status « Sujet validé » requires subject title and abstract.
- Candidate-side tracks are hidden by default (setting), as specified for the test phase.
- Bamenda dates are "À confirmer" until edited in **Admin → Calendrier DevFest**.
- The internal deadline (26 Oct 2026) is shown to coaches on the dashboard and as a note in the candidate's calendar card.
- Emails are awaited before responding (serverless functions can be frozen once a response is sent).
- Contact details are only visible to signed-in coaches; photos are served only to their owner (cookie) or a coach.
