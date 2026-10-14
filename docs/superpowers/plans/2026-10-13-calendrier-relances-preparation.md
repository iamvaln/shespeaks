# Plan d'implémentation : calendrier commun, admission, relances et plan de préparation

Spécification : `docs/superpowers/specs/2026-10-13-calendrier-relances-preparation-design.md`.
Cinq livraisons, une PR chacune, dans l'ordre. Chaque PR : tests unitaires et base de
données, vérification dans Chromium (ordinateur et 390 px), relecture indépendante, puis
description de la PR avec le verdict. Aucune fusion sans l'accord explicite de la
propriétaire. Les migrations ne font qu'ajouter, une par livraison qui en a besoin :
`0016` (A), `0017` (B, qui inscrit aussi `prep_live_on`). Les livraisons C, D et E n'en ajoutent pas. Les numéros A1 à A6 de ce plan sont propres au plan (la spécification nomme ses sections).

Conventions du dépôt à respecter : logique pure dans `src/lib/*.ts` (imports relatifs avec
`.ts`, pas de syntaxe TypeScript sans équivalent JavaScript, pour que Node la charge dans
les tests), actions serveur qui répondent `{ ok, msg }`, jours en texte `AAAA-MM-JJ`
(`src/lib/dates.ts`), textes candidates FR et EN (`src/lib/i18n.ts` : `en` est typé sur `fr`),
espace coach en français, jamais de mention de l'IA côté candidate, commentaires en anglais.

## Livraison A : le formulaire et les premières relances

### A1. Calendrier et réglages (pur)

- `src/lib/dates.ts` : `dayOf(ts)` (horodatage UTC → jour de Douala), gardes sur les dates illisibles.
- `src/lib/calendar.ts` (nouveau, pur) :
  - `admissionOpen({ today, interestDeadline, admittedLate })` : ouvert toute la journée de la date limite (jour de Douala), fermé le lendemain ; `isoOrNull`, `addDays` (dans `dates.ts`) et `rehearsalFor`.
  - `openEvents(events, today, rehearsalDate)` : événements à `event_date` valide, non passée, postérieure à `rehearsalDate` quand il est réglé.
  - `calendarWarnings({ interestDeadline, internalDeadline, rehearsalDate, events })` : les avertissements de la spécification (la liste complète des événements, pas seulement les ouverts).
  - `reminderDue({ today, target, tier })` : la fenêtre (le jour du déclencheur et le lendemain, jamais après la cible) ; `urgency(days)` et son rythme.
- `src/lib/db.ts` : `SETTING_DEFAULTS` reçoit `interest_deadline: ''`, `rehearsal_date: ''`, `rehearsal_info: ''`, `calendar_reminders_enabled: 'false'`, `coach_digest_last: ''`.
- `saveSettingsAction` (`src/app/admin/actions.ts`) et `src/app/admin/(panel)/settings/page.tsx` : champs, validation des dates, avertissements, aperçu des relances du jour (branché en A5).
- Tests : `tests/calendar.test.ts` (la veille, le jour même et le lendemain de la date limite, fuseau, dates absentes ou illisibles, événements ouverts, avertissements, fenêtres).

### A2. Événements proposés

- `src/lib/data.ts` : `getRefs` ne change pas (affichage, libellés de la fiche et de la liste) ; nouveau `getFormRefs(today)` = `getRefs` avec `events = openEvents(...)`, sans `OTHER_EVENT`.
- Le formulaire (`src/lib/diagnostic.ts` `submitScreen`, `wizardState`, `src/app/(public)/(app)/interet/page.tsx`) et la validation de `P2` utilisent `getFormRefs`. Une liste vide donne l'écran « candidatures closes ».
- Textes : la FAQ publique (`src/lib/i18n.ts`) ne promet plus « un autre événement » saisi librement.
- **Fixtures** : le test `tests/db/proposals.test.mjs` (« the first screen does not start a second journey… », qui passait par « Autre ») crée son événement avec une date relative à l'exécution ; `scripts/smoke.mjs` ne parle qu'en HTTP et ne peut pas créer d'événement : la CI repousse la date de Douala (étape `psql` de l'image `postgres:16`) avant chaque test de fumée, dans les deux tâches ; les événements de `scripts/db.mjs` restent tels quels (Bamenda n'a pas de date).
- Tests : validation de `P2` (ouvert, sans date, passé, antérieur à la répétition, `autre`), liste vide, fiche coach qui affiche toujours le nom de l'événement d'un dossier existant.

### A3. Clôture

- Migration `supabase/migrations/0016_calendar.sql` : `candidates.admitted_late_at timestamp` et la table `calendar_reminders (candidate_id, key, sent_at)` (clé primaire `(candidate_id, key)`, cascade, sécurité par ligne).
- `submitScreen` : après le contrôle « déjà terminé », si la clôture est passée et que le dossier n'est pas admis, `{ ok: false, errors: {}, fatal: 'closed' }` (nouveau dossier et dossier non terminé).
- Routes et pages : `src/app/api/diag/save/route.ts` (`closed` → 403 avec la date), `interet/page.tsx`, reprise par lien et par code, `src/components/Wizard.tsx` (écran « candidatures closes »), page d'accueil (bandeau « ouvertes jusqu'au … » puis bouton remplacé).
- `src/lib/reminders.ts` : les relances d'un formulaire abandonné ignorent les dossiers non admis après la clôture.
- Fiche coach : `admitLateAction` et bouton, pour un dossier non terminé.
- i18n : textes FR et EN (clôture, bandeau, page close).
- Tests : `submitScreen` refusé avant et après la clôture, admis, aux limites de l'heure.

### A4. Finalisation fiable

- `src/lib/diagnostic.ts` : extraire la finalisation de `completeDiagnostic` pour l'exécuter dans la transaction de `submitScreen` quand `nextId === 'done'` (date de fin, statut « Intérêt reçu », ligne du sujet) ; `deferMail(notifyCompletion)` après la validation de la transaction.
- Rattrapage à la lecture : `healStuck(candidate)` (la date de fin reprend `last_activity_at`) ; ordre dans `src/app/(public)/(app)/interet/page.tsx` : `healStuck`, relecture du dossier, redirection vers `/plan` s'il est terminé, **puis** la clôture, puis `wizardState` ; mêmes appels dans `src/app/reprendre/[token]/route.ts` et `src/app/api/acces/code/route.ts` avant de choisir la destination (la clôture ne s'y applique pas).
- Action `recoverStuckAction` et bouton « Finaliser les dossiers bloqués (N) » dans les Paramètres, avec la liste avant et le compte rendu après. README : la requête de liste des dossiers sur « Autre » ou sur un événement sans date.
- Tests : reproduction du défaut avec un déclencheur qui fait échouer la finalisation (le marqueur ne passe pas à « terminé »), rattrapage à la lecture (la page redirige vers l'espace, la route de reprise aussi), date de fin d'un dossier rattrapé, rattrapage après la clôture, action de rattrapage.

### A5. Journal et premières relances

- `src/lib/calendar-reminders.ts` : `runCalendarReminders(now, { dry })` : sélection des relances dues, choix du dossier par boîte avant de revendiquer, insertion `ON CONFLICT DO NOTHING`, envoi, suppression de la ligne si l'envoi échoue, regroupement en un email par candidate et par jour, plafond de 300.
- Relances de cette livraison : clôture du formulaire (J-3, J-1), échanges (J-7, J-3, J-1 de la date interne), soumission (J-7, J-3, J-1, jour même, date visée dans la clé).
- `src/app/api/cron/reminders/route.ts` : appelle la passe avant `runReminders`, rapport étendu ; `?dry=1` **saute `runReminders`** (elle n'a pas de mode sans envoi) et ne rend que l'aperçu du calendrier. `runReminders` et `remindPendingProposals` consultent `calendar_reminders` (jour de Douala de `sent_at`) **avant** de revendiquer, pour sauter les candidates déjà écrites ce jour-là sans brûler leur palier.
- Mails FR/EN dans `src/lib/mail.ts`, libellés dans la page Emails.
- Tests : une relance n'est envoyée qu'une fois, deux passages simultanés, rattrapage après un jour manqué, fenêtre dépassée, échec d'envoi qui libère la ligne, changement de date qui réarme, deux dossiers sur la même boîte, exclusions (sans email, non retenue ; un parcours rouvert garde ses relances d'échanges), un seul email par jour y compris avec le rappel de 48 h, paliers d'une même cible dus le même jour (seul le plus proche part), `?dry=1` n'envoie rien (ni la passe du calendrier ni `runReminders`), vocabulaire (`tests/mail-proposals.test.ts` et `tests/ai-topics.test.ts` étendus à tous les groupes de textes).

### A6. Vérification et relecture

`npm test`, `npm run test:db`, `tsc`, Chromium (formulaire ouvert, fermé, admis, liste des événements, bandeau, rattrapage, mobile), cron appelé à la main avec `?dry=1`. Relecture indépendante (formulaire et clôture ; finalisation ; relances ; textes et accessibilité). **Activation** (dans cette livraison, pour que les relances du 26 octobre puissent partir) : l'équipe relit les textes de la PR avant la fusion ; après le déploiement : en préproduction, régler les dates, **allumer `calendar_reminders_enabled`** et préparer un dossier de test dû, appel manuel du cron (`?dry=1` : aperçu, puis réel : emails seulement consignés), lecture de la page Emails (`calendar_closing`, `calendar_exchange`, `calendar_submit`) ; puis, en production, aperçu du jour dans les Paramètres et activation de `calendar_reminders_enabled`.

## Livraison B : le plan de préparation (candidate)

- Migration `0017_prep.sql` : `prep_tasks (candidate_id, key, ready_at, done_at, done_by, skipped_at, due_override, note, updated_at)`, clé `(candidate_id, key)`, cascade, sécurité par ligne ; elle inscrit aussi le réglage `prep_live_on` (jour du déploiement, `ON CONFLICT DO NOTHING`) : pour les dossiers déjà soumis, `S = max(S, prep_live_on)`.
- `src/lib/prep.ts` (pur) : dix tâches FR/EN, `submittedOn(candidate, history)` (les quatre conditions), `planVisible`, `prepSchedule` (avec les états des tâches : tâches proposées, état, retard, avancement « 3 sur 7 ») ; tests `tests/prep.test.ts` (confortable, normale, serrée, très serrée, sans répétition, sans événement, `R ≤ S`, répétition après l'événement, décalage coach, tri, logistique avant « Retenue »).
- Accès base (`src/lib/prep-store.ts`) : lecture des états en une requête, `markReady`, `tickTask`, `noteTask`, `skipTask`, `setDue` ; tests DB (idempotence, réversibilité, notes, cascade, tâches réservées à la coach).
- `src/app/api/espace/prep/route.ts` : session, plan visible, clé proposée, gestes autorisés, note limitée.
- `src/lib/roadmap.ts` `buildRoadmap` et `nextActionKey` reçoivent `submitted` pour tous les parcours (et l'appel de la fiche coach, `candidates/[id]/page.tsx`) ; `plan/page.tsx` ne cache plus le texte de préparation ; `JourneyPanel.tsx` : section « Ta préparation » ; `src/lib/i18n.ts` (groupe FR et EN typé) ; `tests/logic.test.ts` adapté.
- Mail de confirmation à la candidate dans `confirmSubmission` (constructeur dans `mail.ts`, nouveau cas dans `proposals-mailer.ts`), message d'encouragement après « Non retenue », avec les tests de vocabulaire (textes de `prep.ts`, groupe « Ta préparation », mails).
- Chromium : cocher, noter, « prête », retard, mobile, parcours rouvert, « non retenue », soumise par le statut.

## Livraison C : l'espace coach

- Onglet `prep` sur la fiche (liste blanche dans `actions.ts` et `TABS`) : cocher pour elle, valider les tâches « prête », passer, décaler, note.
- `advanceOnPath` (rangs de `STATUS_PATH`, refus de « Non retenue ») dans une transaction avec la validation de `slides_review` et `rehearsal_day` ; tests : depuis « Candidature soumise » et « Non retenue » le statut ne bouge pas, depuis « Retenue » il avance.
- Bouton « Relancer sur WhatsApp » avec message prérempli.
- `candidateRows` : avancement et retard (une requête sur `prep_tasks` et une sur la première date de `status_history` vers un statut du chemin, échéances calculées en mémoire) ; colonne et pastille dans la liste ; section « Préparation en retard » du tableau de bord.
- Tests DB et Chromium.

## Livraison D : relances de préparation, répétition, événement

- `runCalendarReminders` : points d'étape selon l'urgence (premier à `S + rythme`, puis dernier point + rythme), tâches à faire demain ou en retard (`late` : cible propre `T + 1`), répétition (J-7, J-3, J-1, jour même), événement (J-7, J-2, statut « Retenue » ou au-delà), « plan prêt » (`plan_open:<S>`) pour les candidates soumises hors confirmation, résumé aux coachs (upsert verrou `coach_digest_last`, y compris « prête » sans validation depuis 2 jours).
- Mails FR/EN (et leurs entrées dans `i18n.ts` et les tests de vocabulaire), aperçu du jour dans les Paramètres.
- Tests : urgence et rythme, premier point et activation (un seul point), `late`, regroupement, exclusions, résumé une fois par jour (upsert, deux appels simultanés), logistique réservée aux retenues.
- Mise en production : la procédure d'activation est celle de la livraison A ; ici, texte relu par l'équipe avant la fusion et aperçu du jour avant d'activer les nouvelles relances.

## Livraison E : la suite de la décision

- Message après « Retenue » (« Non retenue » est traité en B) ; copie des réponses, du sujet et de la photo validée vers un nouveau dossier à la réouverture des candidatures (`journeysOf`, `startNew`, copie de l'objet de stockage).
- Tests DB de la copie ; Chromium.

## Ordre et dépendances

A avant tout : la clôture et la finalisation sont urgentes (la date limite actuelle est le
26 octobre). B demande les dates de A. C et D demandent B. E demande A et B. Les textes des
tâches et des relances sont relus par l'équipe avant D.
