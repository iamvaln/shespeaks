# SheSpeaks — Build plan & checklist

Source of truth: `SheSpeaks-Specification-plateforme.pdf` (spec) + `SheSpeaks-Charte-graphique.pdf` / `SheSpeaks-tokens.json` (brand).
Order requested: **front office first, then admin**. Email notifications throughout (reception confirmation + reminders for unfinished diagnostics, to the candidate **and** to the coach/admin).

## Stack

| Concern | Choice | Why |
|---|---|---|
| App | Next.js 15 (App Router) + TypeScript | One codebase for public site, admin, API, scheduler |
| DB | **Postgres on Supabase** (`postgres` driver, pooler) | Deployed on Vercel (serverless) → managed Postgres; schema in `supabase/migrations/` |
| Email | `nodemailer` (SMTP). No SMTP configured → mails are logged to the `email_log` table (visible in admin) | Works in dev with no setup, real mail in prod via env |
| Reminders | Vercel Cron → secured `/api/cron/reminders` | No long-lived process on serverless |
| Photos | Supabase Storage, direct browser upload via signed URL | Vercel 4.5 MB body limit |
| Auth (admin) | Passwordless: emailed one-time login link → signed session cookie | Spec: "coachs … se connectent avec leur email" |
| Style | Plain CSS with brand tokens (Nuit theme public, Clair theme admin), Archivo (112 % width) + IBM Plex Mono | Charte graphique |
| i18n | FR / EN, cookie-based switch from any screen | Spec: Bamenda is anglophone → EN is a launch prerequisite |

Hosting: Vercel + Supabase (see README).

## Phases & checklist

### Phase 0 — Foundations
- [x] Read spec, charte, tokens, speaker template
- [x] Scaffold project (package.json, tsconfig, next.config, .gitignore, .env.example)
- [x] Design tokens → `globals.css` (Nuit + Clair), fonts, logo assets in `public/`
- [x] DB schema + seed (DevFest calendar, settings, bootstrap coach from env)
- [x] i18n dictionary (FR/EN) + language switch
- [x] Mailer + email templates (FR/EN) + `email_log`

### Phase 1 — FRONT OFFICE (candidate)
- [x] Home: presentation, 5 steps, 8–10 min, DevFest cities, CTA « Commencer mon diagnostic »
- [x] Wizard shell: progress bar, back without losing answers, autosave at each screen, resume (cookie + emailed link `/reprendre/<token>`)
- [x] Bloc 1 Profil (P1–P7) with validation (WhatsApp, email, « Autre » ville)
- [x] Bloc 2 Diagnostic (D1–D6, pivot question)
- [x] Branch A (A1–A7) · Branch B (B1–B5) · Branch C (C1, C2 draft summary w/ word counter, no overwrite once hand-edited) · Branch D (D1 proposition, D2 8-criteria grid: 4 auto + 4 checkboxes)
- [x] Photo screen (1–3 JPG/PNG ≤10 Mo, tips, ring preview, mandatory consent, « Ajouter plus tard »)
- [x] Completion: record recap, status « Diagnostic reçu », generate 5 topic tracks (A/B), notify coach
- [x] Confirmation + Plan de route: badge, next action by branch, 5 steps with ★ personalised actions, DevFest dates of the city, add photo later
- [x] **Emails (candidate)**: start/resume link, reception confirmation (with plan link), reminder(s) if unfinished
- [x] **Emails (coach/admin)**: diagnostic received (name, city, start point, direct link), stalled-candidate alert/digest
- [x] Reminder engine (configurable delay / max count), idempotent, scheduler + cron endpoint

### Phase 2 — ADMIN (coach)
- [x] Passwordless login (email link), session, logout, route protection
- [x] Tableau de bord: counts by status × city, diagnostics to process, countdown to internal deadline (26 Oct 2026) & CFP closings, stalled « En cours » list
- [x] Candidates list: filters (city/status/coach), search, sort, columns per spec
- [x] Fiche candidate: identity/contact, answers, tracks (edit/discard/add/regenerate/mark chosen), subject (title, abstract, level, format, application state), review grid, roadmap as seen by candidate, status + history, assign coach, notes + next point date, photos (mark retained)
- [x] Calendrier des DevFest (add city, edit dates/links)
- [x] Coachs (invite by email, deactivate, load per coach)
- [x] Paramètres (notification email, internal deadline, reminder rules, domain/angle referentials, show tracks to candidates toggle — off)
- [x] Email log screen (what was sent / logged)

### Phase 3 — Quality
- [x] Unit tests for pure logic (topic generation, review grid, roadmap rules, abstract assembly)
- [x] End-to-end smoke run (all four branches, reminders, admin flows) in a real browser
- [x] README (setup, env vars, SMTP, deploy, cron), spec-compliance notes
- [x] Commit + push + draft PR

## Not in this version (spec "évolutions")
- Mur des speakers (public page after the DevFests)
- LLM-generated topic tracks (fixed templates for the test phase, as specified)
- Admin UI is French only (coach-facing); the candidate site is FR/EN

## Open point from spec
DevFest Bamenda dates unknown → shown as « À confirmer »; editable in admin Calendrier.

## Follow-ups
- [x] Startup / build-time / admin environment check (`src/lib/env.ts`)
