# SheSpeaks platform

Diagnostic journey for women in tech (front office) + coach follow-up space (admin), per
`SheSpeaks-Specification-plateforme.pdf` and the brand guide. See [`PLAN.md`](PLAN.md) for the build checklist.

- **Front office** (`/`): home → diagnostic (profile, diagnostic, branch A/B/C/D, speaker photo) → confirmation + personalised roadmap. FR/EN, mobile first, no account, autosave at every screen, resume via cookie or emailed link.
- **Admin** (`/admin`): passwordless coach login, dashboard, candidates list + fiche (answers, topic tracks review, subject, review grid, roadmap preview, status history, notes, photos), DevFest calendar, coaches, settings, email log.

## Stack

Next.js 15 (App Router, TypeScript) · **Postgres on Supabase** (`postgres` driver) · **Supabase Storage** for speaker photos · **Resend** (email) · deployed on **Vercel**.

## Deploy: Supabase + Vercel

1. **Supabase** → create a project. The easiest way is Vercel's **Supabase integration** (Vercel → Storage / Integrations): it creates `POSTGRES_URL` (the pooled connection, port 6543), `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for you, and the app reads them as they are (`DATABASE_URL` is only needed to override `POSTGRES_URL`). Doing it by hand instead: take the **Transaction pooler** string (Project Settings → Database → Connection pooling) as `DATABASE_URL`, the project URL as `SUPABASE_URL`, and the `service_role` key as `SUPABASE_SERVICE_ROLE_KEY` (server-side only).
   - **Scope matters:** variables added by the integration are scoped to *Production* only. Preview deployments (every PR) get none of them, and the build's environment check fails. In Vercel → Settings → Environment Variables, edit each one and also tick **Preview** (and **Development** if you use `vercel dev`).
   - Previews then talk to the same database as production. Fine before launch; afterwards use a separate Supabase project (or branch) for Preview.
2. **The schema creates itself.** Every Vercel build runs `npm run db:deploy` before `next build`: it applies pending migrations (`supabase/migrations/NNNN_name.sql`), then seeds reference data. If a migration fails, the build fails and the previous deployment keeps serving. Nothing to run by hand. (Manual equivalents: `npm run db:setup`, `db:status`; see *Database, CI and deployments* below.)
3. **Vercel** → import the repo and set the variables from `.env.example` (`APP_URL`, `DATABASE_URL`/`POSTGRES_URL`, `SUPABASE_*`, `SESSION_SECRET`, `CRON_SECRET`, `ADMIN_EMAIL`, `RESEND_API_KEY`, `MAIL_FROM`). The private `speaker-photos` bucket is created automatically on first upload.
4. **Reminders** run from **Vercel Cron** (`vercel.json`, daily at 07:00 UTC; Vercel sends `Authorization: Bearer $CRON_SECRET` itself). Hobby plans only allow daily crons; on Pro, change the schedule to hourly (`0 * * * *`) for finer reminder timing.

Photos: browsers upload **directly to Supabase Storage** through a short-lived signed URL (Vercel functions cap request bodies at ~4.5 MB; photos can be 10 Mo). The server then re-checks what landed (magic bytes, size, count) before registering it. Photos are shown through an authenticated route that redirects to a 5-minute signed URL.

## Run locally

```bash
cp .env.example .env.local      # set DATABASE_URL (any Postgres, e.g. a local one or a Supabase project), SESSION_SECRET, ADMIN_EMAIL…
npm install
npm run db:setup                # creates tables, seeds the DevFest calendar and the first coach
npm run dev                     # http://localhost:3000  — admin: /admin
npm test                        # unit tests (pure logic)
node scripts/smoke.mjs          # API journey for the 4 branches (server must be running)
```

Without `SUPABASE_URL`, photos are stored in `./data/uploads` (dev only). Without `RESEND_API_KEY`, emails are only recorded in Admin → Emails. The first coach logs in at `/admin/login` with an emailed one-time link (in dev without Resend, the link is shown on screen).

## Database, CI and deployments

**Migrations** live in `supabase/migrations/NNNN_description.sql` and are applied in order by `scripts/db.mjs`.
- Each file runs in **one transaction** that first takes a Postgres advisory lock, so parallel builds can never apply a file twice or interleave; a failing file rolls back completely.
- Applied files are recorded in `schema_migrations` with a **checksum**. Editing an applied file is refused (exit 1): add a new numbered file instead.
- **Never write a destructive migration in one step** (drop/rename a column the running code still uses). Previews and production currently share one database and a build migrates *before* its code is live, so the old code must keep working against the new schema: add columns/tables first, switch the code, remove the old ones in a later migration.
- Seeding is separate (`npm run db:seed`): DevFest calendar (`on conflict do nothing`, so coaches' edits are never overwritten) and the first coach from `ADMIN_EMAIL`. Safe on every deploy.

| Command | What it does |
|---|---|
| `npm run db:setup` | migrate + seed (local dev, new database) |
| `npm run db:migrate` / `db:seed` | one half only |
| `npm run db:status` | applied / pending, exit 1 if an applied file was edited |
| `npm run db:deploy` | what the Vercel build runs; honours `MIGRATE_ON_BUILD` |
| `npm run test:db` | integration tests of the migration tool (needs `DATABASE_URL`) |

`MIGRATE_ON_BUILD`: `all` (default, every Vercel build), `production` (only production builds, for when previews get their own database) or `false`. `MIGRATE_DATABASE_URL` optionally points the migration step at a direct/session connection.

If a table is missing at runtime, the error in the Vercel logs says so and tells you to run the migrations (Admin → Paramètres also shows the applied migrations).

**CI** (`.github/workflows/ci.yml`, on every PR and on pushes to `develop`/`main`), against a throwaway Postgres 16: typecheck → unit tests → migration tests → `db:setup` twice (second run must apply nothing) → production build with the environment check → start the server → smoke test of the four diagnostic branches, photo rules and resume link → cron endpoint auth. **Deployments** are Vercel's Git integration (preview per PR, production from your production branch); Vercel Cron calls `/api/cron/reminders`. To make CI a merge gate, enable branch protection on `develop`/`main` requiring the *CI* check.

## Environment check

The app validates its configuration (rules in `src/lib/env.ts`; it only ever reports variable **names**, never values):

- **At build time on Vercel** (`prebuild` → `scripts/check-env.mjs`): a missing or placeholder required variable fails the deploy with a clear list, instead of surfacing in front of candidates.
- **At server start in production** (`src/instrumentation.ts`): errors are logged and the server refuses to boot. Warnings (e.g. no Resend key, so emails are not sent) are logged but don't block.
- **In the admin**: Admin → Paramètres → *Configuration du serveur* shows what is still wrong.
- **On demand**: `npm run check:env` (strict, reads `.env.local`).

Errors: `DATABASE_URL`/`POSTGRES_URL`, `APP_URL` (if unset on Vercel, the Vercel-provided URL is used with a warning; localhost is an error), `SESSION_SECRET`, `CRON_SECRET`, and `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` on Vercel. Warnings: `RESEND_API_KEY` unset, test sender `resend.dev`, `ADMIN_EMAIL`, pooler port. With a key set, `MAIL_FROM` becomes an error if missing or invalid. Escape hatch: `SKIP_ENV_CHECK=true`.

## Emails (Resend)

1. Create a Resend account, **add and verify your sending domain** (Domains → Add domain → add the DNS records), and create an API key.
2. Set `RESEND_API_KEY` (starts with `re_`) and `MAIL_FROM` (an address on the verified domain, e.g. `SheSpeaks <no-reply@yourdomain.com>`). Optionally `MAIL_REPLY_TO` so candidates' replies reach a coach.
3. Until your domain is verified, `onboarding@resend.dev` can only deliver to your own Resend account email (fine for a first test).

How sending behaves: confirmations/notifications are sent **after** the response (`after()` → the candidate never waits), every send goes through a queue spaced for Resend's 2 requests/second default limit, retries on 429/5xx honour `Retry-After`, and an idempotency key makes retries safe (no duplicates). A failure never breaks a candidate's journey: it is stored with its error in Admin → Emails; successful rows keep Resend's message id so you can find them in the Resend dashboard.

| Event | To | Content |
|---|---|---|
| Candidate leaves her email on the profile screen | candidate | welcome + personal resume link |
| **Diagnostic completed** | **candidate** | confirmation of reception + roadmap link (her language) |
| **Diagnostic completed** | **assigned coach + extra notification emails** | name, city, starting point, subject, contacts, direct link to the fiche |
| **Unfinished diagnostic** (default: after 24 h, then every 48 h, max 2) | **candidate** (if she gave an email) | reminder with resume link and progress |
| **Unfinished diagnostic** (same trigger) | **coach + extra notification emails** | digest of stalled candidates with WhatsApp numbers (works even without candidate email) |
| Coach login / invitation | coach | one-time link (15 min) |

Without `RESEND_API_KEY`, emails are only recorded in **Admin → Emails** (nothing is sent), which is handy for local testing. Delay, interval, max count, extra recipients: **Admin → Paramètres**.

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
