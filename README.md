# SheSpeaks platform

Diagnostic journey for women in tech (front office) + coach follow-up space (admin), per
`SheSpeaks-Specification-plateforme.pdf` and the brand guide. See [`PLAN.md`](PLAN.md) for the build checklist.

- **Front office** (`/`): home → diagnostic (profile, diagnostic, branch A/B/C/D, speaker photo) → confirmation + personalised roadmap. FR/EN, mobile first, no account, autosave at every screen, resume via cookie or emailed link.
- **Admin** (`/admin`): passwordless coach login, dashboard, candidates list + fiche (answers, topic tracks review, subject, review grid, roadmap preview, status history, notes, photos), DevFest calendar, coaches, settings, email log.

## Run

```bash
cp .env.example .env.local   # edit: APP_URL, SESSION_SECRET, ADMIN_EMAIL, SMTP_*
npm install
npm run dev                  # http://localhost:3000  — admin: /admin
npm test                     # unit tests (pure logic)
node scripts/smoke.mjs       # API journey for the 4 branches (server must be running)
npm run build && npm start   # production
```

Requires Node ≥ 22.18 (uses built-in `node:sqlite`). Data lives in `DATA_DIR` (default `./data`: `shespeaks.db` + `uploads/`) — **back this folder up** and host on a machine with a persistent disk (VPS, Fly.io volume, Railway/Render disk).

The first coach is created from `ADMIN_EMAIL` / `ADMIN_NAME` on first start. She logs in at `/admin/login` with an emailed one-time link and can then invite other coaches.

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

Reminders run from an in-process scheduler (every 10 min, started by `instrumentation.ts`). To drive them externally instead, set `ENABLE_SCHEDULER=false` and call
`curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/reminders`. Runs are idempotent.

## Notes on spec interpretation

- "Écran" split: Profil (1), Diagnostic (2: D1–D3, D4–D6), branch screens (A:2, B:2, C:2, D:2), Photo, final plan → 7 steps in the progress bar.
- A/B tracks: if fewer than 5 are produced by the spec rules (e.g. one domain × one angle), remaining angles on the same domain top up to 5 so the coach always has a full set. Parentheticals in domain names (e.g. "(Android, Flutter, iOS)") are dropped inside generated titles.
- Branch C abstract: regenerated from C1–C6 until the candidate edits it by hand; English template when she chose English (or "both" and the UI is English).
- Status « Sujet validé » requires subject title and abstract.
- Candidate-side tracks are hidden by default (setting), as specified for the test phase.
- Bamenda dates are "À confirmer" until edited in **Admin → Calendrier DevFest**.
- The internal deadline (26 Oct 2026) is shown to coaches on the dashboard and as a note in the candidate's calendar card.
- Contact details are only visible to signed-in coaches; photos are served only to their owner (cookie) or a coach.
