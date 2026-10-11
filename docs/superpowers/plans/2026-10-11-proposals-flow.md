# Parcours de propositions coach ↔ candidate : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** un aller-retour suivi entre la coach et la candidate (choix de sujets, sujet ajusté à approuver ou renvoyer, photo, soumission), dans l'espace de la candidate, avec mails, notifications et historique.

**Architecture :** un journal `proposals` (une ligne par envoi de la coach, copie figée, réponse de la candidate) ; l'étape courante est calculée par une fonction pure (`src/lib/journey.ts`) ; les écritures passent par `src/lib/proposals.ts` (transactions, réponses atomiques, statut, mails) ; la candidate répond par des routes `/api/espace/*` (sa session cookie), la coach par des actions serveur.

**Tech Stack :** Next.js 15.5 (App Router, actions serveur), React 19, Postgres via `src/lib/db.ts` (`all`, `get`, `run`, `insert`, `tx`), Resend via `src/lib/mail.ts`, tests `node --test`.

**Spec :** `docs/superpowers/specs/2026-10-11-proposals-flow-design.md`

## Global Constraints

- Node ≥ 22.18 : préfixer les commandes par `export PATH=/opt/homebrew/opt/node@22/bin:$PATH;`.
- Aucune ligne `Co-Authored-By: Claude` ni « Generated with Claude Code » dans les commits.
- Commentaires de code en anglais ; textes candidate en français ET en anglais (`src/lib/i18n.ts`, `en: Dict` impose les mêmes clés) ; espace coach en français.
- **L'IA n'est jamais mentionnée côté candidate** (pages et mails) : tout vient de « ta coach » / « your coach ».
- 2 ou 3 sujets par envoi de choix ; commentaire candidate ≤ 1000 caractères ; plan ≤ 8 étapes de ≤ 300 caractères.
- Une seule proposition `envoyee` par type et par candidate ; un nouvel envoi passe la précédente à `remplacee`.
- Statut : jamais en arrière ; sujet approuvé → `sujet_valide` ; soumission confirmée → `candidature_soumise`.
- Relance : une proposition `envoyee` depuis 48 h reçoit **un** rappel (`reminded_at`).
- `/acces` : même réponse que l'adresse existe ou non ; lien envoyé uniquement à l'adresse enregistrée.
- Ne jamais créer de fichier `.env*` (règle de l'utilisatrice) ; base de test : conteneur `postgres:16-alpine` sur le port 55432.

## Review Focus

1. **Double clic ou deux onglets** : une seule réponse est enregistrée, la seconde reçoit « déjà répondu » (Task 2, test « double answer »).
2. **La coach envoie une nouvelle proposition pendant que la candidate lit l'ancienne** : la réponse à l'ancienne est refusée avec un message clair, la page se recharge sur la nouvelle (Task 2, test « replaced » ; Task 5, message).
3. **Session perdue** : `/plan` sans cookie redirige vers `/acces` au lieu de l'accueil (Task 4, smoke).
4. **Commentaire contenant du HTML** : échappé à l'écran et dans les mails (Task 3, test d'échappement).
5. **Piste modifiée après l'envoi** : la candidate voit la copie figée (Task 2, test « frozen copy »).

---

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `supabase/migrations/0012_proposals.sql` | table `proposals` ; colonnes `tracks.pitch`, `subjects.why`, `subjects.plan`, `candidates.photo_validated_at`, `candidates.submitted_at` |
| `src/lib/journey.ts` (nouveau, pur) | types, `journey()`, validations, `planLines()` |
| `src/lib/proposals.ts` (nouveau) | envois coach, réponses candidate, photo, soumission, statut, « à traiter » |
| `src/lib/mail.ts` (modifié) | mails candidate FR/EN, notification coach |
| `src/lib/access.ts` (nouveau) + `src/app/api/acces/route.ts` + `src/app/(public)/acces/page.tsx` | retrouver son espace |
| `src/app/api/espace/repondre/route.ts`, `src/app/api/espace/soumis/route.ts` | réponses candidate |
| `src/components/JourneyPanel.tsx`, `src/components/ProposalAnswer.tsx`, `src/components/SubmitPanel.tsx` | espace candidate |
| `src/app/(public)/(app)/plan/page.tsx` (modifié) | intègre le parcours ; sans session → `/acces` |
| `src/app/admin/actions.ts`, fiche `candidates/[id]/page.tsx` (modifiés) | envois, photo, « traité », WhatsApp |
| `src/lib/admin-data.ts` (modifié) | « à traiter » |
| `src/lib/reminders.ts` (modifié) | relance à 48 h |
| tests : `tests/journey.test.ts`, `tests/db/proposals.test.mjs`, `tests/mail-proposals.test.ts`, `scripts/smoke.mjs` | |

---

### Task 1 : données et logique pure du parcours

**Files :**
- Create : `supabase/migrations/0012_proposals.sql`, `src/lib/journey.ts`, `tests/journey.test.ts`
- Modify : `src/lib/data.ts` (types `Candidate`, `Track`, `Subject`)

**Interfaces :**
- Produces :
  - types `ProposalKind`, `ProposalState`, `ProposalResponse`, `ChoiceItem`, `ChoicePayload`, `SubjectPayload`, `PhotoPayload`, `Proposal`, `Step`, `Journey` ;
  - `journeySteps(branch: Branch | null): Step[]` ;
  - `journey(input: { branch: Branch | null; photoValidatedAt: string | null; submittedAt: string | null; proposals: Proposal[] }): Journey` ;
  - `validateChoice(items: ChoiceItem[]): string | null`, `validateSubject(p: SubjectPayload): string | null` (message d'erreur en français ou `null`) ;
  - `planLines(text: string): string[]` ; `COMMENT_MAX = 1000`.

- [ ] **Step 1 : migration**

```sql
-- The exchanges between the coach and the candidate (spec 2026-10-11 « parcours de propositions »): every proposal the coach sends
-- (choice of topics, adjusted subject, photo request) with a frozen copy of what was sent and the candidate's answer. Additive only.
create table if not exists proposals (
  id integer generated always as identity primary key,
  candidate_id integer not null references candidates(id) on delete cascade,
  kind text not null,                     -- choix | sujet | photo
  payload text not null,                  -- JSON, frozen copy of what was sent
  state text not null default 'envoyee',  -- envoyee | repondue | remplacee
  response text,                          -- choisie | aucune | approuvee | changements | photo_deposee
  response_choice integer,                -- index of the chosen topic (choix)
  candidate_comment text,
  coach_id integer references coaches(id) on delete set null,
  sent_at timestamp not null default (now() at time zone 'utc'),
  answered_at timestamp,
  handled_at timestamp,                   -- the coach dealt with the answer
  reminded_at timestamp                   -- the one reminder after 48 h
);
create index if not exists idx_proposals_cand on proposals(candidate_id, kind, id);
alter table proposals enable row level security;
alter table tracks add column if not exists pitch text;          -- « pourquoi ce sujet lui irait », for the candidate
alter table subjects add column if not exists why text;          -- « Pourquoi ces changements »
alter table subjects add column if not exists plan text;         -- « Comment t'y prendre », one step per line
alter table candidates add column if not exists photo_validated_at timestamp;
alter table candidates add column if not exists submitted_at timestamp;
```

- [ ] **Step 2 : types dans `src/lib/data.ts`** — ajouter à `Candidate` : `photo_validated_at?: string | null; submitted_at?: string | null;` ; à `Track` : `pitch?: string | null;` ; à `Subject` : `why?: string | null; plan?: string | null;`.

- [ ] **Step 3 : tests qui échouent** `tests/journey.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journey, journeySteps, planLines, validateChoice, validateSubject, type Proposal } from '../src/lib/journey.ts';

let n = 0;
const p = (kind: Proposal['kind'], state: Proposal['state'], response: Proposal['response'] = null): Proposal => ({
  id: ++n, candidate_id: 1, kind, payload: kind === 'choix' ? { items: [] } : kind === 'sujet' ? { title: 't', abstract: 'a', why: '', plan: [] } : { comment: '' },
  state, response, response_choice: null, candidate_comment: null, coach_id: 1, sent_at: `2026-10-11 10:00:${String(n).padStart(2, '0')}`,
  answered_at: null, handled_at: null, reminded_at: null,
});
const j = (branch: 'A' | 'C', proposals: Proposal[], photo: string | null = null, submitted: string | null = null) =>
  journey({ branch, photoValidatedAt: photo, submittedAt: submitted, proposals });

test('steps: A and B choose first, C and D start at the adjusted subject', () => {
  assert.deepEqual(journeySteps('A'), ['choix', 'sujet', 'photo', 'soumission', 'soumise']);
  assert.deepEqual(journeySteps('C'), ['sujet', 'photo', 'soumission', 'soumise']);
});

test('A: nothing sent → coach; choice sent → candidate; chosen → back to the coach at the subject step', () => {
  assert.deepEqual([j('A', []).step, j('A', []).waiting], ['choix', 'coach']);
  const sent = p('choix', 'envoyee');
  assert.deepEqual([j('A', [sent]).step, j('A', [sent]).waiting, j('A', [sent]).pending?.id], ['choix', 'candidate', sent.id]);
  assert.deepEqual([j('A', [p('choix', 'repondue', 'aucune')]).step, j('A', [p('choix', 'repondue', 'aucune')]).waiting], ['choix', 'coach']);
  const chosen = j('A', [p('choix', 'repondue', 'choisie')]);
  assert.deepEqual([chosen.step, chosen.waiting], ['sujet', 'coach']);
});

test('subject: sent → candidate; changes asked → coach; approved → photo (coach), photo requested → candidate', () => {
  assert.deepEqual([j('C', [p('sujet', 'envoyee')]).step, j('C', [p('sujet', 'envoyee')]).waiting], ['sujet', 'candidate']);
  assert.deepEqual([j('C', [p('sujet', 'repondue', 'changements')]).waiting], ['coach']);
  const approved = p('sujet', 'repondue', 'approuvee');
  assert.deepEqual([j('C', [approved]).step, j('C', [approved]).waiting], ['photo', 'coach']);
  assert.deepEqual([j('C', [approved, p('photo', 'envoyee')]).waiting], ['candidate']);
  assert.deepEqual([j('C', [approved, p('photo', 'repondue', 'photo_deposee')]).waiting], ['coach']);
});

test('approved + photo validated → submission (candidate); submitted → done; a replaced proposal never counts', () => {
  const approved = p('sujet', 'repondue', 'approuvee');
  assert.deepEqual([j('C', [approved], '2026-10-11').step, j('C', [approved], '2026-10-11').waiting], ['soumission', 'candidate']);
  assert.deepEqual([j('C', [approved], '2026-10-11', '2026-10-12').step, j('C', [approved], '2026-10-11', '2026-10-12').waiting], ['soumise', 'none']);
  assert.equal(j('C', [p('sujet', 'remplacee'), p('sujet', 'envoyee')]).pending?.state, 'envoyee');
  assert.deepEqual([j('C', [p('sujet', 'remplacee')]).waiting], ['coach']);
  assert.equal(j('C', [p('sujet', 'envoyee')], '2026-10-11').step, 'sujet', 'a photo validated early does not skip the subject');
});

test('validations: 2 or 3 topics with title and pitch; subject needs title and abstract; plan lines', () => {
  const item = { title: 'Automatiser son déploiement', format: 'talk', pitch: 'Tu le fais déjà au travail.' };
  assert.equal(validateChoice([item, item]), null);
  assert.match(validateChoice([item])!, /2 ou 3/);
  assert.match(validateChoice([item, item, item, item])!, /2 ou 3/);
  assert.match(validateChoice([item, { ...item, pitch: ' ' }])!, /phrase/);
  assert.equal(validateSubject({ title: 'T', abstract: 'A', why: '', plan: [] }), null);
  assert.match(validateSubject({ title: '', abstract: 'A', why: '', plan: [] })!, /titre/);
  assert.match(validateSubject({ title: 'T', abstract: '', why: '', plan: [] })!, /résumé/);
  assert.deepEqual(planLines(' Accroche \n\n Idées clés\n' + 'x'.repeat(400) + '\n4\n5\n6\n7\n8\n9'), ['Accroche', 'Idées clés', 'x'.repeat(300), '4', '5', '6', '7', '8']);
});
```

- [ ] **Step 4 : constater l'échec** — `npm test 2>&1 | grep -E "journey|Cannot find"` : module introuvable.

- [ ] **Step 5 : implémenter** `src/lib/journey.ts`

```ts
// Where a candidate stands in the exchanges with her coach (spec 2026-10-11 « parcours de propositions »). Pure: the step is always
// computed from the proposals log and two dates, never stored, so it cannot drift.
import type { Branch } from './questions.ts';

export type ProposalKind = 'choix' | 'sujet' | 'photo';
export type ProposalState = 'envoyee' | 'repondue' | 'remplacee';
export type ProposalResponse = 'choisie' | 'aucune' | 'approuvee' | 'changements' | 'photo_deposee';
export type ChoiceItem = { title: string; format: string; pitch: string };
export type ChoicePayload = { items: ChoiceItem[] };
export type SubjectPayload = { title: string; abstract: string; why: string; plan: string[] };
export type PhotoPayload = { comment: string };
export interface Proposal {
  id: number;
  candidate_id: number;
  kind: ProposalKind;
  payload: ChoicePayload | SubjectPayload | PhotoPayload;
  state: ProposalState;
  response: ProposalResponse | null;
  response_choice: number | null;
  candidate_comment: string | null;
  coach_id: number | null;
  sent_at: string;
  answered_at: string | null;
  handled_at: string | null;
  reminded_at: string | null;
}
export type Step = 'choix' | 'sujet' | 'photo' | 'soumission' | 'soumise';
export type Journey = { step: Step; steps: Step[]; waiting: 'coach' | 'candidate' | 'none'; pending: Proposal | null };

export const COMMENT_MAX = 1000;
const PLAN_MAX = 8;
const STEP_MAX = 300;

export function journeySteps(branch: Branch | null): Step[] {
  return branch === 'A' || branch === 'B' ? ['choix', 'sujet', 'photo', 'soumission', 'soumise'] : ['sujet', 'photo', 'soumission', 'soumise'];
}

/** The latest proposal of a kind that was not replaced (the log is ordered by id). */
const latest = (ps: Proposal[], kind: ProposalKind) => [...ps].filter((x) => x.kind === kind && x.state !== 'remplacee').sort((a, b) => a.id - b.id).at(-1) ?? null;

export function journey(i: { branch: Branch | null; photoValidatedAt: string | null; submittedAt: string | null; proposals: Proposal[] }): Journey {
  const steps = journeySteps(i.branch);
  const at = (step: Step, last: Proposal | null): Journey => {
    const pending = last?.state === 'envoyee' ? last : null;
    return { step, steps, waiting: pending ? 'candidate' : 'coach', pending };
  };
  if (i.submittedAt) return { step: 'soumise', steps, waiting: 'none', pending: null };
  const subject = latest(i.proposals, 'sujet');
  if (subject?.response === 'approuvee') {
    if (i.photoValidatedAt) return { step: 'soumission', steps, waiting: 'candidate', pending: null };
    return at('photo', latest(i.proposals, 'photo'));
  }
  const choice = latest(i.proposals, 'choix');
  if (steps[0] === 'choix' && !subject && choice?.response !== 'choisie') return at('choix', choice);
  return at('sujet', subject);
}

export function validateChoice(items: ChoiceItem[]): string | null {
  if (items.length < 2 || items.length > 3) return 'Il faut 2 ou 3 pistes retenues pour envoyer un choix.';
  if (items.some((x) => !x.title.trim() || x.title.length > 140)) return 'Chaque piste retenue doit avoir un titre (140 caractères au plus).';
  if (items.some((x) => !x.pitch.trim() || x.pitch.length > 400)) return 'Chaque piste retenue doit avoir sa phrase pour la candidate (400 caractères au plus).';
  return null;
}

export function validateSubject(p: SubjectPayload): string | null {
  if (!p.title.trim()) return 'Le sujet doit avoir un titre avant l’envoi.';
  if (!p.abstract.trim()) return 'Le sujet doit avoir un résumé avant l’envoi.';
  if (p.why.length > 1500) return '« Pourquoi ces changements » : 1500 caractères au plus.';
  return null;
}

/** « Comment t'y prendre » as typed by the coach: one step per line, blank lines dropped, at most 8 steps of 300 characters. */
export const planLines = (text: string): string[] =>
  text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.slice(0, STEP_MAX)).slice(0, PLAN_MAX);
```

- [ ] **Step 6 : vérifier** — `npm test && npm run typecheck` : tout passe. Puis la migration contre une base locale :

```bash
docker run -d --name ss-pg -e POSTGRES_USER=shespeaks -e POSTGRES_PASSWORD=shespeaks -e POSTGRES_DB=shespeaks -p 55432:5432 postgres:16-alpine && sleep 5
DATABASE_URL='postgresql://shespeaks:shespeaks@127.0.0.1:55432/shespeaks?sslmode=disable' node --experimental-strip-types --no-warnings scripts/db.mjs setup
docker rm -f ss-pg
```
Expected : `applied 0012_proposals.sql`.

- [ ] **Step 7 : commit** — `git add supabase/migrations/0012_proposals.sql src/lib/journey.ts src/lib/data.ts tests/journey.test.ts && git commit -m "Proposals flow: data (migration 0012) and the pure journey logic"`

### Task 2 : écritures (envois, réponses, photo, soumission, statut, « à traiter »)

**Files :**
- Create : `src/lib/proposals.ts`, `tests/db/proposals.test.mjs`
- Modify : `src/lib/admin-data.ts` (`countToProcess`)

**Interfaces :**
- Consumes : Task 1 (`journey`, `validateChoice`, `validateSubject`, `planLines`, types).
- Produces (tous `async`, jamais d'exception pour une règle métier ; `Outcome = { ok: true } | { ok: false; error: string }`) :
  - `listProposals(candidateId): Promise<Proposal[]>` ; `journeyOf(candidateId): Promise<Journey | null>` ;
  - `sendChoice(candidateId, coachId): Promise<Outcome>` (pistes `retenue_coach` dans l'ordre `position`) ;
  - `sendSubject(candidateId, coachId): Promise<Outcome>` (ligne `subjects` : title, abstract, why, plan) ;
  - `requestPhoto(candidateId, coachId, comment): Promise<Outcome>` ; `validatePhoto(candidateId, photoId): Promise<Outcome>` ;
  - `answerProposal(candidateId, proposalId, response, choice: number | null, comment: string): Promise<Outcome>` ;
  - `photoUploaded(candidateId): Promise<void>` ; `confirmSubmission(candidateId): Promise<Outcome>` ;
  - `markHandled(candidateId): Promise<void>` ;
  - hook mail : `setProposalMailer(m: ProposalMailer)` (les tests branchent un enregistreur ; sinon les vrais mails de la Task 3 sont chargés à la première utilisation) avec
    `type ProposalMailer = { toCandidate(candidateId: number, what: 'choix' | 'sujet' | 'photo' | 'pret'): Promise<void>; toCoaches(candidateId: number, what: 'choisie' | 'aucune' | 'approuvee' | 'changements' | 'photo_deposee' | 'soumise', comment: string | null): Promise<void> }`.

- [ ] **Step 1 : tests qui échouent** `tests/db/proposals.test.mjs` (même ouverture que `tests/db/ai-subject.test.mjs` : base jetable `ss_prop_<hex>`, `scripts/db.mjs migrate`, imports dynamiques) :

```js
// The proposals flow against a real Postgres. Run: npm run test:db
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import postgres from 'postgres';
import { resolveDatabaseUrl } from '../../src/lib/env.ts';

const adminUrl = resolveDatabaseUrl(process.env);
const skip = adminUrl ? false : 'DATABASE_URL not set';
const admin = adminUrl ? postgres(adminUrl, { max: 1, onnotice: () => {} }) : null;
let dbName = ''; let P; let data; let raw;
const mails = [];
const urlFor = (db) => { const u = new URL(adminUrl.replace(/^postgres(ql)?:/, 'http:')); u.pathname = `/${db}`; u.search = ''; return u.toString().replace(/^http:/, 'postgres:'); };

before(async () => {
  if (!admin) return;
  dbName = `ss_prop_${crypto.randomBytes(4).toString('hex')}`;
  await admin.unsafe(`create database ${dbName}`);
  const url = urlFor(dbName);
  const r = spawnSync('node', ['--experimental-strip-types', '--no-warnings', 'scripts/db.mjs', 'migrate'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: url } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  process.env.DATABASE_URL = url; process.env.SESSION_SECRET = 'test-secret';
  data = await import('../../src/lib/data.ts');
  P = await import('../../src/lib/proposals.ts');
  P.setProposalMailer({ toCandidate: async (id, what) => { mails.push(`candidate:${what}`); }, toCoaches: async (id, what, comment) => { mails.push(`coach:${what}:${comment ?? ''}`); } });
  raw = postgres(url, { max: 2, onnotice: () => {} });
});
after(async () => {
  if (!admin) return;
  await raw?.end(); const db = await import('../../src/lib/db.ts'); await db.sql().end();
  await admin.unsafe(`drop database if exists ${dbName} with (force)`); await admin.end();
});

async function candidate(branch = 'A') {
  const token = crypto.randomBytes(8).toString('hex');
  const [{ id }] = await raw`insert into candidates (token, name, email, branch, status, current_screen, completed_at)
    values (${token}, 'Test', ${token + '@example.org'}, ${branch}, 'diagnostic_recu', 'done', now() at time zone 'utc') returning id`;
  return id;
}
async function retained(id, n = 3) {
  for (let k = 0; k < n; k++) await raw`insert into tracks (candidate_id, title, format, origin, state, pitch, position) values (${id}, ${'Sujet ' + k}, 'talk', 'ia', 'retenue_coach', ${'Parce que ' + k}, ${k})`;
}
const state = async (id) => (await P.journeyOf(id));

test('A: choice sent (frozen copy), chosen, subject sent, changes asked, sent again, approved, photo, submission', { skip }, async () => {
  mails.length = 0;
  const id = await candidate('A');
  await retained(id, 3);
  assert.deepEqual(await P.sendChoice(id, 1), { ok: true });
  await raw`update tracks set title = 'Modifié après envoi' where candidate_id = ${id}`;
  let j = await state(id);
  assert.equal(j.waiting, 'candidate');
  assert.equal(j.pending.payload.items[0].title, 'Sujet 0', 'frozen copy');
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'choisie', 1, 'Celui-ci !'), { ok: true });
  j = await state(id);
  assert.deepEqual([j.step, j.waiting], ['sujet', 'coach']);
  await raw`insert into subjects (candidate_id, title, abstract, why, plan) values (${id}, 'T1', 'A1', 'Parce que', ${'Accroche\nDémo'}) on conflict (candidate_id) do update set title = excluded.title, abstract = excluded.abstract, why = excluded.why, plan = excluded.plan`;
  assert.deepEqual(await P.sendSubject(id, 1), { ok: true });
  j = await state(id);
  assert.deepEqual(j.pending.payload, { title: 'T1', abstract: 'A1', why: 'Parce que', plan: ['Accroche', 'Démo'] });
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'changements', null, ''), { ok: false, error: 'Un commentaire est nécessaire.' });
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'changements', null, 'Plus court'), { ok: true });
  await raw`update subjects set title = 'T2' where candidate_id = ${id}`;
  assert.deepEqual(await P.sendSubject(id, 1), { ok: true });
  j = await state(id);
  assert.deepEqual(await P.answerProposal(id, j.pending.id, 'approuvee', null, ''), { ok: true });
  assert.equal((await data.getCandidate(id)).status, 'sujet_valide');
  j = await state(id);
  assert.deepEqual([j.step, j.waiting], ['photo', 'coach']);
  const [{ id: photoId }] = await raw`insert into photos (candidate_id, filename, mime, size) values (${id}, ${id + '/p.jpg'}, 'image/jpeg', 10) returning id`;
  assert.deepEqual(await P.validatePhoto(id, photoId), { ok: true });
  j = await state(id);
  assert.deepEqual([j.step, j.waiting], ['soumission', 'candidate']);
  assert.deepEqual(await P.confirmSubmission(id), { ok: true });
  assert.equal((await data.getCandidate(id)).status, 'candidature_soumise');
  assert.deepEqual(mails, ['candidate:choix', 'coach:choisie:Celui-ci !', 'candidate:sujet', 'coach:changements:Plus court', 'candidate:sujet', 'coach:approuvee:', 'candidate:pret', 'coach:soumise:']);
});

test('double answer: the second one is refused; an answer to a replaced proposal is refused', { skip }, async () => {
  const id = await candidate('C');
  await raw`insert into subjects (candidate_id, title, abstract) values (${id}, 'T', 'A')`;
  await P.sendSubject(id, 1);
  const first = (await state(id)).pending.id;
  const [a, b] = await Promise.all([P.answerProposal(id, first, 'approuvee', null, ''), P.answerProposal(id, first, 'approuvee', null, '')]);
  assert.deepEqual([a.ok, b.ok].sort(), [false, true]);
  const id2 = await candidate('C');
  await raw`insert into subjects (candidate_id, title, abstract) values (${id2}, 'T', 'A')`;
  await P.sendSubject(id2, 1);
  const old = (await state(id2)).pending.id;
  await P.sendSubject(id2, 1); // replaces it
  assert.deepEqual(await P.answerProposal(id2, old, 'approuvee', null, ''), { ok: false, error: 'Cette proposition a été remplacée : recharge la page.' });
  assert.equal((await raw`select state from proposals where id = ${old}`)[0].state, 'remplacee');
});

test('another candidate\'s proposal is refused; a choice needs 2 or 3 retained tracks; photo request and upload', { skip }, async () => {
  const id = await candidate('A');
  await retained(id, 1);
  assert.equal((await P.sendChoice(id, 1)).ok, false);
  await retained(id, 1);
  assert.deepEqual(await P.sendChoice(id, 1), { ok: true });
  const other = await candidate('A');
  assert.deepEqual(await P.answerProposal(other, (await state(id)).pending.id, 'choisie', 0, ''), { ok: false, error: 'Proposition introuvable.' });
  const id3 = await candidate('C');
  await raw`insert into subjects (candidate_id, title, abstract) values (${id3}, 'T', 'A')`;
  await P.sendSubject(id3, 1);
  await P.answerProposal(id3, (await state(id3)).pending.id, 'approuvee', null, '');
  assert.deepEqual(await P.requestPhoto(id3, 1, ''), { ok: false, error: 'Un commentaire est nécessaire pour demander une autre photo.' });
  assert.deepEqual(await P.requestPhoto(id3, 1, 'Plus lumineuse'), { ok: true });
  assert.equal((await state(id3)).waiting, 'candidate');
  await P.photoUploaded(id3);
  assert.equal((await state(id3)).waiting, 'coach');
});

test('« à traiter » counts unanswered-by-coach answers until the coach sends the next proposal or marks them handled', { skip }, async () => {
  const admin = await import('../../src/lib/admin-data.ts');
  const id = await candidate('C');
  await raw`update candidates set status = 'sujet_valide' where id = ${id}`; // out of the « intérêt reçu » count
  await raw`insert into subjects (candidate_id, title, abstract) values (${id}, 'T', 'A')`;
  await P.sendSubject(id, 1);
  const before = await admin.countToProcess();
  await P.answerProposal(id, (await state(id)).pending.id, 'changements', null, 'Non');
  assert.equal(await admin.countToProcess(), before + 1);
  await P.markHandled(id);
  assert.equal(await admin.countToProcess(), before);
});
```

- [ ] **Step 2 : constater l'échec** (base locale 55432, `node --test tests/db/proposals.test.mjs`) : module introuvable.

- [ ] **Step 3 : implémenter** `src/lib/proposals.ts`

```ts
// The exchanges between a coach and a candidate (spec 2026-10-11): what the coach sends, what the candidate answers, the photo and the
// submission. Business rules return { ok: false, error } (French, shown as is); the candidate's answer is one atomic UPDATE.
import { all, get, run, tx } from './db.ts';
import { getCandidate, setStatus, type Track } from './data.ts';
import { STATUSES } from './db.ts';
import {
  COMMENT_MAX, journey, planLines, validateChoice, validateSubject,
  type ChoiceItem, type Journey, type Proposal, type ProposalKind, type ProposalResponse, type SubjectPayload,
} from './journey.ts';

export type Outcome = { ok: true } | { ok: false; error: string };
export type ProposalMailer = {
  toCandidate(candidateId: number, what: 'choix' | 'sujet' | 'photo' | 'pret'): Promise<void>;
  toCoaches(candidateId: number, what: 'choisie' | 'aucune' | 'approuvee' | 'changements' | 'photo_deposee' | 'soumise', comment: string | null): Promise<void>;
};
let mailer: ProposalMailer | null = null;
/** Tests plug a recorder; otherwise the real emails (Task 3) are loaded on first use. Mails never fail a business action. */
export const setProposalMailer = (m: ProposalMailer) => { mailer = m; };
async function getMailer(): Promise<ProposalMailer> {
  if (!mailer) {
    try { mailer = (await import('./proposals-mailer.ts')).realMailer; } catch { mailer = { toCandidate: async () => {}, toCoaches: async () => {} }; }
  }
  return mailer;
}
const mail = (job: (m: ProposalMailer) => Promise<void>) => getMailer().then(job).catch((e) => console.error('[proposals] mail failed', e));

type Row = Omit<Proposal, 'payload'> & { payload: string };
const toProposal = (r: Row): Proposal => ({ ...r, payload: JSON.parse(r.payload) });

export async function listProposals(candidateId: number): Promise<Proposal[]> {
  return (await all<Row>('SELECT * FROM proposals WHERE candidate_id=? ORDER BY id', candidateId)).map(toProposal);
}

export async function journeyOf(candidateId: number): Promise<Journey | null> {
  const c = await getCandidate(candidateId);
  if (!c) return null;
  return journey({ branch: c.branch, photoValidatedAt: c.photo_validated_at ?? null, submittedAt: c.submitted_at ?? null, proposals: await listProposals(candidateId) });
}

/** One pending proposal per kind: a new one replaces it; sending also closes the coach's « à traiter » on earlier answers. */
async function send(candidateId: number, coachId: number, kind: ProposalKind, payload: unknown): Promise<void> {
  await tx(async () => {
    await get('SELECT pg_advisory_xact_lock(hashtext(?))', `proposals:${candidateId}`);
    await run(`UPDATE proposals SET state='remplacee' WHERE candidate_id=? AND kind=? AND state='envoyee'`, candidateId, kind);
    await run(`UPDATE proposals SET handled_at=(now() at time zone 'utc') WHERE candidate_id=? AND state='repondue' AND handled_at IS NULL`, candidateId);
    await run('INSERT INTO proposals (candidate_id,kind,payload,coach_id) VALUES (?,?,?,?)', candidateId, kind, JSON.stringify(payload), coachId);
  });
}

export async function sendChoice(candidateId: number, coachId: number): Promise<Outcome> {
  const tracks = await all<Track>(`SELECT * FROM tracks WHERE candidate_id=? AND state='retenue_coach' ORDER BY position, id`, candidateId);
  const items: ChoiceItem[] = tracks.map((t) => ({ title: t.title.trim(), format: t.format ?? 'talk', pitch: (t.pitch ?? '').trim() }));
  const error = validateChoice(items);
  if (error) return { ok: false, error };
  await send(candidateId, coachId, 'choix', { items });
  mail((m) => m.toCandidate(candidateId, 'choix'));
  return { ok: true };
}

export async function sendSubject(candidateId: number, coachId: number): Promise<Outcome> {
  const s = await get<{ title: string | null; abstract: string | null; why: string | null; plan: string | null }>('SELECT title,abstract,why,plan FROM subjects WHERE candidate_id=?', candidateId);
  const payload: SubjectPayload = { title: (s?.title ?? '').trim(), abstract: (s?.abstract ?? '').trim(), why: (s?.why ?? '').trim(), plan: planLines(s?.plan ?? '') };
  const error = validateSubject(payload);
  if (error) return { ok: false, error };
  await send(candidateId, coachId, 'sujet', payload);
  mail((m) => m.toCandidate(candidateId, 'sujet'));
  return { ok: true };
}

export async function requestPhoto(candidateId: number, coachId: number, comment: string): Promise<Outcome> {
  const c = comment.trim().slice(0, COMMENT_MAX);
  if (!c) return { ok: false, error: 'Un commentaire est nécessaire pour demander une autre photo.' };
  await run('UPDATE candidates SET photo_validated_at=NULL WHERE id=?', candidateId);
  await send(candidateId, coachId, 'photo', { comment: c });
  mail((m) => m.toCandidate(candidateId, 'photo'));
  return { ok: true };
}

export async function validatePhoto(candidateId: number, photoId: number): Promise<Outcome> {
  if (!(await get('SELECT 1 FROM photos WHERE id=? AND candidate_id=?', photoId, candidateId))) return { ok: false, error: 'Photo introuvable.' };
  await tx(async () => {
    await run(`UPDATE candidates SET selected_photo_id=?, photo_validated_at=(now() at time zone 'utc') WHERE id=?`, photoId, candidateId);
    await run(`UPDATE proposals SET state='remplacee' WHERE candidate_id=? AND kind='photo' AND state='envoyee'`, candidateId);
    await run(`UPDATE proposals SET handled_at=(now() at time zone 'utc') WHERE candidate_id=? AND kind='photo' AND handled_at IS NULL AND state='repondue'`, candidateId);
  });
  if ((await journeyOf(candidateId))?.step === 'soumission') mail((m) => m.toCandidate(candidateId, 'pret'));
  return { ok: true };
}

const ALLOWED: Record<ProposalKind, ProposalResponse[]> = { choix: ['choisie', 'aucune'], sujet: ['approuvee', 'changements'], photo: [] };
const NEEDS_COMMENT: ProposalResponse[] = ['aucune', 'changements'];

/** Never moves a status backwards (the order of STATUSES). */
async function advance(candidateId: number, target: string, author: string) {
  const c = await getCandidate(candidateId);
  const rank = (s: string) => STATUSES.findIndex((x) => x.id === s);
  if (c && rank(c.status) < rank(target)) await setStatus(candidateId, target, author);
}

export async function answerProposal(candidateId: number, proposalId: number, response: ProposalResponse, choice: number | null, comment: string): Promise<Outcome> {
  const p = await get<Row>('SELECT * FROM proposals WHERE id=? AND candidate_id=?', proposalId, candidateId);
  if (!p) return { ok: false, error: 'Proposition introuvable.' };
  if (p.state === 'remplacee') return { ok: false, error: 'Cette proposition a été remplacée : recharge la page.' };
  if (!ALLOWED[p.kind].includes(response)) return { ok: false, error: 'Réponse non valide.' };
  const c = comment.trim().slice(0, COMMENT_MAX);
  if (NEEDS_COMMENT.includes(response) && !c) return { ok: false, error: 'Un commentaire est nécessaire.' };
  const items = p.kind === 'choix' ? (JSON.parse(p.payload) as { items: ChoiceItem[] }).items : [];
  if (response === 'choisie' && (choice === null || !Number.isInteger(choice) || choice < 0 || choice >= items.length)) return { ok: false, error: 'Choisis un des sujets proposés.' };
  const done = await get<{ id: number }>(
    `UPDATE proposals SET state='repondue', response=?, response_choice=?, candidate_comment=?, answered_at=(now() at time zone 'utc')
     WHERE id=? AND candidate_id=? AND state='envoyee' RETURNING id`,
    response, response === 'choisie' ? choice : null, c || null, proposalId, candidateId,
  );
  if (!done) return { ok: false, error: 'Tu as déjà répondu à cette proposition.' };
  if (response === 'choisie') {
    // the chosen topic becomes the starting point of the subject the coach develops (only when nothing is written yet)
    await run(`INSERT INTO subjects (candidate_id,title) VALUES (?,?) ON CONFLICT (candidate_id) DO UPDATE SET title=COALESCE(NULLIF(subjects.title,''), excluded.title)`, candidateId, items[choice!].title);
  }
  if (response === 'approuvee') {
    await advance(candidateId, 'sujet_valide', 'la candidate');
    if ((await journeyOf(candidateId))?.step === 'soumission') mail((m) => m.toCandidate(candidateId, 'pret'));
  }
  mail((m) => m.toCoaches(candidateId, response, c || null));
  return { ok: true };
}

/** A photo uploaded while the coach asked for one answers that request. */
export async function photoUploaded(candidateId: number): Promise<void> {
  const done = await get<{ id: number }>(
    `UPDATE proposals SET state='repondue', response='photo_deposee', answered_at=(now() at time zone 'utc')
     WHERE candidate_id=? AND kind='photo' AND state='envoyee' RETURNING id`, candidateId);
  if (done) mail((m) => m.toCoaches(candidateId, 'photo_deposee', null));
}

export async function confirmSubmission(candidateId: number): Promise<Outcome> {
  if ((await journeyOf(candidateId))?.step !== 'soumission') return { ok: false, error: 'La soumission n’est pas encore ouverte.' };
  const done = await get<{ id: number }>(`UPDATE candidates SET submitted_at=(now() at time zone 'utc') WHERE id=? AND submitted_at IS NULL RETURNING id`, candidateId);
  if (!done) return { ok: false, error: 'Ta soumission est déjà confirmée.' };
  await run(`UPDATE subjects SET application_state='soumise' WHERE candidate_id=?`, candidateId);
  await advance(candidateId, 'candidature_soumise', 'la candidate');
  mail((m) => m.toCoaches(candidateId, 'soumise', null));
  return { ok: true };
}

export async function markHandled(candidateId: number): Promise<void> {
  await run(`UPDATE proposals SET handled_at=(now() at time zone 'utc') WHERE candidate_id=? AND state='repondue' AND handled_at IS NULL`, candidateId);
}
```

  Puis `src/lib/admin-data.ts`, `countToProcess` :

```ts
export async function countToProcess(): Promise<number> {
  // new interests, plus candidates whose answer to a proposal the coach has not dealt with yet
  const r = await get<{ n: number }>(`SELECT COUNT(*)::int AS n FROM candidates c WHERE c.name IS NOT NULL AND c.name <> '' AND (
    c.status='diagnostic_recu' OR EXISTS (SELECT 1 FROM proposals p WHERE p.candidate_id=c.id AND p.state='repondue' AND p.handled_at IS NULL))`);
  return r?.n ?? 0;
}
```

- [ ] **Step 4 : vérifier** — `npm run typecheck` puis les tests de base (`DATABASE_URL=… node --experimental-strip-types --no-warnings --test tests/db/*.test.mjs`) : tout passe.

- [ ] **Step 5 : commit** — `git add src/lib/proposals.ts src/lib/admin-data.ts tests/db/proposals.test.mjs && git commit -m "Proposals flow: send, answer (atomic), replace, photo, submission, status and « à traiter »"`

### Task 3 : mails

**Files :**
- Modify : `src/lib/mail.ts` (gabarits), `src/lib/proposals-mailer.ts` (nouveau : les vrais mails, `realMailer`)
- Create : `tests/mail-proposals.test.ts`

**Interfaces :**
- Consumes : Task 2 (`setProposalMailer`, `ProposalMailer`), `coachRecipients` (`src/lib/diagnostic.ts`), `sendMail`, `appUrl`.
- Produces :
  - `candidateChoiceSent(name, url, loc)`, `candidateSubjectSent(name, url, loc)`, `candidatePhotoRequested(name, url, loc, comment)`, `candidateReadyToSubmit(name, url, loc, info: { title: string; abstract: string; cfpUrl: string | null; cfpLabel: string | null; deadline: string | null })`, `candidateProposalReminder(name, url, loc)`, `candidateAccessLinks(entries: { event: string; date: string; url: string }[], loc)`, `coachCandidateAnswered(c: { name: string }, what: string, comment: string | null, ficheUrl: string)` — tous renvoient `Built` ;
  - `realMailer: ProposalMailer` (exporté par `src/lib/proposals-mailer.ts`, chargé par `proposals.ts` à la première utilisation).

- [ ] **Step 1 : tests qui échouent** `tests/mail-proposals.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateAccessLinks, candidateChoiceSent, candidatePhotoRequested, candidateProposalReminder, candidateReadyToSubmit, candidateSubjectSent, coachCandidateAnswered } from '../src/lib/mail.ts';

const url = 'https://shespeaks.test/reprendre/tok';
const ai = /\bIA\b|\bAI\b|intelligence artificielle|artificial intelligence|Claude|OpenAI|GPT/i;

test('candidate emails exist in French and English, carry her link, never mention AI', () => {
  for (const loc of ['fr', 'en'] as const) {
    const all = [
      candidateChoiceSent('Aïcha Mbarga', url, loc), candidateSubjectSent('Aïcha', url, loc), candidatePhotoRequested('Aïcha', url, loc, 'Plus lumineuse'),
      candidateReadyToSubmit('Aïcha', url, loc, { title: 'Mon titre', abstract: 'Mon résumé', cfpUrl: 'https://sessionize.com/x', cfpLabel: 'Sessionize', deadline: '31 octobre 2026' }),
      candidateProposalReminder('Aïcha', url, loc), candidateAccessLinks([{ event: 'DevFest Douala 2026', date: '9 octobre 2026', url }], loc),
    ];
    for (const m of all) {
      assert.ok(m.html.includes(url) && m.text.includes(url), m.subject);
      assert.ok(!ai.test(`${m.subject}\n${m.text}`), `${loc}: ${m.subject}`);
    }
  }
  assert.match(candidateChoiceSent('Aïcha', url, 'fr').subject, /propose des sujets/);
  assert.match(candidateChoiceSent('Aïcha', url, 'en').subject, /topics/);
});

test('comments are escaped in HTML', () => {
  const m = coachCandidateAnswered({ name: 'Aïcha' }, 'changements', '<script>alert(1)</script>', 'https://shespeaks.test/admin/candidates/1');
  assert.ok(!m.html.includes('<script>') && m.html.includes('&lt;script&gt;'));
  assert.ok(!candidatePhotoRequested('A', url, 'fr', '<b>x</b>').html.includes('<b>x</b>'));
});
```

- [ ] **Step 2 : constater l'échec** — `node --test --experimental-strip-types tests/mail-proposals.test.ts` : exports manquants.

- [ ] **Step 3 : implémenter** — dans `src/lib/mail.ts`, après `candidateReminder`, les gabarits (même `build` / `Layout` que les autres) :

```ts
export function candidateChoiceSent(name: string, url: string, loc: Locale): Built {
  return loc === 'fr'
    ? build('Ta coach te propose des sujets', { heading: `${first(name)}, choisis ton sujet`, paragraphs: ['Ta coach SheSpeaks a préparé des sujets pour toi, avec pour chacun la raison pour laquelle il te correspond.', 'Choisis celui que tu préfères, ou dis-nous si aucun ne te convient : on t’en proposera d’autres.'], cta: { label: 'Voir les sujets', url } })
    : build('Your coach suggests topics for you', { heading: `${first(name)}, pick your topic`, paragraphs: ['Your SheSpeaks coach has prepared topics for you, each with why it suits you.', 'Pick your favourite, or tell us if none fits: we will suggest others.'], cta: { label: 'See the topics', url } });
}
export function candidateSubjectSent(name: string, url: string, loc: Locale): Built {
  return loc === 'fr'
    ? build('Ton sujet ajusté est prêt : dis-nous s’il te convient', { heading: `${first(name)}, ton sujet a été ajusté`, paragraphs: ['Ta coach a retravaillé ton sujet : titre, résumé, ce qui a changé et pourquoi, et des conseils pour l’aborder sur scène.', 'Approuve-le, ou demande des changements en expliquant ce que tu souhaites.'], cta: { label: 'Voir mon sujet', url } })
    : build('Your adjusted topic is ready: tell us if it works for you', { heading: `${first(name)}, your topic has been adjusted`, paragraphs: ['Your coach reworked your topic: title, abstract, what changed and why, and tips to approach it on stage.', 'Approve it, or ask for changes and explain what you would like.'], cta: { label: 'See my topic', url } });
}
export function candidatePhotoRequested(name: string, url: string, loc: Locale, comment: string): Built {
  return loc === 'fr'
    ? build('Une nouvelle photo, s’il te plaît', { heading: `${first(name)}, encore une photo`, paragraphs: ['Ta coach te demande une nouvelle photo de speaker :', comment], cta: { label: 'Ajouter une photo', url } })
    : build('A new photo, please', { heading: `${first(name)}, one more photo`, paragraphs: ['Your coach asks for a new speaker photo:', comment], cta: { label: 'Add a photo', url } });
}
export function candidateReadyToSubmit(name: string, url: string, loc: Locale, i: { title: string; abstract: string; cfpUrl: string | null; cfpLabel: string | null; deadline: string | null }): Built {
  const facts: [string, string][] = loc === 'fr'
    ? [['Titre', i.title], ['Résumé', i.abstract], ...(i.deadline ? [['Date limite', i.deadline]] as [string, string][] : []), ...(i.cfpUrl ? [['Où soumettre', i.cfpLabel || i.cfpUrl]] as [string, string][] : [])]
    : [['Title', i.title], ['Abstract', i.abstract], ...(i.deadline ? [['Deadline', i.deadline]] as [string, string][] : []), ...(i.cfpUrl ? [['Where to submit', i.cfpLabel || i.cfpUrl]] as [string, string][] : [])];
  return loc === 'fr'
    ? build('Tout est prêt : tu peux soumettre ta candidature', { heading: `${first(name)}, à toi de jouer`, paragraphs: ['Ton sujet est approuvé et ta photo validée. Soumets ta candidature à l’appel à speakers, puis confirme-le dans ton espace.'], facts, cta: { label: 'Ouvrir mon espace', url } })
    : build('All set: you can submit your application', { heading: `${first(name)}, over to you`, paragraphs: ['Your topic is approved and your photo validated. Submit your application to the call for speakers, then confirm it in your space.'], facts, cta: { label: 'Open my space', url } });
}
export function candidateProposalReminder(name: string, url: string, loc: Locale): Built {
  return loc === 'fr'
    ? build('Ta coach attend ta réponse', { heading: `${first(name)}, un petit rappel`, paragraphs: ['Ta coach t’a envoyé une proposition il y a deux jours. Réponds-lui depuis ton espace pour avancer vers ta candidature.'], cta: { label: 'Voir la proposition', url } })
    : build('Your coach is waiting for your answer', { heading: `${first(name)}, a quick reminder`, paragraphs: ['Your coach sent you a proposal two days ago. Answer from your space to move towards your application.'], cta: { label: 'See the proposal', url } });
}
export function candidateAccessLinks(entries: { event: string; date: string; url: string }[], loc: Locale): Built {
  const lines = entries.map((e) => (loc === 'fr' ? `${e.event} (commencé le ${e.date}) : ${e.url}` : `${e.event} (started on ${e.date}): ${e.url}`));
  return loc === 'fr'
    ? build('Ton lien pour retrouver ton espace', { heading: 'Retrouve ton espace SheSpeaks', paragraphs: ['Voici ton lien personnel. Ne le partage pas : il ouvre ton espace sans mot de passe.', ...lines], cta: { label: 'Ouvrir mon espace', url: entries[0].url } })
    : build('Your link to get back to your space', { heading: 'Get back to your SheSpeaks space', paragraphs: ['Here is your personal link. Don’t share it: it opens your space without a password.', ...lines], cta: { label: 'Open my space', url: entries[0].url } });
}
const ANSWER_LABEL: Record<string, string> = {
  choisie: 'a choisi un sujet', aucune: 'ne retient aucun des sujets proposés', approuvee: 'approuve son sujet', changements: 'demande des changements sur son sujet',
  photo_deposee: 'a déposé une nouvelle photo', soumise: 'a soumis sa candidature',
};
export function coachCandidateAnswered(c: { name: string }, what: string, comment: string | null, ficheUrl: string): Built {
  return build(`${c.name} ${ANSWER_LABEL[what] ?? 'a répondu'}`, {
    heading: `${c.name} ${ANSWER_LABEL[what] ?? 'a répondu'}`,
    paragraphs: comment ? ['Son commentaire :', comment] : ['Ouvre sa fiche pour la suite.'],
    cta: { label: 'Ouvrir la fiche', url: ficheUrl },
    footer: 'SheSpeaks · espace coach',
  });
}
```

  Puis `src/lib/proposals-mailer.ts` (chargé par `proposals.ts` à la première utilisation ; les tests le remplacent par `setProposalMailer`) :

```ts
// The real emails of the proposals flow, loaded by proposals.ts on first use (tests plug a recorder instead).
import { appUrl, candidateChoiceSent, candidatePhotoRequested, candidateReadyToSubmit, candidateSubjectSent, coachCandidateAnswered, sendMail } from './mail.ts';
import { eventFor, getCandidate, getSubject } from './data.ts';
import { coachRecipients } from './diagnostic.ts';
import { fmtDate } from './i18n.ts';
import { listProposals, type ProposalMailer } from './proposals.ts';

export const realMailer: ProposalMailer = {
  async toCandidate(id, what) {
    const c = await getCandidate(id);
    if (!c?.email) return;
    const url = `${appUrl()}/reprendre/${c.token}`;
    const name = c.name ?? '';
    let m;
    if (what === 'choix') m = candidateChoiceSent(name, url, c.locale);
    else if (what === 'sujet') m = candidateSubjectSent(name, url, c.locale);
    else if (what === 'photo') {
      const p = (await listProposals(id)).filter((x) => x.kind === 'photo').at(-1);
      m = candidatePhotoRequested(name, url, c.locale, (p?.payload as { comment?: string })?.comment ?? '');
    } else {
      const [s, e] = await Promise.all([getSubject(id), eventFor(c)]);
      m = candidateReadyToSubmit(name, url, c.locale, {
        title: s?.title ?? '', abstract: s?.abstract ?? '', cfpUrl: e?.submission_url ?? null, cfpLabel: e?.submission_label ?? null,
        deadline: e?.cfp_close_date ? fmtDate(e.cfp_close_date, c.locale) : null,
      });
    }
    await sendMail({ ...m, to: c.email, kind: `candidate_proposal_${what}`, candidateId: id });
  },
  async toCoaches(id, what, comment) {
    const c = await getCandidate(id);
    if (!c) return;
    const m = coachCandidateAnswered({ name: c.name ?? '' }, what, comment, `${appUrl()}/admin/candidates/${id}`);
    await Promise.allSettled((await coachRecipients(c)).map((r) => sendMail({ ...m, to: r.email, kind: `coach_answer_${what}`, candidateId: id })));
  },
};
```

  Les envois passent par `mail()` dans `proposals.ts`, qui n'échoue jamais ; les envois réels sont sérialisés par la file de `mail.ts`.

- [ ] **Step 4 : vérifier** — `npm test && npm run typecheck`.

- [ ] **Step 5 : commit** — `git add src/lib/mail.ts src/lib/proposals-mailer.ts tests/mail-proposals.test.ts && git commit -m "Proposals flow: candidate emails (FR/EN, no AI wording) and coach notifications"`

### Task 4 : retrouver son espace (`/acces`) et `/plan` sans session

**Files :**
- Create : `src/lib/access.ts`, `src/app/api/acces/route.ts`, `src/app/(public)/acces/page.tsx`, `src/components/AccessForm.tsx`
- Modify : `src/lib/ratelimit.ts`, `src/app/(public)/(app)/plan/page.tsx` (redirection), `src/lib/i18n.ts` (clés `access`), page d'accueil et premier écran du formulaire (lien), `scripts/smoke.mjs`
- Test : `tests/db/proposals.test.mjs` (ajout), `scripts/smoke.mjs`

**Interfaces :**
- Produces : `requestAccess(email: string, ip: string): Promise<{ retryAfterSec?: number }>` ; `checkAccessRate(ip, email): Promise<RateResult>` ; `POST /api/acces` `{ email }` → `200 { ok: true }` (toujours) ou `429 { retryAfter }`.

- [ ] **Step 1 : tests qui échouent**

  Dans `tests/db/proposals.test.mjs` :

```js
test('/acces: one email listing every journey of the same mailbox; same answer for an unknown address; rate limited', { skip }, async () => {
  const access = await import('../../src/lib/access.ts');
  const sent = [];
  access.setAccessSender(async (to, entries, loc) => { sent.push({ to, n: entries.length, loc }); });
  const box = `box${crypto.randomBytes(3).toString('hex')}`;
  await raw`insert into candidates (token, name, email, locale) values (${crypto.randomBytes(8).toString('hex')}, 'A', ${box + '@gmail.com'}, 'fr'), (${crypto.randomBytes(8).toString('hex')}, 'A2', ${box + '+x@gmail.com'}, 'fr')`;
  assert.deepEqual(await access.requestAccess(`${box}@gmail.com`, '198.51.100.9'), {});
  assert.deepEqual(sent, [{ to: `${box}@gmail.com`, n: 2, loc: 'fr' }]);
  assert.deepEqual(await access.requestAccess('nobody@example.org', '198.51.100.9'), {});
  assert.equal(sent.length, 1, 'nothing sent for an unknown address');
  let limited;
  for (let k = 0; k < 6 && !limited; k++) limited = (await access.requestAccess(`${box}@gmail.com`, '198.51.100.10')).retryAfterSec;
  assert.ok(limited > 0, 'the address limit applies');
});
```

  Dans `scripts/smoke.mjs`, avant la dernière ligne :

```js
// lost session: /plan sends her to « Retrouver mon espace »; /api/acces answers the same for any address
{
  const r = await fetch(BASE + '/plan', { redirect: 'manual' });
  ok(r.status === 307 && (r.headers.get('location') ?? '').endsWith('/acces'), 'access: /plan without a session goes to /acces');
  const a = await fetch(BASE + '/api/acces', { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': randomIp() }, body: JSON.stringify({ email: `nobody-${RUN}@example.org` }) });
  ok(a.status === 200 && (await a.json()).ok === true, 'access: an unknown address gets the same answer');
  ok((await fetch(BASE + '/acces')).status === 200, 'access: the page answers');
}
```

- [ ] **Step 2 : constater l'échec.**

- [ ] **Step 3 : implémenter**

  `src/lib/ratelimit.ts` (après le bloc login) :

```ts
export const ACCESS_MAX_PER_IP = 10;
export const ACCESS_MAX_PER_EMAIL = 3;
/** « Retrouver mon espace »: it emails a link, so the address limit protects the inbox and the IP limit stops automation. */
export async function checkAccessRate(ip: string, email: string): Promise<RateResult> {
  const byIp = await hit({ bucket: 'access:ip', key: rateKey(ipBucket(ip)), max: ACCESS_MAX_PER_IP, windowSec: LOGIN_WINDOW_SEC });
  if (!byIp.ok || !email) return byIp;
  return hit({ bucket: 'access:email', key: rateKey(email), max: ACCESS_MAX_PER_EMAIL, windowSec: LOGIN_WINDOW_SEC });
}
```

  `src/lib/access.ts` :

```ts
// « Retrouver mon espace »: a candidate who lost her session types her email and receives her personal link(s). The answer never says
// whether the address is known (same response, the email is sent after the response), like the coach login.
import { all } from './db.ts';
import { mailboxKey } from './contact.ts';
import { appUrl, candidateAccessLinks, deferMail, sendMail } from './mail.ts';
import { checkAccessRate } from './ratelimit.ts';
import { eventLabel, listEvents } from './data.ts';
import { fmtDate } from './i18n.ts';
import type { Locale } from './questions.ts';

type Entry = { event: string; date: string; url: string };
type Sender = (to: string, entries: Entry[], loc: Locale) => Promise<void>;
let sender: Sender = async (to, entries, loc) => {
  const m = candidateAccessLinks(entries, loc);
  await sendMail({ ...m, to, kind: 'candidate_access_link' });
};
/** Tests replace the sender to see what would be sent. */
export const setAccessSender = (s: Sender) => { sender = s; };

export async function requestAccess(email: string, ip: string): Promise<{ retryAfterSec?: number }> {
  const e = email.trim().toLowerCase().slice(0, 254);
  const rate = await checkAccessRate(ip, e ? mailboxKey(e) : '');
  if (!rate.ok) return { retryAfterSec: rate.retryAfterSec };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return {};
  const job = async () => {
    const box = mailboxKey(e);
    const rows = (await all<{ token: string; email: string; created_at: string; city: string | null; city_other: string | null; locale: Locale }>(
      `SELECT token,email,created_at,city,city_other,locale FROM candidates WHERE email IS NOT NULL AND name IS NOT NULL ORDER BY created_at DESC LIMIT 2000`))
      .filter((r) => mailboxKey(r.email) === box);
    if (!rows.length) return;
    const events = await listEvents();
    const loc = rows[0].locale;
    await sender(rows[0].email, rows.map((r) => ({ event: eventLabel(r, events, loc), date: fmtDate(r.created_at, loc), url: `${appUrl()}/reprendre/${r.token}` })), loc);
  };
  // tests (no request scope) run it inline; a real request answers first, then sends
  if (process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT) await job(); else deferMail(job);
  return {};
}
```

  Note : `node --test` définit `NODE_TEST_CONTEXT` dans les processus de test ; c'est ce qui rend l'envoi synchrone dans le test ci-dessus.

  `src/app/api/acces/route.ts` :

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { requestAccess } from '@/lib/access';
import { requestIp } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { email } = (await req.json().catch(() => ({}))) as { email?: unknown };
  const r = await requestAccess(typeof email === 'string' ? email : '', requestIp(req.headers));
  if (r.retryAfterSec) return NextResponse.json({ retryAfter: r.retryAfterSec }, { status: 429, headers: { 'retry-after': String(r.retryAfterSec) } });
  return NextResponse.json({ ok: true });
}
```

  `src/lib/i18n.ts`, dans `fr` et `en`, une clé `access` :

```ts
  access: {
    title: 'Retrouver mon espace',
    intro: 'Tape l’email que tu as donné dans le formulaire : on t’envoie ton lien personnel.',
    email: 'Ton email',
    send: 'Recevoir mon lien',
    sent: 'Si cette adresse est connue, tu vas recevoir un email avec ton lien dans quelques minutes. Pense à vérifier tes courriers indésirables.',
    limited: 'Trop de demandes : réessaie dans quelques minutes.',
    link: 'Tu as déjà commencé ? Retrouve ton espace',
  },
```
  (version anglaise : `'Find my space'`, `'Type the email you gave in the form: we will send you your personal link.'`, `'Your email'`, `'Get my link'`, `'If this address is known, you will receive an email with your link in a few minutes. Check your spam folder.'`, `'Too many requests: try again in a few minutes.'`, `'Already started? Find your space'`.)

  `src/components/AccessForm.tsx` :

```tsx
'use client';
import { useState } from 'react';

export function AccessForm({ d }: { d: { email: string; send: string; sent: string; limited: string } }) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'limited'>('idle');
  return state === 'sent' ? <p role="status">{d.sent}</p> : (
    <form className="stack-sm" onSubmit={async (e) => {
      e.preventDefault();
      if (state === 'busy') return;
      setState('busy');
      const email = String(new FormData(e.currentTarget).get('email') ?? '');
      const r = await fetch('/api/acces', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) }).catch(() => null);
      setState(r?.status === 429 ? 'limited' : 'sent');
    }}>
      <label className="field">{d.email}<input type="email" name="email" required autoComplete="email" /></label>
      <button className="btn" aria-disabled={state === 'busy' || undefined}>{d.send}</button>
      {state === 'limited' && <p role="alert">{d.limited}</p>}
    </form>
  );
}
```

  `src/app/(public)/acces/page.tsx` :

```tsx
import { getLocale } from '@/lib/locale';
import { t } from '@/lib/i18n';
import { AccessForm } from '@/components/AccessForm';

export const dynamic = 'force-dynamic';
export default async function Access() {
  const d = t(await getLocale()).access;
  return (
    <div className="container narrow" style={{ padding: '32px 0 48px' }}>
      <div className="stack">
        <h1 className="display-l">{d.title}</h1>
        <p>{d.intro}</p>
        <AccessForm d={d} />
      </div>
    </div>
  );
}
```

  `src/app/(public)/(app)/plan/page.tsx` : remplacer `if (!c) redirect('/');` par `if (!c) redirect('/acces');`. Ajouter le lien `access.link` vers `/acces` sur la page d'accueil (sous le bouton principal) et en tête du premier écran du formulaire.

- [ ] **Step 4 : vérifier** — tests unitaires, base, puis smoke en local (pile Compose ou `next start` avec la base locale, comme les tâches précédentes) : `PASS access: …` ×3.

- [ ] **Step 5 : commit** — `git add src/lib/access.ts src/lib/ratelimit.ts src/app/api/acces src/app/\(public\)/acces src/components/AccessForm.tsx src/lib/i18n.ts src/app/\(public\) scripts/smoke.mjs tests/db/proposals.test.mjs && git commit -m "« Retrouver mon espace » (/acces): her personal link by email, same answer for any address, rate limited; /plan without a session goes there"`

### Task 5 : l'espace de la candidate

**Files :**
- Create : `src/components/JourneyPanel.tsx` (serveur), `src/components/ProposalAnswer.tsx` (client), `src/components/SubmitPanel.tsx` (client), `src/app/api/espace/repondre/route.ts`, `src/app/api/espace/soumis/route.ts`
- Modify : `src/app/(public)/(app)/plan/page.tsx`, `src/lib/i18n.ts` (clé `journey`), `src/app/api/diag/photo/route.ts` et `src/app/api/diag/photo/commit/route.ts` (`photoUploaded`), `tests/ai-topics.test.ts` (le test « aucune mention de l'IA » couvre `journey` et `access`), `scripts/smoke.mjs`

**Interfaces :**
- Consumes : Task 2 (`journeyOf`, `listProposals`, `answerProposal`, `confirmSubmission`, `photoUploaded`), Task 1 (types).
- Produces : `POST /api/espace/repondre` `{ proposalId: number, response: string, choice?: number, comment?: string }` → `200 { ok: true }` | `401 { error: 'no_session' }` | `409 { error: <message FR> }` ; `POST /api/espace/soumis` → idem.

- [ ] **Step 1 : smoke qui échoue** (avant la dernière ligne de `scripts/smoke.mjs`) :

```js
// the candidate's answers need her session, and refuse a proposal that is not hers
{
  const r = await fetch(BASE + '/api/espace/repondre', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proposalId: 1, response: 'approuvee' }) });
  ok(r.status === 401, 'space: answering needs a session');
  const c = new Client();
  await c.save('profile', profile('Espace Test'));
  const x = await fetch(BASE + '/api/espace/repondre', { method: 'POST', headers: { 'content-type': 'application/json', cookie: c.cookie() }, body: JSON.stringify({ proposalId: 999999, response: 'approuvee' }) });
  ok(x.status === 409, 'space: a proposal that is not hers is refused');
}
```

  (`Client`, `profile` et `RUN` existent déjà dans le smoke test.)

- [ ] **Step 2 : constater l'échec** (404 sur les routes).

- [ ] **Step 3 : implémenter les routes**

  `src/app/api/espace/repondre/route.ts` :

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { getCandidateFromCookie } from '@/lib/locale';
import { answerProposal } from '@/lib/proposals';
import type { ProposalResponse } from '@/lib/journey';

export const dynamic = 'force-dynamic';
const RESPONSES = ['choisie', 'aucune', 'approuvee', 'changements'];

export async function POST(req: NextRequest) {
  const c = await getCandidateFromCookie();
  if (!c) return NextResponse.json({ error: 'no_session' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { proposalId?: unknown; response?: unknown; choice?: unknown; comment?: unknown };
  const response = String(b.response ?? '');
  if (!RESPONSES.includes(response)) return NextResponse.json({ error: 'Réponse non valide.' }, { status: 409 });
  const r = await answerProposal(c.id, Number(b.proposalId), response as ProposalResponse, b.choice === undefined || b.choice === null ? null : Number(b.choice), String(b.comment ?? ''));
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 409 });
}
```

  `src/app/api/espace/soumis/route.ts` :

```ts
import { NextResponse } from 'next/server';
import { getCandidateFromCookie } from '@/lib/locale';
import { confirmSubmission } from '@/lib/proposals';

export const dynamic = 'force-dynamic';

export async function POST() {
  const c = await getCandidateFromCookie();
  if (!c) return NextResponse.json({ error: 'no_session' }, { status: 401 });
  const r = await confirmSubmission(c.id);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 409 });
}
```

  Dans `src/app/api/diag/photo/route.ts` (POST, après un dépôt réussi) et `src/app/api/diag/photo/commit/route.ts` (après un commit réussi) : `await photoUploaded(c.id);` (import depuis `@/lib/proposals`).

- [ ] **Step 4 : textes** — dans `src/lib/i18n.ts`, `fr` puis `en`, une clé `journey` :

```ts
  journey: {
    whereTitle: 'Où tu en es',
    steps: { recu: 'Intérêt reçu', choix: 'Choix du sujet', sujet: 'Sujet à valider', photo: 'Photo', soumission: 'Soumission', soumise: 'Candidature soumise' } as Record<string, string>,
    todoTitle: 'À faire maintenant',
    nothing: 'L’équipe prépare ta proposition : tu recevras un email.',
    choiceIntro: 'Ta coach te propose ces sujets. Choisis celui que tu préfères.',
    choose: 'Je choisis ce sujet',
    none: 'Aucun ne me convient',
    subjectIntro: 'Ta coach a ajusté ton sujet. Dis-nous s’il te convient.',
    why: 'Pourquoi ces changements',
    how: 'Comment t’y prendre',
    approve: 'J’approuve ce sujet',
    changes: 'Je souhaite des changements',
    comment: 'Ton commentaire',
    commentRequired: 'Explique ce que tu souhaites (obligatoire).',
    commentOptional: 'Un mot pour ta coach (facultatif)',
    send: 'Envoyer',
    photoAsked: 'Ta coach te demande une nouvelle photo :',
    photoPending: 'Ta photo est en cours de validation par ta coach.',
    submitIntro: 'Ton sujet est approuvé et ta photo validée : soumets ta candidature à l’appel à speakers, puis confirme-le ici.',
    copy: 'Copier',
    copied: 'Copié',
    downloadPhoto: 'Télécharger ma photo',
    submitLink: 'Soumettre ma candidature',
    deadline: 'Date limite',
    submitted: 'J’ai soumis ma candidature',
    submittedDone: 'Bravo, ta candidature est soumise ! Ta coach est prévenue.',
    historyTitle: 'Historique',
    sentChoice: 'Ta coach t’a proposé des sujets',
    sentSubject: 'Ta coach t’a envoyé un sujet ajusté',
    sentPhoto: 'Ta coach t’a demandé une nouvelle photo',
    answered: { choisie: 'Tu as choisi', aucune: 'Aucun ne te convenait', approuvee: 'Tu as approuvé', changements: 'Tu as demandé des changements', photo_deposee: 'Tu as déposé une nouvelle photo' } as Record<string, string>,
    replaced: 'Remplacée par une nouvelle proposition',
    error: 'Ça n’a pas marché : recharge la page et réessaie.',
  },
```
  Version anglaise, mêmes clés : `'Where you stand'`, steps `{ recu: 'Interest received', choix: 'Topic choice', sujet: 'Topic to approve', photo: 'Photo', soumission: 'Submission', soumise: 'Application submitted' }`, `'To do now'`, `'The team is preparing your proposal: you will receive an email.'`, `'Your coach suggests these topics. Pick your favourite.'`, `'I choose this topic'`, `'None of them fits me'`, `'Your coach adjusted your topic. Tell us if it works for you.'`, `'Why these changes'`, `'How to approach it'`, `'I approve this topic'`, `'I would like changes'`, `'Your comment'`, `'Explain what you would like (required).'`, `'A word for your coach (optional)'`, `'Send'`, `'Your coach asks for a new photo:'`, `'Your photo is being validated by your coach.'`, `'Your topic is approved and your photo validated: submit your application to the call for speakers, then confirm it here.'`, `'Copy'`, `'Copied'`, `'Download my photo'`, `'Submit my application'`, `'Deadline'`, `'I have submitted my application'`, `'Well done, your application is submitted! Your coach knows.'`, `'History'`, `'Your coach suggested topics'`, `'Your coach sent you an adjusted topic'`, `'Your coach asked for a new photo'`, answered `{ choisie: 'You chose', aucune: 'None fitted', approuvee: 'You approved', changements: 'You asked for changes', photo_deposee: 'You uploaded a new photo' }`, `'Replaced by a new proposal'`, `'That did not work: reload the page and try again.'`.

- [ ] **Step 5 : composants**

  `src/components/ProposalAnswer.tsx` :

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type D = { choose: string; none: string; approve: string; changes: string; comment: string; commentRequired: string; commentOptional: string; send: string; error: string };

/** The buttons under a pending proposal: they post to /api/espace/repondre, then reload the page on the next state. */
export function ProposalAnswer({ proposalId, kind, count, d }: { proposalId: number; kind: 'choix' | 'sujet'; count: number; d: D }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | { response: string; choice?: number; required: boolean }>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const post = async (response: string, choice: number | undefined, comment: string) => {
    if (busy) return;
    setBusy(true); setError('');
    const r = await fetch('/api/espace/repondre', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proposalId, response, choice, comment }) }).catch(() => null);
    if (r?.ok) { router.refresh(); return; }
    setBusy(false);
    setError(((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? d.error);
    router.refresh();
  };
  if (mode) {
    return (
      <form className="stack-sm" onSubmit={(e) => { e.preventDefault(); post(mode.response, mode.choice, String(new FormData(e.currentTarget).get('comment') ?? '')); }}>
        <label className="field">{mode.required ? d.commentRequired : d.commentOptional}<textarea name="comment" maxLength={1000} required={mode.required} rows={3} /></label>
        <button className="btn" aria-disabled={busy || undefined}>{d.send}</button>
        {error && <p role="alert">{error}</p>}
      </form>
    );
  }
  return (
    <div className="stack-sm">
      {kind === 'choix'
        ? <>{Array.from({ length: count }, (_, k) => <button key={k} className="btn" onClick={() => setMode({ response: 'choisie', choice: k, required: false })}>{d.choose} {k + 1}</button>)}
            <button className="btn btn-ghost" onClick={() => setMode({ response: 'aucune', required: true })}>{d.none}</button></>
        : <><button className="btn" onClick={() => setMode({ response: 'approuvee', required: false })}>{d.approve}</button>
            <button className="btn btn-ghost" onClick={() => setMode({ response: 'changements', required: true })}>{d.changes}</button></>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
```

  `src/components/SubmitPanel.tsx` :

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CopyButton({ value, d }: { value: string; d: { copy: string; copied: string } }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await navigator.clipboard.writeText(value).catch(() => {}); setDone(true); }}>{done ? d.copied : d.copy}</button>;
}

export function SubmittedButton({ label, error }: { label: string; error: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  return (
    <>
      <button className="btn" aria-disabled={busy || undefined} onClick={async () => {
        if (busy) return; setBusy(true);
        const r = await fetch('/api/espace/soumis', { method: 'POST' }).catch(() => null);
        if (r?.ok) { router.refresh(); return; }
        setBusy(false); setMsg(((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? error);
      }}>{label}</button>
      {msg && <p role="alert">{msg}</p>}
    </>
  );
}
```

  `src/components/JourneyPanel.tsx` (composant serveur ; reçoit tout en props) :

```tsx
import type { Journey, Proposal, ChoicePayload, SubjectPayload, PhotoPayload } from '@/lib/journey';
import { ProposalAnswer } from './ProposalAnswer';
import { CopyButton, SubmittedButton } from './SubmitPanel';
import { fmtDate } from '@/lib/i18n';
import type { Locale } from '@/lib/questions';

type Props = {
  j: Journey; proposals: Proposal[]; locale: Locale; d: Record<string, any>;
  submit: { title: string; abstract: string; photoUrl: string | null; cfpUrl: string | null; cfpLabel: string | null; deadline: string | null };
};

export function JourneyPanel({ j, proposals, locale, d, submit }: Props) {
  const p = j.pending;
  return (
    <>
      <section className="card card-lg stack-sm" aria-labelledby="h-where">
        <h2 id="h-where" className="title" style={{ fontSize: 22 }}>{d.whereTitle}</h2>
        <ol className="journey-steps">
          {['recu', ...j.steps].map((s) => {
            const idx = j.steps.indexOf(j.step as never);
            const mine = s === 'recu' ? -1 : j.steps.indexOf(s as never);
            const state = s === j.step ? 'current' : mine < idx ? 'done' : 'todo';
            return <li key={s} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>{d.steps[s]}</li>;
          })}
        </ol>
      </section>

      <section className="card card-lg stack-sm" aria-labelledby="h-todo">
        <h2 id="h-todo" className="title" style={{ fontSize: 22 }}>{d.todoTitle}</h2>
        {j.step === 'soumise' ? <p>{d.submittedDone}</p>
          : j.step === 'soumission' ? (
            <div className="stack-sm">
              <p>{d.submitIntro}</p>
              <p><strong>{submit.title}</strong> <CopyButton value={submit.title} d={d} /></p>
              <p style={{ whiteSpace: 'pre-line' }}>{submit.abstract}</p><CopyButton value={submit.abstract} d={d} />
              {submit.photoUrl && <p><a href={submit.photoUrl} download>{d.downloadPhoto}</a></p>}
              {submit.deadline && <p>{d.deadline} : {submit.deadline}</p>}
              {submit.cfpUrl && <p><a className="btn btn-ghost" href={submit.cfpUrl} target="_blank" rel="noopener">{submit.cfpLabel || d.submitLink}</a></p>}
              <SubmittedButton label={d.submitted} error={d.error} />
            </div>)
          : p?.kind === 'choix' ? (
            <div className="stack-sm">
              <p>{d.choiceIntro}</p>
              <ol>{(p.payload as ChoicePayload).items.map((it, k) => <li key={k}><strong>{it.title}</strong><br />{it.pitch}</li>)}</ol>
              <ProposalAnswer proposalId={p.id} kind="choix" count={(p.payload as ChoicePayload).items.length} d={d} />
            </div>)
          : p?.kind === 'sujet' ? (
            <div className="stack-sm">
              <p>{d.subjectIntro}</p>
              <h3 style={{ margin: 0 }}>{(p.payload as SubjectPayload).title}</h3>
              <p style={{ whiteSpace: 'pre-line' }}>{(p.payload as SubjectPayload).abstract}</p>
              {(p.payload as SubjectPayload).why && <><h4 style={{ margin: 0 }}>{d.why}</h4><p>{(p.payload as SubjectPayload).why}</p></>}
              {(p.payload as SubjectPayload).plan.length > 0 && <><h4 style={{ margin: 0 }}>{d.how}</h4><ol>{(p.payload as SubjectPayload).plan.map((s, k) => <li key={k}>{s}</li>)}</ol></>}
              <ProposalAnswer proposalId={p.id} kind="sujet" count={0} d={d} />
            </div>)
          : p?.kind === 'photo' ? <p>{d.photoAsked} {(p.payload as PhotoPayload).comment}</p>
          : j.step === 'photo' ? <p>{d.photoPending}</p>
          : <p>{d.nothing}</p>}
      </section>

      {proposals.length > 0 && (
        <section className="card card-lg stack-sm" aria-labelledby="h-history">
          <h2 id="h-history" className="title" style={{ fontSize: 22 }}>{d.historyTitle}</h2>
          <ul className="stack-sm">
            {[...proposals].reverse().map((x) => (
              <li key={x.id}>
                <details>
                  <summary>{fmtDate(x.sent_at, locale)} · {x.kind === 'choix' ? d.sentChoice : x.kind === 'sujet' ? d.sentSubject : d.sentPhoto}
                    {x.state === 'remplacee' ? ` · ${d.replaced}` : x.response ? ` · ${d.answered[x.response]}${x.response === 'choisie' && x.kind === 'choix' ? ` : ${(x.payload as ChoicePayload).items[x.response_choice ?? 0]?.title ?? ''}` : ''}` : ''}</summary>
                  {x.kind === 'sujet' && <p><strong>{(x.payload as SubjectPayload).title}</strong></p>}
                  {x.kind === 'choix' && <ol>{(x.payload as ChoicePayload).items.map((it, k) => <li key={k}>{it.title}</li>)}</ol>}
                  {x.kind === 'photo' && <p>{(x.payload as PhotoPayload).comment}</p>}
                  {x.candidate_comment && <p>« {x.candidate_comment} »</p>}
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
```

  Styles (fin de `src/app/globals.css`) :

```css
.journey-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.journey-steps li { padding: 6px 12px; border-radius: 999px; background: var(--surface-sunken, #f1eee9); font-size: 14px; }
.journey-steps li[data-state="done"] { opacity: .7; }
.journey-steps li[data-state="current"] { background: #F5A524; color: #111528; font-weight: 700; }
```

- [ ] **Step 6 : la page `/plan`** — dans `src/app/(public)/(app)/plan/page.tsx`, après le bloc de confirmation existant :

```tsx
  const [j, proposals, ev] = await Promise.all([journeyOf(c.id), listProposals(c.id), eventFor(c)]);
  const validated = photos.find((p) => p.id === c.selected_photo_id);
  ...
        {j && <JourneyPanel j={j} proposals={proposals} locale={locale} d={t(locale).journey} submit={{
          title: sub?.title ?? '', abstract: sub?.abstract ?? '', photoUrl: validated ? `/api/photos/${validated.id}` : null,
          cfpUrl: ev?.submission_url ?? null, cfpLabel: ev?.submission_label ?? null, deadline: ev?.cfp_close_date ? fmtDate(ev.cfp_close_date, locale) : null,
        }} />}
```
  (imports : `journeyOf`, `listProposals` depuis `@/lib/proposals` ; `JourneyPanel` ; `fmtDate` depuis `@/lib/i18n`.) La liste des pistes (`tracksTitle`) disparaît de la page : les sujets proposés passent désormais par l'échange « choix ».

- [ ] **Step 7 : aucune mention de l'IA** — dans `tests/ai-topics.test.ts`, le test « the candidate-facing form says nothing about the AI tool » : ajouter une boucle sur `Object.values(t('fr').journey)`, `t('en').journey`, `t('fr').access`, `t('en').access` (chaînes et sous-objets aplatis) avec la même expression `mention`.

- [ ] **Step 8 : vérifier** — `npm test && npm run typecheck` ; base ; smoke local (`PASS space: …`) ; rendu local de `/plan` pour une candidate de test avec une proposition `sujet` insérée en base (même méthode que les tâches précédentes : `next start` + curl avec son cookie `ss_token`) : les trois blocs s'affichent.

- [ ] **Step 9 : commit** — `git add -A src scripts tests && git commit -m "Candidate space: where she stands, the proposal to answer, the submission, the history (FR/EN)"`

### Task 6 : la fiche côté coach

**Files :**
- Modify : `src/app/admin/actions.ts`, `src/app/admin/(panel)/candidates/[id]/page.tsx`
- Test : rendu local (même méthode que les tâches précédentes) et tests base existants

**Interfaces :**
- Consumes : Task 2 (`sendChoice`, `sendSubject`, `requestPhoto`, `validatePhoto`, `markHandled`, `journeyOf`, `listProposals`), `UseInField` (existant).
- Produces : actions `sendChoiceAction`, `sendSubjectAction`, `requestPhotoAction`, `validatePhotoAction`, `markHandledAction` (FormData : `cid`, et `photo_id` / `comment` selon le cas).

- [ ] **Step 1 : actions** — dans `src/app/admin/actions.ts` :

```ts
import { markHandled, requestPhoto, sendChoice, sendSubject, validatePhoto } from '@/lib/proposals';

export async function sendChoiceAction(f: FormData) {
  const coach = await requireCoach();
  const id = num(f, 'cid');
  const r = await sendChoice(id, coach.id);
  return r.ok ? back(cpath(id), 'Choix envoyé à la candidate : elle est prévenue par email') : back(cpath(id), r.error, true);
}
export async function sendSubjectAction(f: FormData) {
  const coach = await requireCoach();
  const id = num(f, 'cid');
  const r = await sendSubject(id, coach.id);
  return r.ok ? back(cpath(id), 'Sujet envoyé à la candidate pour validation : elle est prévenue par email') : back(cpath(id), r.error, true);
}
export async function requestPhotoAction(f: FormData) {
  const coach = await requireCoach();
  const id = num(f, 'cid');
  const r = await requestPhoto(id, coach.id, str(f, 'comment'));
  return r.ok ? back(cpath(id, 'photos'), 'Nouvelle photo demandée à la candidate') : back(cpath(id, 'photos'), r.error, true);
}
export async function validatePhotoAction(f: FormData) {
  await requireCoach();
  const id = num(f, 'cid');
  const r = await validatePhoto(id, num(f, 'photo_id'));
  return r.ok ? back(cpath(id, 'photos'), 'Photo validée') : back(cpath(id, 'photos'), r.error, true);
}
export async function markHandledAction(f: FormData) {
  await requireCoach();
  const id = num(f, 'cid');
  await markHandled(id);
  return back(cpath(id), 'Réponse marquée comme traitée');
}
```

  `saveSubjectAction` : enregistrer aussi `why` et `plan` :

```ts
    `INSERT INTO subjects (candidate_id,title,abstract,audience,format,application_state,why,plan) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(candidate_id) DO UPDATE SET title=excluded.title, abstract=excluded.abstract, audience=excluded.audience, format=excluded.format,
       application_state=excluded.application_state, why=excluded.why, plan=excluded.plan`,
    id, str(f, 'title'), str(f, 'abstract'), str(f, 'audience') || null, str(f, 'format') || null, str(f, 'application_state') || 'a_soumettre',
    str(f, 'why').slice(0, 1500) || null, str(f, 'plan').slice(0, 3000) || null,
```

  `trackAction`, opération d'enregistrement d'une piste : enregistrer aussi `pitch` (`str(f, 'pitch').slice(0, 400) || null`) dans le même `UPDATE tracks`.

- [ ] **Step 2 : la fiche** — dans `candidates/[id]/page.tsx` :
  1. Charger `const [journeyNow, exchanges] = await Promise.all([journeyOf(id), listProposals(id)]);`.
  2. En tête de l'onglet « Sujet et pistes », une section « Échanges avec la candidate » : l'étape (`journeyNow.step` en libellé français : choix « Choix du sujet », sujet « Sujet à valider », photo « Photo », soumission « En attente de sa soumission », soumise « Candidature soumise »), qui doit agir (`waiting` : « À toi », « En attente de la candidate », « Terminé »), l'historique (`exchanges` du plus récent au plus ancien : date `fmtDate(x.sent_at,'fr',DATE_TIME)`, type, contenu court, réponse et commentaire de la candidate), et, s'il existe une réponse `repondue` sans `handled_at`, un formulaire `markHandledAction` « Marquer comme traité ».
  3. Dans chaque piste **retenue** (`t.state === 'retenue_coach'`), un champ `<AutoGrowTextarea name="pitch" defaultValue={t.pitch ?? t.hook ?? ''} maxLength={400} aria-label={`Pour la candidate : pourquoi le sujet ${i + 1} lui irait`} />` avec le libellé « Pour la candidate : pourquoi ce sujet lui irait », dans le même formulaire que le titre de la piste (enregistré par « Enregistrer »).
  4. Sous la liste des pistes (branches A et B), un formulaire `sendChoiceAction` : `<PendingButton className="a-btn" pendingLabel="Envoi…" confirmText={`Envoyer à la candidate les ${retained.length} pistes retenues, avec leur phrase ? Elle reçoit un email et choisit dans son espace.`} disabled={retained.length < 2 || retained.length > 3}>Envoyer les pistes retenues à la candidate ({retained.length})</PendingButton>` où `retained = tracks.filter((t) => t.state === 'retenue_coach')`, et sous le bouton : « Il faut 2 ou 3 pistes retenues, chacune avec sa phrase. »
  5. Dans le formulaire du sujet, après le résumé : `<label className="a-label">Pourquoi ces changements (pour la candidate)<textarea id="subject-why" className="a-textarea" name="why" defaultValue={subject?.why ?? ''} maxLength={1500} /></label>` et `<label className="a-label">Comment t’y prendre (une étape par ligne)<textarea id="subject-plan" className="a-textarea" name="plan" defaultValue={subject?.plan ?? ''} /></label>`.
  6. Dans le bloc « Proposition d’amélioration » : `<UseInField target="subject-why" value={proposal.note}>Utiliser comme « Pourquoi »</UseInField>` et `<UseInField target="subject-plan" value={proposal.plan.join('\n')}>Utiliser ce plan</UseInField>`.
  7. Sous le formulaire du sujet, un formulaire `sendSubjectAction` : `<PendingButton className="a-btn" pendingLabel="Envoi…" confirmText="Envoyer à la candidate le sujet enregistré (titre, résumé, pourquoi, plan) pour validation ? Pense à enregistrer tes dernières modifications avant.">Envoyer à la candidate pour validation</PendingButton>`.
  8. Onglet Photos : sur chaque photo, un formulaire `validatePhotoAction` (`photo_id`) « Valider cette photo », et sous la galerie un formulaire `requestPhotoAction` avec `<textarea name="comment" required maxLength={1000} />` « Demander une autre photo ». Afficher « Photo validée le … » si `c.photo_validated_at`.
  9. En tête de fiche, à côté de « Écrire sur WhatsApp » : `<a className="a-btn is-ghost" href={`https://wa.me/${wa}?text=${encodeURIComponent(`Bonjour ${c.name?.split(' ')[0] ?? ''}, voici ton lien personnel pour retrouver ton espace SheSpeaks : ${appUrl()}/reprendre/${c.token}`)}`} target="_blank" rel="noopener">Envoyer son lien d’accès sur WhatsApp</a>` (seulement si `wa`) ; importer `appUrl` depuis `@/lib/mail`.

- [ ] **Step 3 : vérifier** — `npm run typecheck`, tests unitaires et base ; rendu local d'une fiche A avec 3 pistes retenues (bouton « Envoyer les pistes retenues à la candidate (3) », champs « Pour la candidate ») et d'une fiche C (champs « Pourquoi » et « Comment t'y prendre », bouton d'envoi, bloc « Échanges »).

- [ ] **Step 4 : commit** — `git add src/app/admin && git commit -m "Coach fiche: exchanges block, pitch per retained track and « send the retained tracks », why and plan on the subject and « send for validation », photo validate or request, WhatsApp access link, mark as handled"`

### Task 7 : relance à 48 h et résumé coach

**Files :**
- Modify : `src/lib/reminders.ts`, `src/lib/mail.ts` (`coachStalledDigest` : section « En attente de la candidate »)
- Test : `tests/db/proposals.test.mjs` (ajout)

**Interfaces :**
- Consumes : `candidateProposalReminder` (Task 3), table `proposals`.
- Produces : `runReminders()` envoie les relances de proposition et compte `report.proposalReminders` ; `remindPendingProposals(now: Date): Promise<number>` exportée.

- [ ] **Step 1 : test qui échoue**

```js
test('a proposal unanswered for 48 h gets one reminder, never two', { skip }, async () => {
  const rem = await import('../../src/lib/reminders.ts');
  const id = await candidate('C');
  await raw`insert into subjects (candidate_id, title, abstract) values (${id}, 'T', 'A')`;
  await P.sendSubject(id, 1);
  await raw`update proposals set sent_at = (now() at time zone 'utc') - interval '49 hours' where candidate_id = ${id}`;
  assert.ok((await rem.remindPendingProposals(new Date())) >= 1);
  const [{ reminded_at }] = await raw`select reminded_at from proposals where candidate_id = ${id}`;
  assert.ok(reminded_at);
  const again = await rem.remindPendingProposals(new Date());
  assert.equal((await raw`select count(*)::int as n from email_log where candidate_id = ${id} and kind = 'candidate_proposal_reminder'`)[0].n, 1);
});
```

- [ ] **Step 2 : constater l'échec.**

- [ ] **Step 3 : implémenter** — dans `src/lib/reminders.ts` :

```ts
import { candidateProposalReminder } from './mail.ts';

/** One reminder for a proposal left unanswered for 48 hours (claimed first, so two runs never send it twice). */
export async function remindPendingProposals(now = new Date()): Promise<number> {
  const due = await all<{ id: number; candidate_id: number }>(
    `SELECT id, candidate_id FROM proposals WHERE state='envoyee' AND reminded_at IS NULL AND sent_at <= (?::timestamp - interval '48 hours')`,
    now.toISOString().replace('T', ' ').slice(0, 19));
  let sent = 0;
  for (const p of due) {
    const claimed = await get<{ id: number }>(`UPDATE proposals SET reminded_at=(now() at time zone 'utc') WHERE id=? AND reminded_at IS NULL RETURNING id`, p.id);
    if (!claimed) continue;
    const c = await getCandidate(p.candidate_id);
    if (!c?.email) continue;
    const m = candidateProposalReminder(c.name ?? '', `${appUrl()}/reprendre/${c.token}`, c.locale);
    await sendMail({ ...m, to: c.email, kind: 'candidate_proposal_reminder', candidateId: c.id });
    sent++;
  }
  return sent;
}
```
  et, dans `runReminders`, juste avant l'envoi des résumés coach : `report.proposalReminders = await remindPendingProposals(now);` (ajouter `proposalReminders: number` au type `ReminderReport`, initialisé à `0`). Dans le résumé coach (`coachStalledDigest`), ajouter un paragraphe « Propositions relancées ce matin : N » quand N > 0 (paramètre optionnel `proposalReminders?: number`).

- [ ] **Step 4 : vérifier** — tests base (dont `tests/db/reminders.test.mjs` inchangés) et unitaires.

- [ ] **Step 5 : commit** — `git add src/lib/reminders.ts src/lib/mail.ts tests/db/proposals.test.mjs && git commit -m "Proposals flow: one reminder after 48 h without an answer, mentioned in the coach digest"`

### Task 8 : documentation et vérification d'ensemble

**Files :**
- Modify : `README.md` (section « Parcours de propositions »), `docs/deploy-vps.md` (aucune variable nouvelle : le rappeler)

- [ ] **Step 1 : README** — une section courte : les étapes, la table `proposals`, les routes `/api/espace/*` et `/api/acces`, `src/lib/journey.ts` (étape calculée), les mails (`candidate_proposal_*`, `coach_answer_*`, `candidate_access_link`, `candidate_proposal_reminder`), la règle « aucune mention de l'IA côté candidate ».
- [ ] **Step 2 : tout vérifier** — `npm test && npm run typecheck`, tests base, build, smoke local complet.
- [ ] **Step 3 : commit** — `git add README.md docs/deploy-vps.md && git commit -m "Docs: the proposals flow"`
