# Plan d'implémentation : calendrier commun, admission, relances et plan de préparation

Spécification : `docs/superpowers/specs/2026-10-13-calendrier-relances-preparation-design.md`.
Cinq livraisons, une PR chacune, dans l'ordre. Chaque PR : tests unitaires et base de
données, vérification dans Chromium (ordinateur et 390 px), relecture indépendante, puis
description de la PR avec le verdict. Aucune fusion sans l'accord explicite de la
propriétaire. Les migrations ne font qu'ajouter, une par livraison qui en a besoin :
`0016` (A), `0017` (B). Les livraisons C, D et E n'en ajoutent pas.

Conventions du dépôt à respecter : logique pure dans `src/lib/*.ts` (imports relatifs avec
`.ts`, pas de syntaxe TypeScript sans équivalent JavaScript, pour que Node la charge dans
les tests), actions serveur qui répondent `{ ok, msg }`, jours en texte `AAAA-MM-JJ`
(`src/lib/dates.ts`), textes candidates FR et EN (`src/lib/i18n.ts` : `en` est typé sur `fr`),
espace coach en français, jamais de mention de l'IA côté candidate, commentaires en anglais.

## Livraison A : le formulaire et les premières relances

### A1. Calendrier et réglages (pur)

- `src/lib/dates.ts` : `dayOf(ts)` (horodatage UTC → jour de Douala), gardes sur les dates illisibles.
- `src/lib/calendar.ts` (nouveau, pur) :
  - `closesAt(interestDeadline)`, `admissionOpen({ today, interestDeadline, admittedLate })`.
  - `openEvents(events, today, rehearsalDate)` : événements à `event_date` valide, non passée, postérieure à `rehearsalDate` quand il est réglé.
  - `calendarWarnings({ interestDeadline, internalDeadline, rehearsalDate, events })` : les quatre avertissements de la spécification.
  - `reminderDue({ today, target, tier })` : la fenêtre de deux jours ; `urgency(days)` et son rythme.
- `src/lib/db.ts` : `SETTING_DEFAULTS` reçoit `interest_deadline: ''`, `rehearsal_date: ''`, `rehearsal_info: ''`, `calendar_reminders_enabled: 'false'`, `coach_digest_last: ''`.
- `saveSettingsAction` (`src/app/admin/actions.ts`) et `src/app/admin/(panel)/settings/page.tsx` : champs, validation des dates, avertissements, aperçu des relances du jour (branché en A4).
- Tests : `tests/calendar.test.ts` (clôture à 23 h 59 et au lendemain, fuseau, dates absentes ou illisibles, événements ouverts, avertissements, fenêtres).

### A2. Événements proposés

- `src/lib/data.ts` : `getRefs` ne change pas (affichage, libellés de la fiche et de la liste) ; nouveau `getFormRefs(today)` = `getRefs` avec `events = openEvents(...)`, sans `OTHER_EVENT`.
- Le formulaire (`src/lib/diagnostic.ts` `submitScreen`, `wizardState`, `src/app/(public)/(app)/interet/page.tsx`) et la validation de `P2` utilisent `getFormRefs`. Une liste vide donne l'écran « candidatures closes ».
- Textes : la FAQ publique (`src/lib/i18n.ts`) ne promet plus « un autre événement » saisi librement.
- **Fixtures** : `scripts/smoke.mjs` et les tests de base de données créent leurs événements avec des dates relatives à l'exécution (aujourd'hui + 30 jours) ; les événements de `scripts/db.mjs` restent tels quels.
- Tests : validation de `P2` (ouvert, sans date, passé, antérieur à la répétition, `autre`), liste vide, fiche coach qui affiche toujours le nom de l'événement d'un dossier existant.

### A3. Clôture

- Migration `supabase/migrations/0016_calendar.sql` : `candidates.admitted_late_at timestamp` et la table `reminders_sent (candidate_id, key, sent_at)` (clé primaire `(candidate_id, key)`, cascade, sécurité par ligne).
- `submitScreen` : après le contrôle « déjà terminé », si la clôture est passée et que le dossier n'est pas admis, `{ ok: false, errors: {}, fatal: 'closed' }` (nouveau dossier et dossier non terminé).
- Routes et pages : `src/app/api/diag/save/route.ts` (`closed` → 403 avec la date), `interet/page.tsx`, reprise par lien et par code, `src/components/Wizard.tsx` (écran « candidatures closes »), page d'accueil (bandeau « ouvertes jusqu'au … » puis bouton remplacé).
- `src/lib/reminders.ts` : les relances d'un formulaire abandonné ignorent les dossiers non admis après la clôture.
- Fiche coach : `admitLateAction` et bouton, pour un dossier non terminé.
- i18n : textes FR et EN (clôture, bandeau, page close).
- Tests : `submitScreen` refusé avant et après la clôture, admis, aux limites de l'heure.

### A4. Finalisation fiable

- `src/lib/diagnostic.ts` : extraire la finalisation de `completeDiagnostic` pour l'exécuter dans la transaction de `submitScreen` quand `nextId === 'done'` (date de fin, statut « Intérêt reçu », ligne du sujet) ; `deferMail(notifyCompletion)` après la validation de la transaction.
- Rattrapage à la lecture : `healStuck(candidate)` appelé au début de `wizardState` et des routes de reprise, avant de calculer la réponse, puis relecture ; la clôture ne s'y applique pas.
- Action `recoverStuckAction` et bouton « Finaliser les dossiers bloqués (N) » dans les Paramètres, avec la liste avant et le compte rendu après. README : la requête de liste des dossiers sur « Autre » ou sur un événement sans date.
- Tests : reproduction du défaut avec un déclencheur qui fait échouer la finalisation (le marqueur ne passe pas à « terminé »), rattrapage à la lecture (la première réponse montre la confirmation), action de rattrapage.

### A5. Journal et premières relances

- `src/lib/calendar-reminders.ts` : `runCalendarReminders(now, { dry })` : sélection des relances dues, choix du dossier par boîte avant de revendiquer, insertion `ON CONFLICT DO NOTHING`, envoi, suppression de la ligne si l'envoi échoue, regroupement en un email par candidate et par jour, plafond de 300.
- Relances de cette livraison : clôture du formulaire (J-3, J-1), échanges (J-7, J-3, J-1 de la date interne), soumission (J-7, J-3, J-1, jour même, date visée dans la clé).
- `src/app/api/cron/reminders/route.ts` : appelle la passe avant `runReminders`, accepte `?dry=1`, rapport étendu ; `runReminders` saute les candidates déjà écrites ce jour-là.
- Mails FR/EN dans `src/lib/mail.ts`, libellés dans la page Emails.
- Tests : une relance n'est envoyée qu'une fois, deux passages simultanés, rattrapage après un jour manqué, fenêtre dépassée, échec d'envoi qui libère la ligne, changement de date qui réarme, deux dossiers sur la même boîte, exclusions (sans email, non retenue, parcours rouvert), vocabulaire (`tests/mail-proposals.test.ts` et `tests/ai-topics.test.ts` étendus à tous les groupes de textes).

### A6. Vérification et relecture

`npm test`, `npm run test:db`, `tsc`, Chromium (formulaire ouvert, fermé, admis, liste des événements, bandeau, rattrapage, mobile), cron appelé à la main avec `?dry=1`. Relecture indépendante (formulaire et clôture ; finalisation ; relances ; textes et accessibilité).

## Livraison B : le plan de préparation (candidate)

- Migration `0017_prep.sql` : `prep_tasks (candidate_id, key, ready_at, done_at, done_by, skipped_at, due_override, note, updated_at)`, clé `(candidate_id, key)`, cascade, sécurité par ligne.
- `src/lib/prep.ts` (pur) : dix tâches FR/EN, `submittedOn(candidate, history)` (les quatre chemins), `planVisible`, `prepSchedule`, `prepProgress` ; tests `tests/prep.test.ts` (confortable, normale, serrée, très serrée, sans répétition, sans événement, `R ≤ S`, répétition après l'événement, décalage coach, tri, logistique avant « Retenue »).
- Accès base (`src/lib/prep-store.ts`) : lecture des états en une requête, `markReady`, `tickTask`, `noteTask`, `skipTask`, `setDue` ; tests DB (idempotence, réversibilité, notes, cascade, tâches réservées à la coach).
- `src/app/api/espace/prep/route.ts` : session, plan visible, clé proposée, gestes autorisés, note limitée.
- `src/lib/roadmap.ts` `buildRoadmap` reçoit `submitted` ; `plan/page.tsx` ne cache plus le texte de préparation ; `JourneyPanel.tsx` : section « Ta préparation » ; `tests/logic.test.ts` adapté.
- Mail de confirmation à la candidate dans `confirmSubmission`, avec les tests de vocabulaire.
- Chromium : cocher, noter, « prête », retard, mobile, parcours rouvert, « non retenue », soumise par le statut.

## Livraison C : l'espace coach

- Onglet `prep` sur la fiche (liste blanche dans `actions.ts` et `TABS`) : cocher pour elle, valider les tâches « prête », passer, décaler, note.
- `advanceOnPath` (rangs de `STATUS_PATH`, refus de « Non retenue ») dans une transaction avec la validation de `slides_review` et `rehearsal_day` ; tests : depuis « Candidature soumise » et « Non retenue » le statut ne bouge pas, depuis « Retenue » il avance.
- Bouton « Relancer sur WhatsApp » avec message prérempli.
- `candidateRows` : avancement et retard (une requête sur `prep_tasks`, échéances calculées en mémoire) ; colonne et pastille dans la liste ; section « Préparation en retard » du tableau de bord.
- Tests DB et Chromium.

## Livraison D : relances de préparation, répétition, événement

- `runCalendarReminders` : points d'étape selon l'urgence, tâches à faire demain ou en retard, répétition (J-7, J-3, J-1, jour même), événement (J-7, J-2, statut « Retenue » ou au-delà), résumé aux coachs (verrou `coach_digest_last`).
- Mails FR/EN, aperçu du jour dans les Paramètres.
- Tests : urgence et rythme, regroupement, exclusions, résumé une fois par jour, logistique réservée aux retenues.
- Mise en production : aperçu, appel manuel du cron sur la préproduction (`?dry=1` puis réel, sans envoi), lecture du journal des emails, puis activation de `calendar_reminders_enabled` en production.

## Livraison E : la suite de la décision

- Messages après « Retenue » et « Non retenue » ; copie des réponses, du sujet et de la photo validée vers un nouveau dossier à la réouverture des candidatures (`journeysOf`, `startNew`, copie de l'objet de stockage).
- Tests DB de la copie ; Chromium.

## Ordre et dépendances

A avant tout : la clôture et la finalisation sont urgentes (la date limite actuelle est le
26 octobre). B demande les dates de A. C et D demandent B. E demande A et B. Les textes des
tâches et des relances sont relus par l'équipe avant D.
