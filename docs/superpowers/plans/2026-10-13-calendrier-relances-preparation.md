# Plan d'implémentation : calendrier commun, admission, relances et plan de préparation

Spécification : `docs/superpowers/specs/2026-10-13-calendrier-relances-preparation-design.md`.
Cinq livraisons, une PR chacune, dans l'ordre. Chaque PR : tests unitaires et base de
données, vérification dans Chromium (ordinateur et 390 px), relecture indépendante, puis
description de la PR avec le verdict. Aucune fusion sans l'accord explicite de la
propriétaire. Les migrations ne font qu'ajouter ; la prochaine est la `0016`.

Conventions du dépôt à respecter : logique pure dans `src/lib/*.ts` (imports relatifs avec
`.ts`, pas de syntaxe TypeScript sans équivalent JavaScript, pour que Node la charge dans
les tests), actions serveur qui répondent `{ ok, msg }`, jours en texte `AAAA-MM-JJ`
(`src/lib/dates.ts`), textes candidates FR et EN (`src/lib/i18n.ts` : `en` est typé sur `fr`),
espace coach en français, jamais de mention de l'IA côté candidate, commentaires en anglais.

## Livraison A : le formulaire

### A1. Calendrier et réglages (pur)

- `src/lib/calendar.ts` (nouveau, pur) :
  - `isoOrNull(x)`, `closesAt(interestDeadline)` (fin du jour en Douala), `admissionOpen({ today, interestDeadline, admittedLate })`.
  - `openEvents(events, today)` : événements à `event_date` valide et non passée.
  - `calendarWarnings({ interestDeadline, rehearsalDate, internalDeadline, events })` : les trois avertissements de cohérence.
- `src/lib/db.ts` : ajouter à `SETTING_DEFAULTS` `interest_deadline: ''`, `rehearsal_date: ''`, `rehearsal_info: ''`, `calendar_reminders_enabled: 'false'`.
- `src/app/admin/actions.ts` (`saveSettingsAction`) et `src/app/admin/(panel)/settings/page.tsx` : champs, validation des dates, avertissements.
- Tests : `tests/calendar.test.ts` (limites de la clôture à 23 h 59 et au lendemain, fuseau, dates absentes ou illisibles, événements ouverts, avertissements).

### A2. Événements proposés

- `src/lib/data.ts` `getRefs` : `events` = `openEvents(...)`, sans `OTHER_EVENT`.
- `src/lib/questions.ts` : la validation de `P2` reste fondée sur `refs.events` ; une valeur déjà enregistrée par un dossier existant n'est acceptée que si l'événement est encore proposé.
- Formulaire : si `refs.events` est vide, afficher « candidatures closes » (même composant que la clôture).
- Tests : validation de `P2` (événement ouvert, sans date, passé, `autre`), formulaire sans événement ouvert.

### A3. Clôture

- Migration `supabase/migrations/0016_calendar.sql` : `candidates.admitted_late_at timestamp` (les autres tables arrivent avec leur livraison).
- `src/lib/diagnostic.ts` `submitScreen` : après le contrôle « déjà terminé », si la clôture est passée et que le dossier n'est pas admis, répondre `{ ok: false, errors: {}, fatal: 'closed' }` (nouveau dossier et dossier non terminé).
- Routes et pages : `src/app/api/diag/save/route.ts` (code `closed` → 403 avec la date), `src/app/(public)/(app)/interet/page.tsx`, reprise par lien et par code, `src/components/Wizard.tsx` (écran « candidatures closes »), page d'accueil (bandeau « ouvertes jusqu'au … » puis bouton remplacé).
- `src/lib/reminders.ts` : les relances d'un formulaire abandonné ignorent les dossiers non admis après la clôture.
- Fiche coach : action `admitLateAction` et bouton, uniquement pour un dossier non terminé.
- i18n : textes FR et EN (clôture, bandeau, page close).
- Tests : `submitScreen` refusé avant et après la clôture, admis, aux limites de l'heure ; `tests/db/*.test.mjs`.

### A4. Finalisation fiable

- `src/lib/diagnostic.ts` : extraire la finalisation de `completeDiagnostic` pour l'exécuter dans la transaction de `submitScreen` quand `nextId === 'done'` (date de fin, statut « Intérêt reçu », ligne du sujet), puis `deferMail(notifyCompletion)` après la validation de la transaction.
- `wizardState` et la reprise : si `current_screen = 'done'` sans `completed_at`, finaliser (idempotent) avant de répondre.
- `scripts/recover-stuck-forms.mjs` : simulation par défaut, `--apply` pour finaliser ; liste aussi les dossiers sur « Autre » ou sur un événement sans date. Documenté dans `README.md` et `docs/deploy-vps.md`.
- Tests : reproduction du défaut avec un déclencheur qui fait échouer la finalisation (le marqueur ne passe pas à « terminé »), rattrapage à la lecture, script en simulation et avec `--apply`.

### A5. Vérification et relecture

`npm test`, `npm run test:db`, `tsc`, Chromium (formulaire ouvert, fermé, admis, liste des événements, bandeau, mobile). Relecture indépendante (formulaire et règles ; finalisation ; textes et accessibilité).

## Livraison B : le plan de préparation (candidate)

- Migration `0017_prep.sql` : `prep_tasks` (clé `(candidate_id, key)`, cascade, sécurité par ligne). Les tables du journal des relances viennent avec la livraison D.
- `src/lib/prep.ts` (pur) : tâches types FR/EN, `prepSchedule`, `urgency`, `prepProgress` ; tests `tests/prep.test.ts` (confortable, normale, serrée, très serrée, dates absentes, répétition après l'événement, décalage coach, ordre des échéances).
- Accès base (`src/lib/prep-store.ts`) : lire les états en une requête, `tickTask`, `noteTask`, `skipTask`, `setDue` ; tests DB (idempotence, réversibilité, notes, cascade).
- `src/app/api/espace/prep/route.ts` : écriture par la candidate (cookie), clés connues, note limitée.
- `src/app/(public)/(app)/plan/page.tsx` et `JourneyPanel.tsx` : section « Ta préparation » à la place de la phrase de félicitations ; `RoadmapView` reçoit `submitted` ; textes FR/EN.
- Mail de confirmation à la candidate quand elle confirme sa soumission (`confirmSubmission`), avec ajout aux tests de vocabulaire (`tests/mail-proposals.test.ts`, `tests/ai-topics.test.ts`).
- Chromium : cocher, noter, retard, mobile, parcours rouvert, « non retenue ».

## Livraison C : l'espace coach

- Onglet `prep` sur la fiche (liste blanche dans `actions.ts`, `TABS` de la page), actions : cocher pour elle, passer, décaler, note ; avance de statut par `advance` pour `slides_review` et `rehearsal_day`.
- Bouton « Relancer sur WhatsApp » avec message prérempli.
- `candidateRows` : avancement et retard en une requête agrégée ; colonne et pastille dans la liste ; section « Préparation en retard » du tableau de bord.
- Tests : avance de statut sans retour arrière, agrégat sans requête par ligne, Chromium.

## Livraison D : les relances

- Migration `0018_reminders_sent.sql` : `reminders_sent (candidate_id, key, sent_at)`, clé primaire `(candidate_id, key)`, cascade, sécurité par ligne.
- `src/lib/calendar-reminders.ts` : passe `runCalendarReminders(now)` ; sélection des relances dues, revendication par insertion `ON CONFLICT DO NOTHING`, regroupement en un email par candidate et par passage, plafond de 300, journal des envois dans `email_log` (types `candidate_*`).
- `src/app/api/cron/reminders/route.ts` : appelle la passe après `runReminders`, rapport étendu (`ReminderReport`).
- Mails FR/EN (`src/lib/mail.ts`), libellés dans la page Emails de l'admin, résumé quotidien pour les coachs.
- Tests : une relance n'est envoyée qu'une fois, deux passages simultanés, rattrapage après un jour manqué, urgence, regroupement, exclusion (sans email, non retenue, après l'événement, parcours rouvert), vocabulaire.
- Mise en production : activer `calendar_reminders_enabled` d'abord sur la préproduction, vérifier le journal des emails, puis en production.

## Livraison E : la suite de la décision

- Messages après « Retenue » et « Non retenue » ; échéances de l'événement ; lien « candidater à un autre événement » et copie des réponses, du sujet et de la photo validée vers un nouveau dossier (`journeysOf`, `startNew`).
- Tests DB de la copie ; Chromium.

## Ordre et dépendances

A avant tout (la clôture est urgente et la finalisation perd des candidates). B demande les
dates de A. C et D demandent B. E demande A et B. Les textes des tâches et des relances
sont relus par l'équipe avant D.
