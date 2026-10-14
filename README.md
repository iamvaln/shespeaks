# SheSpeaks platform

Interest form and coaching platform for women in tech (front office) + coach follow-up space (admin), per
`SheSpeaks-Specification-plateforme.pdf` and the brand guide. See [`PLAN.md`](PLAN.md) for the build checklist.

- **Front office** (`/`): home → interest form (profile, experience, project, then the two screens of branch A/B/C/D) → confirmation + personalised roadmap, where the speaker photo is added when she prepares her submission. FR/EN, mobile first, no account, autosave at every screen, resume via cookie or emailed link.
- **Admin** (`/admin`): passwordless coach login, dashboard, candidates list + fiche (answers, topic tracks review, subject, review grid, roadmap preview, status history, notes, photos), DevFest calendar, coaches, settings, email log.

## Public site

- **Landing page** (`/`): what SheSpeaks is, **upcoming events** (from Admin → Événements, with the event's poster when one is set), who can join, how it works, how to join, FAQ. The call to action is **« Soumettre mon intérêt »** (no "diagnostic" wording anywhere user-facing).
- **Slider**: on-brand illustrations until real photos exist. To use photos, drop them in `public/slider/` and set `photo` on the slide in `src/content/slides.ts`.
- **Event posters**: drop the image in `public/events/` and set it in Admin → Événements (field *Affiche*).
- **Form** (`/interet`, old `/diagnostic` redirects): regular light-theme form. Candidates choose an **event** (DevFest Douala 2026, DevFest Yaoundé 2026, …, or another event), not a city; the list comes from the events calendar.

## Stack

Next.js 15 (App Router, TypeScript) · **Postgres** (`postgres` driver) · speaker photos on disk (`DATA_DIR/uploads`, a Docker volume on the VPS) · **Resend** (email) · deployed with Docker Compose on a VPS.

## Deploy

SheSpeaks runs on a shared Docker VPS (Postgres, app, Traefik, daily reminders, nightly backups to R2). Full guide in French: [docs/deploy-vps.md](docs/deploy-vps.md).

- `develop` → push builds the images and deploys the **preprod** (`sheleads.techiesconnect.net`, no real email, no cron).
- A `v*` tag → deploys **production** (`shespeaks.techiesconnect.org`) after a manual approval in the GitHub `production` environment.
- Configuration: one env file per environment on the VPS, from `.env.compose.example`. Migrations and seed run in the `migrate` service on each deploy.
- Reminders: the `cron` service calls `/api/cron/reminders` daily; photos live in the `uploads` volume.
- The move from Vercel + Supabase (`ops/cutover.sh`) is described in the guide.

## Run locally

```bash
cp .env.example .env.local      # set DATABASE_URL (any Postgres, e.g. a local one or a Supabase project), SESSION_SECRET, ADMIN_EMAIL…
npm install
npm run db:setup                # creates tables, seeds the DevFest calendar and the first coach
npm run dev                     # http://localhost:3000  — admin: /admin
npm test                        # unit tests (pure logic)
node scripts/smoke.mjs          # API journey for the 4 branches (server must be running, and the form must offer 'douala': a dated, future event, and no past interest deadline. The seed's Douala date is 2026-11-28; CI moves it with: update devfest_events set event_date = to_char(current_date + 60, 'YYYY-MM-DD') where city = 'douala'); add SESSION_SECRET=<the server's secret> to run the coach-space checks too
```

Without `SUPABASE_URL`, photos are stored in `./data/uploads` (dev only).

Contact checks (first form screen): the email is required everywhere; on the **production deployment only** (`VERCEL_ENV=production`) the WhatsApp number must also be a real mobile number in international format (checked with libphonenumber) and the email's domain must be able to receive mail (MX, then address record; only a definitive "no such domain/record" refuses: a slow DNS never blocks anyone). Previews, CI and local runs accept test numbers and `@example.com`. `STRICT_CONTACT_CHECKS=1` (or `0`) forces the checks on (or off) anywhere. Without `RESEND_API_KEY`, emails are only recorded in Admin → Emails. The first coach logs in at `/admin/login` with an emailed one-time link (in dev without Resend, the link is shown on screen).

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
| `npm run db:deploy` | migrate + seed (what the Vercel build ran until the cutover) |
| `npm run test:db` | integration tests against a real Postgres: migrations, reminders, tracks and AI suggestions (needs `DATABASE_URL`) |

If a table is missing at runtime, the error in the Vercel logs says so and tells you to run the migrations (Admin → Paramètres also shows the applied migrations).

**CI** (`.github/workflows/ci.yml`, on every PR and on pushes to `develop`/`main`), against a throwaway Postgres 16: typecheck → unit tests → database tests (migrations, reminders, tracks, AI suggestions) → `db:setup` twice (second run must apply nothing) → production build with the environment check → start the server → smoke test of the four diagnostic branches, photo rules and resume link → cron endpoint auth. A second job builds the Docker images and smoke-tests the container. **Deployments** are `.github/workflows/deploy.yml` (see [docs/deploy-vps.md](docs/deploy-vps.md)). To make CI a merge gate, enable branch protection on `develop`/`main` requiring the *CI* check.

## Branches and deployments

| Branch | Role | Deployed as |
|---|---|---|
| `main` | Only receives reviewed releases. | nothing by itself (production is deployed from a `v*` tag) |
| `develop` | Integration: every feature lands here first. | **preprod** on the VPS |
| feature branches (`claude/...`) | One change each, opened as a PR **into `develop`**. | CI only |

Release = a PR from `develop` into `main`. CI runs on every PR and on pushes to `develop` and `main`.

One-time setup (repository owner):

1. GitHub → Settings → General → **Default branch**: `main`.
2. Once the cutover is done: Vercel → Project → Settings → Git → **Production Branch**: `vercel-redirect` (never `main`), see the guide.
3. Optionally protect `main` and `develop` (require the *CI* check).

Previews and production share one database (see *Deploy*), so a migration runs as soon as **any** branch builds: keep migrations additive (add first, remove in a later migration).

## Coach login: rate limits

The footer links to the coach space (`/admin/login`), which is public, so the login form is rate limited (`src/lib/ratelimit.ts`, counters in Postgres table `rate_limit_hits` so they hold across serverless instances; keys are HMAC digests, never raw IPs or emails):

| What | Limit |
|---|---|
| Login link requests from one IP (whatever the email) | 10 per 10 minutes |
| Login link requests for one email, **coach or not** | 5 per 10 minutes |
| Attempts to use a login link, per IP | 20 per 10 minutes |

Requests for unknown addresses count exactly like coaches', and the answer is the same neutral message, so the form does not reveal who is a coach. In production the lookup, the one-time token and the email all run after the response, so the request does the same work for every address and timing does not tell them apart. The client IP comes from `x-real-ip` (set by Vercel, which also overwrites `x-forwarded-for`).

## Interest form: creation limits

Starting the interest form creates a candidate and emails the address typed, and the reminders and the confirmation follow the address on the profile, so the form is rate limited too (same Postgres counters, same opaque keys):

| What | Limit |
|---|---|
| Starts of the form from one address (valid or not; an IPv6 client counts per /64) | 30 per hour |
| Candidates created with, **or changed to**, one mailbox (`+tag`, case and Gmail dots count as the same mailbox) | 3 per hour |
| Address changes by one candidate (she needs no new cookie, so they have their own ceilings) | 5 per day |
| Address changes from one address | 20 per hour |

The mailbox is counted once the screen is valid (a typo elsewhere does not use it up) and before anything is created or queued; saving the same mailbox again costs nothing. A refused start or change answers 429 with a message that points the candidate to the « Reprendre mon formulaire » email she already received.

These limits slow down anyone who aims the platform at a third party; they do not prove the address belongs to the candidate. The reminder run therefore sends **one reminder email per mailbox and run** (candidates parked on one address are all claimed and reported to the coaches, but the inbox receives one email a day), and the lasting answer, confirming the address before the first reminder, is not built yet. The per-address limit is deliberately high enough for a room of candidates sharing one venue Wi-Fi: raise or lower `CREATE_MAX_PER_IP` in `src/lib/ratelimit.ts` if a larger group is expected.

## AI title suggestions (coach space)

On the fiche of a candidate who has no precise topic yet (start points A and B, form finished), the coach can press **« Suggérer avec l'IA »**: Claude Sonnet 5.5 proposes five talk titles built from the candidate's answers about her topic. They are added to « Pistes de sujet » with the label « Suggestion IA » and a one-line reason for the coach; she reads them, keeps, sets aside or chooses them like any other track. The templates (`topics.ts`) and the « Régénérer » button remain the fallback. The two buttons never touch each other's work: « Régénérer » replaces only the template proposals nobody has acted on; « Suggérer avec l'IA » replaces only the AI suggestions nobody has acted on (a track that is shortlisted, set aside or chosen is always kept). The button appears once the candidate has finished the form.

- **Only on request.** The candidate never talks to the model, and nothing is sent when the form is submitted: data leaves the platform when a coach presses the button (after a confirmation). **The candidate-facing site and form say nothing about it** (a decision of the owner: no notice, no consent step); the only warning is the confirmation a coach sees before sending.
- **What is sent** (`facts()` in `src/lib/ai-topics.ts`, pinned by a test): job or field of study, seniority, preferred format, the domain(s) and styles she chose, her free-text answers about her work and topic, and the titles already on the fiche (so the model does not repeat them; a title a coach typed is sent as written). **Not sent**: the name, phone number, email, city and event fields, and what she answered about comfort and fears. Inside her free-text answers, email addresses and numbers of nine digits or more are masked before sending; a name typed in a sentence cannot be recognised, and nothing asks the candidate not to write one. Her free text is delimited and the model is told it is data, not instructions.
- **No candidate is told.** Her answers about her topic reach the AI provider without her knowing: if a privacy page, an email or a consent step is added later, it belongs on the interest form (`src/lib/questions.ts`) and must also cover the candidates who already finished.
- **Visibility.** Suggestions are visible to coaches only. On the candidate's plan page (when « Afficher les pistes » is on) an AI suggestion appears only once a coach has shortlisted or chosen it.
- **Second provider.** `OPENAI_API_KEY` (optional) adds a « Suggérer avec OpenAI » button next to Claude's: same prompt, same strict JSON schema, same checks, through the Responses API (`src/lib/ai-topics.ts`, `suggestTitlesOpenAI`, plain fetch). `OPENAI_MODEL` picks the model (default `gpt-5.5`). Each provider replaces only its own untouched suggestions; the fiche shows which model wrote each one (`tracks.provider` and `tracks.model`, migration 0009; replacement follows the provider, never the model name). Rate limits are shared.
- **Key.** `ANTHROPIC_API_KEY` (console.anthropic.com, starts with `sk-ant-`; set a spend limit there). Without it the button does not appear and the environment check shows a warning, nothing else changes. Set it for **Production only**: previews share the production database and would spend on the same key. Optional `ANTHROPIC_BASE_URL` is read by the SDK (useful to test against a local stand-in).
- **Cost and limits.** One request per press (about 1,000 tokens in, a few thousand out with the model's short reasoning at `low` effort; measure on a trial before relying on an estimate). Limits per day (a sliding 24 h), kept in the same Postgres counters: 5 per candidate, 40 per coach. A call that does not complete (outage, timeout, key problem) gives its press back; a refusal, a truncated or an empty answer was produced by the model, may be billed, and stays counted. Usage is logged without any answer text: `[ai] suggestions { candidate, model, added, inputTokens, outputTokens }`; a failure logs `[ai] suggestions failed { candidate, reason, detail }` where `detail` is only the HTTP status, the API's error type and its request id (to quote to Anthropic's support), or `timeout` / `connection`.
- **Failures never break the fiche.** No key, a refusal, a timeout (40 s; the fiche page allows 60 s), a truncated or unreadable answer: the coach gets a message and the tracks are untouched. There is no server-side fallback to another model on purpose.
- **Code.** `ai-topics.ts` (prompt, JSON schema, validation, the call: no framework or database import, the client can be replaced in tests), `ai-tracks.ts` (who may ask, limits, storage), `suggestTracksAction` in `admin/actions.ts`, the button in `candidates/[id]/page.tsx`. Tests: `tests/ai-topics.test.ts`, `tests/db/ai-tracks.test.mjs` (a stand-in replaces the model: CI has no key).

## Proposals flow (coach and candidate exchanges)

After the diagnostic, the coach and the candidate go through a short series of exchanges: choice of topics, adjusted subject, speaker photo, then submission to the event. Each exchange is a **proposal** the coach sends and the candidate answers from her space (`/plan`).

- **Steps.** `choix` (start points A and B only), `sujet`, `photo`, `soumission`, then `soumise`. The step is never stored: `src/lib/journey.ts` (pure) computes it from the proposals, `photo_validated_at` and `submitted_at`. It also says who the ball is with (coach, candidate, nobody).
- **Table `proposals`** (migration `0012_proposals.sql`, additive): `kind` (`choix` | `sujet` | `photo`), `payload` (frozen JSON copy of what was sent), `state` (`envoyee` | `repondue` | `remplacee`), `response`, `candidate_comment`, `handled_at` (the coach dealt with the answer), `reminded_at`. A choice or a subject is never sent over one still waiting for her answer; a new photo request replaces a pending one (`remplacee`). The migration also adds `tracks.pitch`, `subjects.why`, `subjects.plan`, `candidates.photo_validated_at` and `candidates.submitted_at`. Rules and coach/candidate actions: `src/lib/proposals.ts`. The statuses the exchanges drive follow them: `sujet_valide` on her approval and `candidature_soumise` on her submission (`advance`), and back when the exchanges go back (`stepBack`: « Rouvrir les échanges », or a choice or a subject sent over an approved subject; `STATUS_OF_STEP` in `src/lib/journey.ts` says what each step stands for). `retenue` and the later statuses are the coach's and are never lowered by the app. The « Suivi » block offers the current status and the ones ahead (`src/lib/status.ts`: « Non retenue » at any time, taken back to « Intérêt reçu », or to « En cours » while her form is not finished; a status set by hand ahead of the exchanges can be brought back to what they stand for); the server checks the same rule against the database.
- **Routes.** `POST /api/espace/repondre` (the candidate answers a proposal), `POST /api/espace/soumis` (she confirms she submitted), `POST /api/acces` (she asks for a new access link by email: the answer is the same whether the address exists or not, and the link goes only to the registered address; rate-limited, `src/lib/access.ts`).
- **Emails** (`kind` in Admin → Emails, `src/lib/proposals-mailer.ts`): `candidate_proposal_choix`, `candidate_proposal_sujet`, `candidate_proposal_photo` (a proposal was sent), `coach_answer_<response>` (`choisie`, `aucune`, `approuvee`, `changements`, `photo_deposee`, `soumise`) to the coaches, `candidate_access_link`, and `candidate_proposal_reminder`: one reminder for a proposal still open after 48 h, sent by the existing `/api/cron/reminders` run (`remindPendingProposals` in `src/lib/reminders.ts`, one per proposal thanks to `reminded_at`) and mentioned in the coach digest.
- **Lock on the fiche.** While a choice or a subject waits for her answer, after she approved her subject, or once she counts as submitted, the coach cannot edit, generate or delete tracks, edit the subject, or delete the candidate (`lockOf` / `exchangeLock`, checked by the server actions too); a banner says why. After « changements » or « aucune » the coach has the hand again.
- **Fiche forms answer in place.** `InlineForm` runs the server action without a redirect: the message shows under the form, the page data refreshes, the scroll position and the other forms' unsaved fields are kept.
- **Reopening.** Once she counts as submitted, nothing more is sent to her. « Rouvrir les échanges » on the fiche (migration `0013_reopen_exchanges.sql`, `reopened_at`), shown when her subject is approved or she submitted, unlocks the topic so the coach can edit and send again: only her own confirmation counts as submitted after that, an approval given before the reopening no longer locks, and « Sujet validé » / « Candidature soumise » go back to what the exchanges stand for (« Retenue » and later do not move). A status set by hand to « Candidature soumise » over a proposal still waiting counts as submitted first, so « Rouvrir les échanges » stays available.
- **No mention of AI on the candidate side.** Pages and emails speak of « ta coach » / « your coach » only, even when a topic started as an AI suggestion.
- **Tests.** `tests/journey.test.ts` and the other unit tests, `tests/db/*.test.mjs` for the database rules.

## Common calendar and admission

The Settings page (coach space) holds the dates shared by every candidate: the last day to send an interest (`interest_deadline`), the internal submission date, the rehearsal day (`rehearsal_date`, with a free note `rehearsal_info`) and the switch for the calendar reminders. Empty = not set (no closing). Warnings (never blocking) point at dates that leave less than 14 days of preparation.

- **Closing**: the deadline day is open all day (Douala time, UTC+1); the next day no new dossier starts and no unfinished one is sent, unless the coach opens the fiche of an unfinished dossier and uses « Admettre malgré la clôture ». The form, the resume links and the home page say so.
- **Events offered**: only events with a real date that is still ahead (and after the rehearsal day when it is set). « Autre » is no longer offered; an existing dossier keeps its value. Dossiers already on « Autre » or on an event without a date can be listed with:

  ```sql
  select c.id, c.name, c.email, c.city, c.city_other, c.status
  from candidates c left join devfest_events e on e.city = c.city
  where c.status <> 'non_retenue' and (c.city = 'autre' or e.event_date is null)
  order by c.id;
  ```

- **Stuck dossiers**: a candidate whose last page was recorded without the dossier being finished (a failure between the two steps of the former finish) shows « En cours » at « écran 1 sur 6 ». They are finished when the candidate opens her link, and Settings lists the others with a « Finaliser les dossiers bloqués » button (confirmation email to the candidate, notification to the coaches; the end date is the day of her last send). The same list as SQL: `select id, name, email, last_activity_at from candidates where current_screen = 'done' and completed_at is null;`.

### Calendar reminders

A pass of the daily cron (`src/lib/calendar-reminders.ts`, run before the abandoned-form pass) writes to candidates at a date: **closing of the form** (unfinished form, 3 and 1 day before `interest_deadline`), **exchanges** (it is her turn to choose a topic, answer on her subject or send a photo: 7, 3 and 1 day before the internal date) and **submission** (topic approved, photo validated: 7, 3, 1 day and the day itself before the first date still ahead among the internal date and the event's call closing). Nobody is written to after her event is over, nor about exchanges and submission once her event's call has closed (the event is found by its slug or, for « Autre », by the name she typed). Each reminder is written once in `calendar_reminders` before it is sent (the key holds the target date, so moving a date arms it again) and given back if the send fails. A reminder is due on the day it falls on and the day after (a missed cron is made up, never later); if two tiers of one target are due together only the closest is sent. One email per candidate and day, whichever pass writes it (the journal, `last_reminder_at` and `proposals.reminded_at` are all checked, before anything is claimed, so a skipped reminder is not burnt), one per mailbox and day (two dossiers on one mailbox take turns), at most 300 per run.

The pass does nothing while `calendar_reminders_enabled` is off (Settings). **To activate**: (1) on the preproduction, set the dates in Settings (an interest deadline a few days ahead) and **switch `calendar_reminders_enabled` on** (with it off a real run does nothing), and have a dossier that is due (an unfinished form, or an exchange waiting for her); (2) call the cron by hand: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/reminders?dry=1"` prints what would be sent and sends nothing (any form of the parameter is a preview; it also skips the abandoned-form pass, which has no preview mode); (3) call it again without `dry`: with no Resend key the emails are only logged, read the `calendar_closing` / `calendar_exchange` / `calendar_submit` rows in Admin → Emails; (4) only then, in production, read « Aperçu des relances du calendrier » in Settings and switch the setting on.

## Environment check

The app validates its configuration (rules in `src/lib/env.ts`; it only ever reports variable **names**, never values):

- **At deploy time on the VPS** (`migrate` service, `scripts/check-env.mjs --strict`): a missing or placeholder required variable stops the deploy with a clear list, and `app` never starts.
- **At server start in production** (`src/instrumentation.ts`): errors are logged and the server refuses to boot. Warnings (e.g. no Resend key, so emails are not sent) are logged but don't block.
- **In the admin**: Admin → Paramètres → *Configuration du serveur* shows what is still wrong.
- **On demand**: `npm run check:env` (strict, reads `.env.local`).

Errors: `DATABASE_URL`/`POSTGRES_URL`, `APP_URL` (if unset on Vercel, the Vercel-provided URL is used with a warning; localhost is an error), `SESSION_SECRET`, `CRON_SECRET`, and `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` on Vercel. Warnings: `RESEND_API_KEY` unset, test sender `resend.dev`, `ADMIN_EMAIL`, pooler port. With a key set, `MAIL_FROM` becomes an error if missing or invalid. Escape hatch: `SKIP_ENV_CHECK=true`.

## When a page is slow or fails (what the logs say)

Every database query is timed (`src/lib/db.ts`). In the Vercel logs:

- `[db] slow query, 3200 ms: SELECT … FROM tracks WHERE candidate_id=? …` a query that took 2 s or more (`DB_SLOW_QUERY_MS`). The statement text only: never the values.
- `[db] no answer after 15000 ms: SELECT …` a query that got no answer in 15 s (`DB_QUERY_TIMEOUT_MS`). It fails with a `DbTimeoutError` and the connection pool is replaced (a stalled connection would otherwise stay in it), so the next request starts clean; the requests already running on the old pool get the limit of a transaction (30 s) to finish before their connections are closed. A whole transaction (BEGIN and COMMIT included) has twice that limit: `[db] a transaction did not finish within 30000 ms`. Without this limit a stalled query held the page until the platform killed it (60 s on the candidate fiche, then a bare 504).
- A page that fails shows « Cette page n'a pas pu s'afficher » inside the coach space, with a « Réessayer » button and a reference (the *digest*) to look up in the logs. A thin bar runs across the top of the window from the click on a link until the next page has arrived.

- **A plain read is repeated once.** A `SELECT` outside a transaction gets 4 s on its first attempt (`DB_FIRST_ATTEMPT_MS`); if it gets no answer, or its connection is cut because the pool was replaced, it is run once more on the current pool (a new one when the first attempt got no answer) with the full limit, and the log says `[db] repeating once on the current pool: SELECT …`. Why: a connection of the pool that died while the instance was idle never answers, and a page runs nine reads at once, so one or two of them used to hang for 15 s. Writes, transactions, locks (`FOR UPDATE`, advisory locks) and sequences are **never** repeated, because a statement sent to a dead connection may have reached the server: **a write or a transaction queued behind reads that are stalled waits for its own limit** (15 s, or 30 s for a transaction) and fails with the timeout error, even though a new pool exists from the first reset. **Cost on a database that is slow but alive:** a read that takes longer than `DB_FIRST_ATTEMPT_MS` (the time spent waiting for a free connection counts) is cancelled, the pool is replaced and the read is run again, so it takes longer than it would have and a page that runs nine reads on three connections can see its last reads run twice. Raise `DB_FIRST_ATTEMPT_MS` if the logs show `repeating once` lines for reads that were only slow.

The variables are optional and rarely worth changing.

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
| **Closing of the form** (J-3, J-1 before the last day to send an interest) | **candidate** with an unfinished form | days left, resume link (`calendar_closing`) |
| **Exchange to finish** (J-7, J-3, J-1 before the internal date) | **candidate** whose turn it is | what her coach waits for, link to her space (`calendar_exchange`) |
| **Submission** (J-7, J-3, J-1, the day itself) | **candidate** whose subject is approved and photo validated | the date to submit by, where, link (`calendar_submit`) |
| Coach login / invitation | coach | one-time link (15 min) |

Without `RESEND_API_KEY`, emails are only recorded in **Admin → Emails** (nothing is sent), which is handy for local testing. Delay, interval, max count, extra recipients: **Admin → Paramètres**. After the last day to send an interest the unfinished-form reminders stop, except for dossiers the coach admitted.

Reminders are driven by `/api/cron/reminders` (Vercel Cron, or any scheduler: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/reminders`). Runs are idempotent: each candidate is claimed before any email is sent.

## Notes on spec interpretation

- "Écran" split: Profil (1), Diagnostic (2: D1–D3, D4–D6), branch screens (A:2, B:2, C:2, D:2), final plan → 6 steps in the progress bar. The speaker photo is not a form screen: it is added from the roadmap page.
- A/B tracks: if fewer than 5 are produced by the spec rules (e.g. one domain × one angle), remaining angles on the same domain top up to 5 so the coach always has a full set. Parentheticals in domain names (e.g. "(Android, Flutter, iOS)") are dropped inside generated titles.
- Branch C abstract: regenerated from C1–C6 until the candidate edits it by hand; English template when she chose English (or "both" and the UI is English).
- Status « Sujet validé » requires subject title and abstract.
- Candidate-side tracks are hidden by default (setting), as specified for the test phase.
- Bamenda dates are "À confirmer" until edited in **Admin → Calendrier DevFest**.
- The internal deadline (26 Oct 2026) is shown to coaches on the dashboard and as a note in the candidate's calendar card.
- Emails are awaited before responding (serverless functions can be frozen once a response is sent).
- Contact details are only visible to signed-in coaches; photos are served only to their owner (cookie) or a coach.
