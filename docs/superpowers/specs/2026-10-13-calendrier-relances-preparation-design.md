# Calendrier commun, admission, relances et plan de préparation

Date : 2026-10-13 · Statut : conception relue deux fois par des lecteurs indépendants
(82 remarques confirmées et intégrées, puis une seconde passe sur les corrections),
implémentation en cinq livraisons (A à E)

## Pourquoi

Le temps entre la validation d'une candidature et le jour de l'événement est court
(3 à 4 semaines entre la clôture de l'appel et l'événement pour Yaoundé et Douala).
Aujourd'hui :

- le suivi s'arrête à « candidature soumise » : la candidate lit une phrase de
  félicitations, rien ne lui dit quoi faire ensuite ;
- la préparation existe seulement comme texte générique (le « plan de route »), sans
  dates, sans cases à cocher, sans suivi ;
- les relances automatiques portent sur un formulaire abandonné ou une proposition
  sans réponse, jamais sur une échéance ;
- on accepte des candidatures pour « Autre » ou pour un événement sans date, et sans
  limite de temps : on ne peut pas garantir assez de temps de préparation ;
- une candidate peut rester bloquée à la fin du formulaire sans que personne le voie
  (voir « Finalisation fiable »).

Le but : un **calendrier commun** à toutes les candidates (une date limite des intérêts,
un jour de répétition), des **règles d'admission** claires, un **plan de préparation**
daté qui démarre dès la soumission, sans attendre la décision de l'événement, et des
**relances à chaque étape**, dont le rythme dépend de l'urgence.

Si la candidate n'est pas retenue, ce n'est pas grave : elle a travaillé son sujet et
pourra candidater à un prochain événement.

## Décisions

| Sujet | Décision |
|---|---|
| Date limite des intérêts | Une date commune (réglage `interest_deadline`), valable toute la journée du jour dit (jusqu'à minuit, heure de Douala). Le lendemain, plus aucune candidature n'est acceptée : ni nouveau dossier, ni envoi d'un dossier commencé. Vide = pas de clôture. |
| Jour de répétition | Une date commune (réglage `rehearsal_date`), une seule pour toutes. Un champ libre `rehearsal_info` (lieu, lien, horaire) s'affiche aux candidates et dans les mails. |
| Temps de préparation | 14 jours au moins entre le dernier jour pour envoyer son intérêt et la répétition, **et** entre la date interne de soumission et la répétition. Les Paramètres affichent un avertissement (non bloquant) si un de ces écarts est plus court. |
| Date interne | `internal_deadline` (existante) : dernier jour pour soumettre à l'appel à speakers, avec la marge de relecture de l'équipe. Elle reste séparée de la date limite des intérêts, qui la précède d'au moins un jour (un avertissement le signale sinon : un intérêt envoyé le dernier jour n'aurait aucun temps d'échanges). |
| Événements proposés | Seulement ceux qui ont une date d'événement valide, non passée, et postérieure au jour de répétition quand il est réglé. « Autre » disparaît de la liste. Un dossier existant garde sa valeur. |
| Dossiers commencés à la clôture | Pas d'exception automatique. La coach peut, depuis la fiche, **admettre un dossier malgré la clôture**. |
| Plan de préparation | Démarre quand la candidate **a soumis**, quelle que soit la façon (voir « Jour de soumission »). Il ne dépend pas de la décision de l'événement ; seule la logistique de voyage attend d'être retenue. |
| Échéances | Calculées à la lecture à partir des dates communes et de la date de son événement, jamais figées en base : un changement de date se répercute partout. |
| État de chaque tâche | Seulement ce qui s'est passé : prête, faite, passée, échéance décalée par la coach, une note. Rien n'est créé tant que personne n'a rien fait. |
| Tâches validées par la coach | « Relecture des slides » et « Répétition générale » : la candidate indique qu'elle est prête, la coach valide. La candidate ne peut pas les cocher comme faites. |
| Relances | Un journal `calendar_reminders` rend chaque relance unique. Chaque clé contient la date visée, donc un changement de date réarme les relances. Une relance est « due » le jour de son déclencheur et le lendemain (pas le lendemain pour le jour même, et jamais après la date visée ; voir « Règles des relances »). |
| Rythme | Il dépend du nombre de jours entre l'envoi de son intérêt et la répétition (« urgence »). L'urgence règle les points d'étape de la préparation (livraison D) ; les paliers fixes de la livraison A (clôture, échanges, soumission) n'en dépendent pas. |
| Non retenue | Le plan reste visible et un message encourage ; les relances par email s'arrêtent. Le statut n'est jamais posé par l'app : « Retenue » et « Non retenue » sont des décisions de la coach. |
| IA | Jamais mentionnée côté candidate. Les nouveaux textes et mails entrent dans les tests qui le vérifient. |
| Langues | Textes candidates en français et en anglais ; l'espace coach reste en français. |

## Définitions

Toutes les dates sont des jours (texte `AAAA-MM-JJ`) lus dans le fuseau d'Africa/Douala
(UTC+1, sans heure d'été) avec `src/lib/dates.ts`. Un horodatage de la base (UTC) est
converti en jour de Douala (`dayOf(ts)`).

- **Jour de l'intérêt** (`interestOn`) : `dayOf(completed_at)`. Pour un dossier rattrapé
  (voir « Finalisation fiable »), `completed_at` reprend le moment où elle a envoyé la
  dernière page (`last_activity_at`), pas le jour du rattrapage.
- **Jour de soumission** (`submittedOn`) : quatre conditions (celles de `countsAsSubmitted`),
  trois jours de référence. (1) `dayOf(submitted_at)` si elle a confirmé ; (2) sinon le
  jour de la première entrée de `status_history` vers un statut au moins « Candidature
  soumise » sur le chemin des statuts (`STATUS_PATH`, sans « Non retenue ») ; (3) et (4)
  sinon `interestOn` quand le sujet dit qu'elle avait déjà soumis (`application_state`
  « soumise », ou « retenue »). Vide si aucune condition ne tient.
- **Plan visible** : `submittedOn` existe et le parcours n'est pas rouvert sans
  nouvelle confirmation. « Non retenue » ne masque pas le plan.
- **Tâche de logistique** : `logistics` n'est proposée que lorsque le statut est au moins
  « Retenue » (sur `STATUS_PATH`, hors « Non retenue »). Avant, elle n'existe pas dans la liste.
- **Urgence** : nombre de jours entre `interestOn` et le jour de répétition `R`. Sans
  `rehearsal_date`, `R` = date de son événement − 10 jours ; sans date d'événement valide,
  l'urgence est « normale ».

| Jours | Urgence | Point d'étape |
|---|---|---|
| 28 et plus | confortable | tous les 7 jours |
| 21 à 27 | normale | tous les 4 jours |
| 14 à 20 | serrée | tous les 2 jours |
| moins de 14 | très serrée | tous les jours |

## Le calendrier

```
   intérêt      date limite      soumission à      répétition       événement
   envoyé       des intérêts     l'appel (interne)                  (par événement)
  ────┬────────────┬──────────────────┬───────────────┬───────────────┬──────►
      └─ cadence des relances (urgence) ─────────────────┘
                   └──── ≥ 14 jours ───────────────────┘
                                       └── ≥ 14 jours ┘
      jour de soumission ─ plan de préparation ────────┴───────────────┘
```

Réglages communs (Paramètres) : `interest_deadline`, `internal_deadline` (existant),
`rehearsal_date`. Par événement, déjà dans le calendrier : `cfp_close_date`, `event_date`.

Avertissements de cohérence dans les Paramètres, jamais bloquants : (1) `interest_deadline`
au plus tard la veille de `internal_deadline` ; (2) `rehearsal_date` au moins 14 jours après
`interest_deadline` **et** après `internal_deadline` ; (3) `rehearsal_date` avant la date de
tous les événements (on passe la liste complète des événements datés) : ceux qui sont avant
sont retirés de la liste du formulaire, avec la mention, et ceux qui ont moins de 7 jours
d'écart avec la répétition sont signalés (les dernières tâches se tassent) ; (4) dates
illisibles.

## Livraison A : le formulaire et les premières relances

### Finalisation fiable (plan A4)

Un défaut reproduit sur une base de test : quand la candidate envoie la dernière page,
le marqueur de reprise passe à « terminé » dans une première transaction, puis la
finalisation (`completeDiagnostic` : date de fin, statut « Intérêt reçu », ligne du sujet,
notification des coachs) tourne dans une seconde. Si elle échoue (délai de la base,
connexion perdue), la candidate reste « En cours », sans date de fin, avec le marqueur
« terminé » : le formulaire repart à l'écran 1, l'admin affiche « écran 1 sur 6 », aucun
coach n'est prévenu, et les relances continuent de lui écrire.

Corrections :

1. La finalisation entre dans la transaction qui enregistre la dernière page : le
   marqueur « terminé » et la date de fin vont ensemble ou pas du tout. Les mails
   (confirmation à la candidate, notification aux coachs) partent après la validation.
2. **Rattrapage à la lecture** : un dossier au marqueur « terminé » sans date de fin est
   finalisé avant de répondre, puis relu. Ordre de la page du formulaire : rattrapage,
   relecture du dossier, redirection vers l'espace s'il est terminé, **puis** la clôture,
   puis le formulaire ; les routes de reprise par lien et par code rattrapent avant de
   choisir la destination. La candidate voit tout de suite la page de confirmation, pas
   l'écran 1. La clôture ne s'applique pas à ce rattrapage : elle avait envoyé à temps, et
   la date de fin reprend le moment de son dernier envoi.
3. **Rattrapage des dossiers déjà bloqués** : une action de l'espace coach « Finaliser les
   dossiers bloqués (N) » dans les Paramètres, qui fait la même chose pour tous (elle tourne
   dans l'application, avec son code et ses mails ; aucun script séparé). Elle affiche la
   liste avant et un compte rendu après. Le README donne en plus la requête de liste des
   dossiers sur « Autre » ou sur un événement sans date, à traiter à la main.

### Admission (plan A2 et A3)

- **Événements proposés** : `getRefs` garde tous les événements (affichage, libellés de la
  fiche et de la liste). Une nouvelle fonction `getFormRefs(today)` ne renvoie que ceux qui
  sont **ouverts** (date d'événement valide, non passée, postérieure à `rehearsal_date`
  quand il est réglé), sans « Autre », et c'est elle qu'utilisent le formulaire et sa
  validation. Si aucun événement n'est ouvert, le formulaire affiche « candidatures closes ».
  Un dossier qui existe garde l'événement qu'elle a choisi, même s'il n'est plus proposé
  ou si c'est « Autre » : elle peut réenregistrer son profil sans en changer, mais pas passer
  à un autre événement fermé. Quand le dernier événement daté passe, le formulaire se ferme seul : c'est voulu.
- **Clôture** : le lendemain de `interest_deadline` (jour de Douala), `submitScreen` refuse un
  nouveau dossier et l'envoi de tout dossier non terminé, avec l'erreur `closed`, sauf si
  la coach l'a admis. Le formulaire, la reprise par lien ou par code, et la page d'accueil
  affichent « Les candidatures sont closes » avec la date.
- **Admettre malgré la clôture** : bouton sur la fiche d'un dossier non terminé, qui
  renseigne `candidates.admitted_late_at`. Le dossier peut alors être terminé.
- **Annonce** : un bandeau « Candidatures ouvertes jusqu'au … » sur la page d'accueil (tant que
  la date n'est pas passée) ; la page du formulaire fermé porte son propre titre ; la FAQ publique est mise à jour (elle promet aujourd'hui n'importe
  quel événement saisi dans le formulaire).
- **Relances d'un formulaire abandonné** : elles s'arrêtent après la clôture, sauf pour les
  dossiers admis.

### Réglages (plan A1 et A5)

Page Paramètres : `interest_deadline`, `rehearsal_date`, `rehearsal_info`,
`calendar_reminders_enabled` (défaut « non »), avec les avertissements de cohérence et un
**aperçu des relances du jour** (ce que la passe du calendrier enverrait, sans rien envoyer).
Aucune migration pour les réglages (créés à l'enregistrement ; le seul réglage écrit par
l'application, `coach_digest_last`, l'est par un upsert).

### Journal des relances et premières relances (plan A5)

Migration `0016_calendar.sql` (additive) : `candidates.admitted_late_at` et la table
`calendar_reminders` (voir « Règles des relances »). Relances de cette livraison :

- **Clôture du formulaire** : un formulaire non terminé, avec adresse, à J-3 et J-1 de
  `interest_deadline` (« Il te reste N jours pour envoyer ton intérêt », N calculé à
  partir du jour d'envoi, pas du palier).
- **Échanges** : pour une candidate dont c'est le tour à une étape (choix, sujet, photo),
  « Fais-nous ta réponse avant le … » à J-7, J-3 et J-1 de `internal_deadline` ; le rappel
  actuel à 48 h reste.
- **Soumission** : à l'étape « soumission », à J-7, J-3, J-1 et le jour même de la
  première échéance à venir (aujourd'hui compris) parmi `internal_deadline` et la clôture
  de l'appel de son événement ; la date visée fait partie de la clé, donc la seconde
  échéance a ses propres relances (seuls les paliers dont la fenêtre n'est pas déjà passée
  partent : J-3, J-1 et le jour même quand les deux dates sont à moins de 7 jours).
- **Côté coach** : le résumé quotidien (voir D) n'est pas encore là ; en attendant, la
  fiche et la liste affichent déjà l'étape.

## Livraison B : le plan de préparation (candidate)

### B1. Tâches types

Une liste en code (`src/lib/prep.ts`, pure, textes FR/EN comme `roadmap.ts`), dans l'ordre
habituel des échéances. « Incontournable » : gardée quand le temps manque.

| # | Clé | Tâche | Échéance | Incontournable | Validée par |
|---|---|---|---|---|---|
| 1 | `outline` | Plan du talk en trois parties, à partir du résumé approuvé | soumission + 3 j | oui | elle |
| 2 | `material` | Réunir exemples, chiffres, démos | soumission + 7 j | oui | elle |
| 3 | `timing` | Répartir le temps section par section (selon le format) | soumission + 7 j | non | elle |
| 4 | `slides_draft` | Première version des slides | répétition − 5 j | oui | elle |
| 5 | `rehearsal_solo` | Une répétition seule, chronométrée | répétition − 3 j | non | elle |
| 6 | `slides_review` | Relecture des slides avec la coach | répétition − 2 j | oui | la coach |
| 7 | `rehearsal_day` | Répétition générale | répétition | oui | la coach |
| 8 | `slides_final` | Version finale des slides | événement − 7 j | oui | elle |
| 9 | `qa` | Préparer les réponses aux questions probables | répétition + 2 j | non | elle |
| 10 | `logistics` | Équipement, transport, horaire d'arrivée, slides en local et sur clé | événement − 2 j | oui | elle (proposée à partir de « Retenue ») |

Dix tâches, sept incontournables. Le détail de chaque tâche reprend le texte du plan de
route actuel (`roadmap.ts`), précisé selon le format du talk (talk, lightning, atelier) et
les réponses déjà recueillies (première fois sur scène, trac, anglais). Aucun mot sur l'IA.

### B2. Calcul des échéances

Fonction pure `prepSchedule({ today, interestOn, submittedOn, rehearsal, eventDay, format,
status, states })` (`states` : par clé, `ready_at`, `done_at`, `skipped_at`, `due_override`),
qui renvoie la liste ordonnée des tâches proposées, leurs échéances finales, leur état
(à faire, en retard, en attente de la coach, faite, passée) et l'urgence. **Avancement** :
tâches faites ou passées parmi les tâches proposées, sur le nombre de tâches proposées
(« 3 sur 7 ») ; `ready_at` ne compte pas ; les lignes des tâches non proposées sont ignorées.

1. `S` = jour de soumission, `R` = `rehearsal_date` quand elle est réglée et valide, sinon
   absente (« événement − 10 j » ne sert qu'à calculer l'urgence), `E` = jour de son
   événement.
2. **Fenêtre** `W` = nombre de jours entre `S` et `R`. Coefficient `k = min(1, W / 21)`.
   Si `W < 21` (toute fenêtre de 14 à 20 jours que la règle d'admission accepte donne ce
   plan réduit), seules les tâches incontournables sont proposées : le jeu de tâches dépend
   de `W`, pas de l'urgence.
3. Échéance brute : `S + ⌈décalage × k⌉` pour les tâches relatives à la soumission,
   `R + décalage` pour celles de la répétition, `E + décalage` pour celles de
   l'événement ; jamais avant `S + 1`, jamais après `E`.
4. Une échéance décalée par la coach (`due_override`) l'emporte ; **ensuite** la liste est
   triée par échéance finale puis par numéro du tableau (les tâches sans échéance en
   dernier, dans l'ordre du tableau). Aucune échéance n'est repoussée d'une ancre à l'autre.
5. **Cas dégradés** (le plancher `S + 1` passe avant le plafond `E` : le plafond l'emporte
   quand `E ≤ S + 1`, toutes les tâches tombent alors sur `E` et les coachs sont prévenus) :
   - sans `R`, les tâches 5, 7 et 9 ne sont pas proposées, `slides_draft` et
     `slides_review` s'ancrent sur `E − 10` et `E − 8`, et sans `E` ces deux tâches
     n'ont pas d'échéance ;
   - sans `E`, les tâches 8 et 10 n'ont pas d'échéance ;
   - `R ≤ S` ou `R` déjà passée (`R` < aujourd'hui) : les tâches 5 et 7 sont « passées »,
     signalées aux coachs ; `R ≥ E` (répétition le jour de l'événement ou après) : les
     tâches 5, 7 et 9 ne sont pas proposées, signalé aux coachs ; `qa` n'est proposée que si
     `E ≥ R + 3` ;
   - une échéance déjà passée à la lecture est « en retard » seulement si la tâche est
     proposée, sans `done_at` ni `skipped_at` et, pour les tâches validées par la coach,
     sans `ready_at` (elle est alors « en attente de la coach »).
6. **Dossiers déjà soumis au moment de la mise en ligne** : la migration de la livraison B
   inscrit `prep_live_on` (jour du déploiement) ; pour eux `S = max(S, prep_live_on)`,
   pour que rien ne soit « en retard » dès la première lecture.

Exemple (soumission le 20/10, répétition le 14/11, événement le 21/11) : plan en trois
parties le 23/10, exemples et temps le 27/10, première version des slides le 09/11,
répétition seule le 11/11, relecture le 12/11, répétition générale le 14/11, slides finales
le 14/11, questions probables le 16/11, logistique le 19/11.

### B3. Persistance

Table `prep_tasks (candidate_id, key, ready_at, done_at, done_by, skipped_at, due_override,
note, updated_at)`, clé primaire `(candidate_id, key)`, suppression en cascade, sécurité
par ligne activée. Une ligne n'existe que si quelqu'un a indiqué, coché, passé, décalé ou
noté.

Cocher est idempotent et réversible. `done_by` vaut `candidate` ou le nom de la coach. Pour
`slides_review` et `rehearsal_day`, la candidate renseigne seulement `ready_at` (« je suis
prête ») ; la coach renseigne `done_at`. Une note (500 caractères) accompagne chaque geste :
c'est le journal des actions.

### B4. Espace de la candidate

- La section « Ta préparation » remplace la phrase « Bravo, ta candidature est soumise »
  tant que le plan est visible : avancement (« 3 sur 7 »), tâches avec échéance (« dans
  4 jours », « en retard »), case à cocher, note facultative, détail de la répétition
  (`rehearsal_info`) et message de la coach quand une tâche attend sa validation.
- Écriture par `POST /api/espace/prep` (clé, geste, note). La route vérifie la session par
  le cookie, que le plan est visible, que la clé fait partie des tâches proposées à cette
  candidate (plan réduit, ignorées, logistique avant « Retenue »), et refuse à la candidate les
  gestes réservés à la coach. Les erreurs sont des codes traduits côté page.
- Un email « Ta candidature est soumise, voici ta préparation » à la candidate quand elle
  confirme (aujourd'hui seule la coach est prévenue). Pour les trois autres chemins vers
  « soumise » (statut posé par la coach, formulaire qui dit « déjà soumise »), le même
  message part une fois, à la première passe quotidienne qui suit (clé `plan_open:<S>`,
  écrite aussi à la confirmation pour ne pas doubler) ; sans relances du calendrier
  activées, ces candidates le découvrent dans leur espace.
- **Plan de route** : `buildRoadmap` et `nextActionKey` reçoivent l'information « soumise »
  (tous les parcours, pas seulement D) ; l'appel de la fiche coach (onglet « Plan de route »,
  « tel que la candidate le voit ») est mis à jour pareillement ; `plan/page.tsx` cesse de cacher le texte « démarre la préparation pendant que les
  organisateurs décident » ; l'étape 1 est cochée, les étapes 2 à 5 renvoient vers « Ta
  préparation ». Le test existant qui fige l'ancien comportement est adapté.
- Parcours rouvert sans nouvelle confirmation : section masquée, relances de préparation
  suspendues (les relances d'échanges et de soumission de la livraison A continuent : c'est
  exactement l'étape où elle en a besoin), coches conservées. Après « Non retenue » :
  message d'encouragement, plan lisible.

## Livraison C : l'espace coach

- Un onglet « Préparation » sur la fiche (identifiant ajouté à la liste blanche des
  onglets) : tâches, état, échéance, note ; cocher pour elle, valider les tâches
  « prête », passer, décaler.
- **Statut** : valider `slides_review` ou `rehearsal_day` fait avancer le statut vers
  « Slides validées » ou « Répétition faite » **seulement si** le statut est déjà
  « Retenue » ou plus loin sur `STATUS_PATH`, et n'est pas « Non retenue ». Sinon la
  validation est enregistrée et le statut n'est pas touché : « Retenue » et « Non retenue »
  restent la décision de la coach. Une fonction `advanceOnPath` (rangs de `STATUS_PATH`,
  refus de « Non retenue ») fait l'avance dans la même transaction que la validation ;
  l'`advance` actuel (rangs de `STATUSES`) reste réservé aux statuts que pilotent les
  échanges.
- Tant que cette livraison n'est pas là, les tâches « relecture des slides » et « répétition
  générale » restent à l'état « prête » (la candidate peut l'indiquer, personne ne peut valider) ;
  l'avancement plafonne.
- Un bouton « Relancer sur WhatsApp » avec un message prérempli (prénom, prochaine tâche,
  échéance), sur le modèle du lien WhatsApp existant.
- Tableau de bord : « Préparation en retard » (candidates soumises avec une tâche en retard,
  ou « approuvé mais pas soumis » depuis plus de 3 jours). Liste : colonne d'avancement
  (« 3/7 ») et pastille de retard, calculées pour toutes les lignes avec deux requêtes
  (`prep_tasks` et la première date de `status_history` vers un statut du chemin, pour le
  jour de soumission) et le calcul des échéances en mémoire.

## Livraison D : relances de préparation, répétition, événement

Passe `runCalendarReminders` dans le cron quotidien (07 h UTC, 08 h à Douala), activée par
`calendar_reminders_enabled` ; elle tourne avant la passe des formulaires abandonnés.

| Étape | Relance | Déclencheur | Clé |
|---|---|---|---|
| Préparation | point d'étape : prochaines tâches, en retard d'abord, avec un champ pour noter ce qu'elle a fait | soumise, tâches restantes ; le premier au jour `S + rythme`, puis `dernier point + rythme` (rythme selon l'urgence : 7, 4, 2 ou 1 jour) ; à l'activation, une candidate dont `S + rythme` est passé reçoit un seul point | `checkin:<jour>` |
| Préparation | tâche à faire demain (ou aujourd'hui), ou en retard d'un jour | échéance `T` de la tâche : `due` aux jours `T − 1` et `T`, `late` aux jours `T + 1` et `T + 2` (cible propre `T + 1`, palier 0) | `task:<clé>:<échéance>:due` et `:late` |
| Préparation | « tu es prête ? » pour les tâches validées par la coach | tâche à `ready_at` sans validation depuis 2 jours : relance la coach (dans le résumé), pas la candidate | résumé aux coachs |
| Plan | « Ton plan de préparation est prêt » | soumise par un autre chemin que sa confirmation, une seule fois | `plan_open:<S>` |
| Répétition | « Répétition dans N jours » | J-7, J-3, J-1, jour même, pour les soumises dont la répétition est retenue | `rehearsal:<R>:<t>` |
| Événement | logistique | J-7 et J-2, statut « Retenue » ou au-delà (hors « Non retenue ») | `event:<E>:<t>` |
| Coach | « Candidates sans nouvelles » | soumise, hors « Non retenue », avec une tâche en retard de 2 jours, une tâche « prête » sans validation depuis 2 jours, ou sans geste depuis 7 jours (3 si l'urgence est « serrée » ou « très serrée ») ; « sans geste » se compte depuis `S` quand aucune ligne n'existe | réglage `coach_digest_last` (un envoi par jour) |

« Prompter pour consigner » : chaque point d'étape propose de cocher et de noter ; la coach
voit les candidates sans geste dans le résumé et peut relancer sur WhatsApp.

## Livraison E : la suite de la décision

- Après « Retenue » : un message qui confirme (la logistique devient visible dans « Ta
  préparation », livraison B).
- Après « Non retenue » : le message d'encouragement (« ce que tu as préparé reste à toi »)
  est posé en livraison B ; ici, l'accès à son dossier. Elle pourra candidater à un autre événement **quand l'équipe
  rouvrira les candidatures** (nouvelle date limite, nouveaux événements) : tant que la
  clôture commune est passée, le lien affiche « prochaine ouverture ». À l'ouverture, le
  dispositif « reprendre avec un code » permet de démarrer un nouveau parcours ; il reste à
  recopier ses réponses, son sujet et sa photo validée (copie de l'objet de stockage
  comprise, avec le rangement qui suit la suppression d'une candidate).
- Cette livraison est la moins urgente : elle suit les autres.

## Règles des relances

- **Journal** `calendar_reminders (candidate_id, key, sent_at)` (le nom évite la confusion avec la colonne existante `candidates.reminders_sent`, le compteur des relances de formulaire abandonné), clé primaire
  `(candidate_id, key)`, suppression en cascade, sécurité par ligne. Chaque clé contient la
  date visée et le palier : `submit:2026-10-26:3`. Un changement de date réarme sans
  rien faire ; les anciennes lignes restent inoffensives.
- **Fenêtre** : un palier `t` pour la date visée `T` est dû le jour `d` si
  `T − t ≤ d ≤ T − t + 1` et `d ≤ T` (un cron manqué est rattrapé le lendemain, jamais
  davantage ; le palier 0 n'a donc pas de rattrapage, et le plafond de 300 en perd le
  surplus). Le texte compte `N = T − d` jours, pas `t`. Quand plusieurs paliers d'une même
  cible sont dus le même jour (cron manqué la veille), seul le plus proche part et les
  autres sont écrits sans envoi. À l'activation du réglage, seules les relances de la
  fenêtre en cours partent. **Aperçu et vérification** : le cron accepte `?dry=1` ; dans ce
  mode il saute **toute** la passe actuelle (`runReminders`, qui n'a pas de mode sans envoi)
  et ne rend que l'aperçu de la passe du calendrier, sans envoi ni journal.
- **Revendiquer, puis envoyer** : on choisit d'abord, par boîte mail, le dossier à
  relancer ; on insère la ligne du journal (`ON CONFLICT DO NOTHING`) ; si l'insertion a
  réussi, on envoie ; si l'envoi échoue, la ligne est supprimée pour qu'une relance suivante
  réessaie. En mode sans envoi réel (préproduction), un email « consigné » compte comme
  envoyé.
- **Un seul email par candidate et par jour**, pour toutes les passes : la passe du
  calendrier tourne en premier, regroupe les relances dues (la plus urgente donne le sujet,
  les autres sont listées et revendiquées). « Déjà écrite ce jour-là » = une ligne de
  `calendar_reminders`, un rappel d'abandon (`candidates.last_reminder_at`) ou un rappel de
  proposition (`proposals.reminded_at`) dont la date tombe le jour de Douala courant ; une
  **boîte mail** déjà écrite ce jour-là par une passe l'est aussi pour les autres dossiers
  qui l'utilisent. Chaque passe consulte cela **avant** de revendiquer (`claimReminder`,
  `proposals.reminded_at`, le journal) : une candidate sautée garde son palier et son rappel
  pour le prochain passage, rien n'est brûlé. Deux dossiers sur une même boîte se relaient
  (à dates égales, celui qui a attendu le plus longtemps passe d'abord).
- **Son événement** : pas de relance si l'événement de la candidate est passé ; pas de
  relance d'échange ni de soumission si l'appel de son événement est clos (l'événement se
  retrouve par son identifiant ou, pour « Autre », par le nom saisi, comme dans l'espace coach) ;
  la clôture de l'appel n'est citée que si elle est encore à venir. À J-3 et J-1 de la
  clôture, la relance de clôture prend la place de la relance d'abandon du jour.
- Pas d'email à une candidate sans adresse, au statut « Non retenue », ni après l'événement.
- Au plus 300 candidates par passage (les envois sont espacés de 550 ms) ; le reste attend le
  lendemain grâce à la fenêtre de deux jours.
- Le résumé aux coachs : un envoi par jour, verrouillé par `coach_digest_last` avec un
  upsert (`INSERT … ON CONFLICT (key) DO UPDATE SET value = excluded.value WHERE
  settings.value <> excluded.value RETURNING key` : la ligne n'existe pas avant le
  premier envoi, un `UPDATE` seul ne trouverait rien).
- Chaque email donne un lien vers « Ta préparation » ou le formulaire. Le lien n'enregistre
  rien tout seul : les anti-spams ouvrent les liens.
- `reminders_enabled` (existant) gouverne **toute** la passe actuelle, relances de
  propositions comprises ; `calendar_reminders_enabled` est un interrupteur séparé.
- Langue de la candidate pour chaque mail.

## Cas limites

- **Dates absentes ou illisibles** : voir B2 ; `interest_deadline` vide = candidatures
  ouvertes ; `calendar_reminders_enabled` éteint = aucune relance nouvelle.
- **Dates qui changent** : les échéances étant calculées, une nouvelle date se répercute à la
  lecture ; les relances sont réarmées par la date dans la clé.
- **Dossier admis après coup ou intérêt envoyé tard** : urgence « serrée » ou « très serrée » ;
  le plan est réduit aux incontournables si la fenêtre `W` est inférieure à 21 jours.
- **Chemins vers « soumise »** : le plan n'est jamais « créé », il se lit ; le jour de
  soumission est défini pour les quatre conditions (voir Définitions).
- **Parcours rouvert** : plan masqué, relances de préparation suspendues, coches conservées ;
  les relances d'échanges et de soumission continuent.
- **Candidate sans email** : seul son espace et la relance WhatsApp de la coach la touchent.
- **Même boîte mail pour deux dossiers** : le choix du dossier se fait avant le journal ;
  l'autre dossier est relancé le lendemain.
- **Suppression d'une candidate** : `prep_tasks` et `calendar_reminders` partent en cascade ;
  `email_log` conserve les mails envoyés (c'est un journal), et une candidate soumise ne peut
  pas être supprimée tant que ses échanges sont verrouillés (règle existante).
- **Fuseaux** : jours de Douala, cron en UTC ; on compare des jours, jamais des instants.
- **Charge** : listes et tableau de bord restent à une requête par agrégat.
- **Événements de démonstration** : dans `scripts/db.mjs`, Yaoundé (21 novembre) et Douala
  (28 novembre) sont datés, Bamenda n'a pas de date (il n'est pas proposé) ; les tests de
  base de données créent leurs événements à des dates relatives à l'exécution, et la CI
  repousse la date de Douala avant le test de fumée.

## Sécurité et vie privée

- La route d'écriture n'accepte que la candidate connectée par son cookie, pour son dossier
  et des clés connues.
- Notes limitées à 500 caractères, affichées sans HTML ; elles sont visibles de la coach.
- Les nouveaux textes candidates n'évoquent jamais l'IA ; les tests de vocabulaire sont
  étendus à tous les groupes de textes et à tous les nouveaux mails (aujourd'hui seuls
  `journey` et `access` et une liste figée de mails sont couverts).
- Les nouvelles tables activent la sécurité par ligne.

## Tests

- Fonctions pures : admission (la veille, le jour même et le lendemain de la date limite ;
  fuseau), événements ouverts,
  urgence, échéances (confortable, serré, sans répétition, sans événement, répétition après
  l'événement, `R ≤ S`, `R` passée, `E ≤ S + 1`, décalage coach, tri), jour de soumission des
  quatre conditions, avancement et retard, règles de
  cohérence, fenêtres des relances.
- Base de données : cocher, prête puis validée, notes, cascade, journal (un seul envoi,
  deux passages simultanés, rattrapage le lendemain, échec d'envoi qui libère la ligne,
  réarmement par la date), clôture (refus, admission), finalisation atomique (reproduction du
  défaut avec un déclencheur qui échoue), rattrapage à la lecture et action de rattrapage,
  avance de statut sur `STATUS_PATH` (depuis « Candidature soumise » et « Non retenue » :
  statut inchangé), visibilité du plan.
- Mails : FR et EN, vocabulaire, liens, regroupement.
- Chromium : formulaire fermé, admis, liste des événements, section « Ta préparation »
  (cocher, note, prête, échéances, mobile), onglet coach, paramètres.
- Chaque livraison passe une relecture indépendante (trois lecteurs, chaque trouvaille
  contestée par deux sceptiques) avant la fusion.

## État après chaque livraison

| Après | Ce qui change pour les candidates et les coachs |
|---|---|
| A | Le formulaire se ferme à la date réglée, ne propose que des événements datés, ne perd plus de dossier ; relances de clôture, d'échanges et de soumission, avec leur procédure d'activation (aperçu, appel manuel en préproduction, activation). Rien d'autre. |
| B | Après sa soumission la candidate voit son plan daté et peut le cocher ; elle reçoit un email de confirmation et, après « Non retenue », un message d'encouragement. Pas de relance de préparation ; les tâches « relecture » et « répétition générale » attendent la livraison C pour être validées. |
| C | Les coachs voient et pilotent le plan, relancent sur WhatsApp. |
| D | Relances de préparation, de répétition, d'événement et résumé aux coachs. |
| E | Messages après la décision et nouvelle candidature. |

## Mise en production

Les migrations ne font qu'ajouter, appliquées avant le démarrage du code (voir
`docs/deploy-vps.md`). Tant que `interest_deadline` et `rehearsal_date` ne sont pas
réglées, le formulaire ne se ferme pas et le plan s'ancre sur la date de l'événement ; la
liste des événements change dès la livraison A. Ordre : A, B, C, D, E. Les textes de
chaque livraison sont relus par l'équipe **avant sa fusion** (ils figurent dans la
description de la PR). La livraison A comprend la procédure d'activation de
`calendar_reminders_enabled`, pour que les relances de la date limite du 26 octobre puissent
partir. Procédure : (1) dans la préproduction, régler les dates (une date limite des intérêts
à quelques jours) et **allumer `calendar_reminders_enabled`** (sans cela, un appel réel ne fait
rien) ; avoir un dossier de test dû (formulaire inachevé, ou échange en attente) ; (2) appeler le
cron à la main avec le secret du cron et `?dry=1` (toute forme du paramètre est un aperçu : il
saute aussi la passe des formulaires abandonnés, qui n'a pas de mode sans envoi) et lire
l'aperçu ; (3) l'appeler sans `dry` (pas de clé d'envoi : les emails sont seulement
consignés) et lire dans la page Emails les lignes `calendar_closing`, `calendar_exchange`,
`calendar_submit` ; (4) seulement ensuite, en production, regarder l'aperçu des Paramètres et
allumer le réglage.

## Questions ouvertes (valeurs par défaut retenues)

1. La date limite des intérêts est une **nouvelle** date, distincte de la date interne.
2. La répétition est décrite par un champ libre (en ligne ou sur place).
3. Aucune exception automatique à la clôture ; la coach peut admettre un dossier.
4. Heure limite : la fin de la journée de la date limite, à Douala (minuit).
5. Les dossiers sur « Autre » ou sur un événement sans date sont listés, pas modifiés.
6. Les textes des tâches et des relances sont un premier jet à relire par l'équipe.
