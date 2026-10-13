# Calendrier commun, admission, relances et plan de préparation

Date : 2026-10-13 · Statut : conception relue (une relecture indépendante, 82 remarques
confirmées et intégrées), implémentation en cinq livraisons (A à E)

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
  (voir A1).

Le but : un **calendrier commun** à toutes les candidates (une date limite des intérêts,
un jour de répétition), des **règles d'admission** claires, un **plan de préparation**
daté qui démarre dès la soumission, sans attendre la décision de l'événement, et des
**relances à chaque étape**, dont le rythme dépend de l'urgence.

Si la candidate n'est pas retenue, ce n'est pas grave : elle a travaillé son sujet et
pourra candidater à un prochain événement.

## Décisions

| Sujet | Décision |
|---|---|
| Date limite des intérêts | Une date commune (réglage `interest_deadline`), valable jusqu'à 23 h 59 (heure de Douala) le jour dit. Passé ce moment, plus aucune candidature n'est acceptée : ni nouveau dossier, ni envoi d'un dossier commencé. Vide = pas de clôture. |
| Jour de répétition | Une date commune (réglage `rehearsal_date`), une seule pour toutes. Un champ libre `rehearsal_info` (lieu, lien, horaire) s'affiche aux candidates et dans les mails. |
| Temps de préparation | 14 jours au moins entre le dernier jour pour envoyer son intérêt et la répétition, **et** entre la date interne de soumission et la répétition. Les Paramètres affichent un avertissement (non bloquant) si un de ces écarts est plus court. |
| Date interne | `internal_deadline` (existante) : dernier jour pour soumettre à l'appel à speakers, avec la marge de relecture de l'équipe. Elle reste séparée de la date limite des intérêts ; l'équipe peut régler les deux sur le même jour. |
| Événements proposés | Seulement ceux qui ont une date d'événement valide, non passée, et postérieure au jour de répétition quand il est réglé. « Autre » disparaît de la liste. Un dossier existant garde sa valeur. |
| Dossiers commencés à la clôture | Pas d'exception automatique. La coach peut, depuis la fiche, **admettre un dossier malgré la clôture**. |
| Plan de préparation | Démarre quand la candidate **a soumis**, quelle que soit la façon (voir « Jour de soumission »). Il ne dépend pas de la décision de l'événement ; seule la logistique de voyage attend d'être retenue. |
| Échéances | Calculées à la lecture à partir des dates communes et de la date de son événement, jamais figées en base : un changement de date se répercute partout. |
| État de chaque tâche | Seulement ce qui s'est passé : prête, faite, passée, échéance décalée par la coach, une note. Rien n'est créé tant que personne n'a rien fait. |
| Tâches validées par la coach | « Relecture des slides » et « Répétition générale » : la candidate indique qu'elle est prête, la coach valide. La candidate ne peut pas les cocher comme faites. |
| Relances | Un journal `reminders_sent` rend chaque relance unique. Chaque clé contient la date visée, donc un changement de date réarme les relances. Une relance est « due » dans une fenêtre de deux jours après son déclencheur, jamais plus tard. |
| Rythme | Il dépend du nombre de jours entre l'envoi de son intérêt et la répétition (« urgence »). |
| Non retenue | Le plan reste visible et un message encourage ; les relances par email s'arrêtent. Le statut n'est jamais posé par l'app : « Retenue » et « Non retenue » sont des décisions de la coach. |
| IA | Jamais mentionnée côté candidate. Les nouveaux textes et mails entrent dans les tests qui le vérifient. |
| Langues | Textes candidates en français et en anglais ; l'espace coach reste en français. |

## Définitions

Toutes les dates sont des jours (texte `AAAA-MM-JJ`) lus dans le fuseau d'Africa/Douala
(UTC+1, sans heure d'été) avec `src/lib/dates.ts`. Un horodatage de la base (UTC) est
converti en jour de Douala (`dayOf(ts)`).

- **Jour de l'intérêt** (`interestOn`) : `dayOf(completed_at)`.
- **Jour de soumission** (`submittedOn`) : `dayOf(submitted_at)` si elle a confirmé ;
  sinon le jour de la première entrée de `status_history` vers un statut au moins
  « Candidature soumise » sur le chemin des statuts (`STATUS_PATH`, sans « Non retenue »)
  ; sinon `interestOn` quand le formulaire dit qu'elle avait déjà soumis. Vide si elle n'a
  jamais soumis.
- **Plan visible** : `submittedOn` existe et le parcours n'est pas rouvert sans
  nouvelle confirmation. « Non retenue » ne masque pas le plan.
- **Tâche de logistique** : `logistics` est affichée « dès que tu es retenue » tant que
  le statut n'est pas au moins « Retenue » (sur `STATUS_PATH`, hors « Non retenue »).
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
tous les événements proposés (ceux qui sont avant sont retirés de la liste, avec la
mention) ; (4) dates absentes ou illisibles.

## Livraison A : le formulaire et les premières relances

### A1. Finalisation fiable

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
2. **Rattrapage à la lecture** : au début du chargement du formulaire et de la reprise (page
   et routes), un dossier au marqueur « terminé » sans date de fin est finalisé avant de
   répondre, puis relu : la candidate voit tout de suite la page de confirmation, pas
   l'écran 1. La clôture ne s'applique pas à ce rattrapage : elle avait envoyé à temps.
3. **Rattrapage des dossiers déjà bloqués** : une action de l'espace coach « Finaliser les
   dossiers bloqués (N) » dans les Paramètres, qui fait la même chose pour tous (elle tourne
   dans l'application, avec son code et ses mails ; aucun script séparé). Elle affiche la
   liste avant et un compte rendu après. Le README donne en plus la requête de liste des
   dossiers sur « Autre » ou sur un événement sans date, à traiter à la main.

### A2. Admission

- **Événements proposés** : `getRefs` garde tous les événements (affichage, libellés de la
  fiche et de la liste). Une nouvelle fonction `getFormRefs(today)` ne renvoie que ceux qui
  sont **ouverts** (date d'événement valide, non passée, postérieure à `rehearsal_date`
  quand il est réglé), sans « Autre », et c'est elle qu'utilisent le formulaire et sa
  validation. Si aucun événement n'est ouvert, le formulaire affiche « candidatures closes ».
  Un dossier dont l'événement n'est plus proposé doit en choisir un autre pour enregistrer
  l'écran 1. Quand le dernier événement daté passe, le formulaire se ferme seul : c'est voulu.
- **Clôture** : après `interest_deadline` + 23 h 59 (Douala), `submitScreen` refuse un
  nouveau dossier et l'envoi de tout dossier non terminé, avec l'erreur `closed`, sauf si
  la coach l'a admis. Le formulaire, la reprise par lien ou par code, et la page d'accueil
  affichent « Les candidatures sont closes » avec la date.
- **Admettre malgré la clôture** : bouton sur la fiche d'un dossier non terminé, qui
  renseigne `candidates.admitted_late_at`. Le dossier peut alors être terminé.
- **Annonce** : un bandeau « Candidatures ouvertes jusqu'au … » sur la page d'accueil et en
  haut du formulaire ; la FAQ publique est mise à jour (elle promet aujourd'hui n'importe
  quel événement saisi dans le formulaire).
- **Relances d'un formulaire abandonné** : elles s'arrêtent après la clôture, sauf pour les
  dossiers admis.

### A3. Réglages

Page Paramètres : `interest_deadline`, `rehearsal_date`, `rehearsal_info`,
`calendar_reminders_enabled` (défaut « non »), avec les avertissements de cohérence et un
**aperçu des relances du jour** (ce que la passe enverrait, sans rien envoyer). Aucune
migration (les réglages sont créés à l'enregistrement).

### A4. Journal des relances et premières relances

Migration `0016_calendar.sql` (additive) : `candidates.admitted_late_at` et la table
`reminders_sent` (voir « Règles des relances »). Relances de cette livraison :

- **Clôture du formulaire** : un formulaire non terminé, avec adresse, à J-3 et J-1 de
  `interest_deadline` (« Il te reste N jours pour envoyer ton intérêt »).
- **Échanges** : pour une candidate dont c'est le tour à une étape (choix, sujet, photo),
  « Fais-nous ta réponse avant le … » à J-7, J-3 et J-1 de `internal_deadline` ; le rappel
  actuel à 48 h reste.
- **Soumission** : à l'étape « soumission », à J-7, J-3, J-1 et le jour même de la
  première échéance à venir parmi `internal_deadline` et la clôture de l'appel de son
  événement ; la date visée fait partie de la clé, donc la seconde échéance a ses propres
  relances.
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
| 10 | `logistics` | Équipement, transport, horaire d'arrivée, slides en local et sur clé | événement − 2 j | oui | elle (affichée après « Retenue ») |

Dix tâches, sept incontournables. Le détail de chaque tâche reprend le texte du plan de
route actuel (`roadmap.ts`), précisé selon le format du talk (talk, lightning, atelier) et
les réponses déjà recueillies (première fois sur scène, trac, anglais). Aucun mot sur l'IA.

### B2. Calcul des échéances

Fonction pure `prepSchedule({ today, interestOn, submittedOn, rehearsal, eventDay, format,
status })`, qui renvoie la liste ordonnée des tâches, leurs échéances et l'urgence.

1. `S` = jour de soumission, `R` = répétition (réglée, sinon événement − 10 j, sinon
   absente), `E` = jour de son événement.
2. **Fenêtre** `W` = nombre de jours entre `S` et `R`. Coefficient `k = min(1, W / 21)`.
   Si `W < 21`, seules les tâches incontournables sont proposées.
3. Échéance brute : `S + ⌈décalage × k⌉` pour les tâches relatives à la soumission,
   `R + décalage` pour celles de la répétition, `E + décalage` pour celles de
   l'événement ; jamais avant `S + 1`, jamais après `E`.
4. La liste est triée par échéance puis par numéro du tableau ; aucune échéance n'est
   repoussée d'une ancre à l'autre.
5. Une échéance décalée par la coach (`due_override`) l'emporte.
6. **Cas dégradés** : sans `R`, les tâches de répétition (5, 7) sont ignorées et
   `slides_draft` et `slides_review` s'ancrent sur `E − 10` et `E − 8` ; sans `E`, les
   tâches 8 et 10 s'affichent sans échéance ; `R ≤ S` (répétition déjà passée ou
   aujourd'hui), les tâches 5 et 7 sont ignorées et signalées aux coachs ; une échéance
   déjà passée à la lecture est affichée « en retard ».

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
  tant que le plan est visible : avancement (« 3 sur 10 »), tâches avec échéance (« dans
  4 jours », « en retard »), case à cocher, note facultative, détail de la répétition
  (`rehearsal_info`) et message de la coach quand une tâche attend sa validation.
- Écriture par `POST /api/espace/prep` (clé, geste, note). La route vérifie la session par
  le cookie, que le plan est visible, que la clé fait partie des tâches proposées à cette
  candidate (urgence, ignorées, logistique avant « Retenue »), et refuse à la candidate les
  gestes réservés à la coach. Les erreurs sont des codes traduits côté page.
- Un email « Ta candidature est soumise, voici ta préparation » à la candidate quand elle
  confirme (aujourd'hui seule la coach est prévenue).
- **Plan de route** : `buildRoadmap` reçoit l'information « soumise » (jour de soumission)
  et `plan/page.tsx` cesse de cacher le texte « démarre la préparation pendant que les
  organisateurs décident » ; l'étape 1 est cochée, les étapes 2 à 5 renvoient vers « Ta
  préparation ». Le test existant qui fige l'ancien comportement est adapté.
- Parcours rouvert sans nouvelle confirmation : section masquée, relances suspendues, coches
  conservées. Après « Non retenue » : message d'encouragement, plan lisible.

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
- Un bouton « Relancer sur WhatsApp » avec un message prérempli (prénom, prochaine tâche,
  échéance), sur le modèle du lien WhatsApp existant.
- Tableau de bord : « Préparation en retard » (candidates soumises avec une tâche en retard,
  ou « approuvé mais pas soumis » depuis plus de 3 jours). Liste : colonne d'avancement
  (« 3/10 ») et pastille de retard, calculées pour toutes les lignes avec une seule requête
  sur `prep_tasks` et le calcul des échéances en mémoire.

## Livraison D : relances de préparation, répétition, événement

Passe `runCalendarReminders` dans le cron quotidien (07 h UTC, 08 h à Douala), activée par
`calendar_reminders_enabled` ; elle tourne avant la passe des formulaires abandonnés.

| Étape | Relance | Déclencheur | Clé |
|---|---|---|---|
| Préparation | point d'étape : prochaines tâches, en retard d'abord, avec un champ pour noter ce qu'elle a fait | soumise, tâches restantes, selon l'urgence (7, 4, 2 ou 1 jour) depuis le dernier point | `checkin:<jour>` |
| Préparation | tâche à faire demain ou en retard d'un jour | échéance de la tâche | `task:<clé>:<échéance>:due` et `:late` |
| Préparation | « tu es prête ? » pour les tâches validées par la coach | tâche à `ready_at` sans validation depuis 2 jours : relance la coach, pas la candidate | digest |
| Répétition | « Répétition dans N jours » | J-7, J-3, J-1, jour même, pour les soumises dont la répétition est retenue | `rehearsal:<R>:<t>` |
| Événement | logistique | J-7 et J-2, statut « Retenue » ou au-delà (hors « Non retenue ») | `event:<E>:<t>` |
| Coach | « Candidates sans nouvelles » | soumise, hors « Non retenue », avec une tâche en retard de 2 jours ou sans geste depuis 7 jours (3 si l'urgence est « serrée » ou « très serrée ») | réglage `coach_digest_last` (un envoi par jour) |

« Prompter pour consigner » : chaque point d'étape propose de cocher et de noter ; la coach
voit les candidates sans geste dans le résumé et peut relancer sur WhatsApp.

## Livraison E : la suite de la décision

- Après « Retenue » : un message qui confirme, la logistique devient visible.
- Après « Non retenue » : message d'encouragement (« ce que tu as préparé reste à toi ») et
  accès à son dossier. Elle pourra candidater à un autre événement **quand l'équipe
  rouvrira les candidatures** (nouvelle date limite, nouveaux événements) : tant que la
  clôture commune est passée, le lien affiche « prochaine ouverture ». À l'ouverture, le
  dispositif « reprendre avec un code » permet de démarrer un nouveau parcours ; il reste à
  recopier ses réponses, son sujet et sa photo validée (copie de l'objet de stockage
  comprise, avec le rangement qui suit la suppression d'une candidate).
- Cette livraison est la moins urgente : elle suit les autres.

## Règles des relances

- **Journal** `reminders_sent (candidate_id, key, sent_at)`, clé primaire
  `(candidate_id, key)`, suppression en cascade, sécurité par ligne. Chaque clé contient la
  date visée et le palier : `submit:2026-10-26:3`. Un changement de date réarme sans
  rien faire ; les anciennes lignes restent inoffensives.
- **Fenêtre** : un palier `t` pour la date visée `T` est dû le jour `d` si
  `T − t ≤ d ≤ T − t + 1` et `d ≤ T` (un cron manqué est rattrapé le lendemain, jamais
  davantage). À l'activation du réglage, seules les relances de la fenêtre en cours partent.
  Aperçu et vérification : le cron accepte `?dry=1` (rapport sans envoi ni journal).
- **Revendiquer, puis envoyer** : on choisit d'abord, par boîte mail, le dossier à
  relancer ; on insère la ligne du journal (`ON CONFLICT DO NOTHING`) ; si l'insertion a
  réussi, on envoie ; si l'envoi échoue, la ligne est supprimée pour qu'une relance suivante
  réessaie. En mode sans envoi réel (préproduction), un email « consigné » compte comme
  envoyé.
- **Un seul email par candidate et par jour**, pour toutes les passes : la passe du
  calendrier tourne en premier, regroupe les relances dues (la plus urgente donne le sujet,
  les autres sont listées et revendiquées), et la passe des formulaires abandonnés saute les
  candidates déjà écrites ce jour-là. À J-3 et J-1 de la clôture, la relance de clôture
  remplace la relance d'abandon.
- Pas d'email à une candidate sans adresse, au statut « Non retenue », ni après l'événement.
- Au plus 300 candidates par passage (les envois sont espacés de 550 ms) ; le reste attend le
  lendemain grâce à la fenêtre de deux jours.
- Le résumé aux coachs : un envoi par jour, verrouillé par `coach_digest_last`
  (`UPDATE … WHERE value <> aujourd'hui`).
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
- **Dossier admis après coup ou intérêt envoyé tard** : urgence « serrée » ou « très serrée »,
  plan réduit aux incontournables.
- **Quatre chemins vers « soumise »** : le plan n'est jamais « créé », il se lit, et le jour
  de soumission est défini pour les quatre (voir Définitions).
- **Parcours rouvert** : plan masqué, relances suspendues, coches conservées.
- **Candidate sans email** : seul son espace et la relance WhatsApp de la coach la touchent.
- **Même boîte mail pour deux dossiers** : le choix du dossier se fait avant le journal ;
  l'autre dossier est relancé le lendemain.
- **Suppression d'une candidate** : `prep_tasks` et `reminders_sent` partent en cascade ;
  `email_log` conserve les mails envoyés (c'est un journal), et une candidate soumise ne peut
  pas être supprimée tant que ses échanges sont verrouillés (règle existante).
- **Fuseaux** : jours de Douala, cron en UTC ; on compare des jours, jamais des instants.
- **Charge** : listes et tableau de bord restent à une requête par agrégat.
- **Événements de démonstration** : ceux de `scripts/db.mjs` sont datés (21 et 28 novembre) ;
  les tests et le test de fumée utilisent des dates relatives à l'exécution.

## Sécurité et vie privée

- La route d'écriture n'accepte que la candidate connectée par son cookie, pour son dossier
  et des clés connues.
- Notes limitées à 500 caractères, affichées sans HTML ; elles sont visibles de la coach.
- Les nouveaux textes candidates n'évoquent jamais l'IA ; les tests de vocabulaire sont
  étendus à tous les groupes de textes et à tous les nouveaux mails (aujourd'hui seuls
  `journey` et `access` et une liste figée de mails sont couverts).
- Les nouvelles tables activent la sécurité par ligne.

## Tests

- Fonctions pures : admission (limites de la clôture, fuseau), événements ouverts,
  urgence, échéances (confortable, serré, sans répétition, sans événement, répétition après
  l'événement, `R ≤ S`, décalage coach, tri), jour de soumission des quatre chemins, règles de
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
| A | Le formulaire se ferme à la date réglée, ne propose que des événements datés, ne perd plus de dossier ; relances de clôture, d'échanges et de soumission. Rien d'autre. |
| B | Après sa soumission la candidate voit son plan daté et peut le cocher ; elle reçoit un email de confirmation. Pas de relance de préparation. |
| C | Les coachs voient et pilotent le plan, relancent sur WhatsApp. |
| D | Relances de préparation, de répétition, d'événement et résumé aux coachs. |
| E | Messages après la décision et nouvelle candidature. |

## Mise en production

Les migrations ne font qu'ajouter, appliquées avant le démarrage du code (voir
`docs/deploy-vps.md`). Tant que `interest_deadline` et `rehearsal_date` ne sont pas
réglées, le formulaire ne se ferme pas et le plan s'ancre sur la date de l'événement ; la
liste des événements change dès la livraison A. Ordre : A, B, C, D (textes relus par
l'équipe d'abord), E. Avant d'activer `calendar_reminders_enabled`, on regarde l'aperçu
du jour dans les Paramètres, puis on appelle le cron à la main sur la préproduction (elle
n'a pas de cron ; l'appel avec le secret du cron et `?dry=1` puis sans, en mode sans envoi
réel) et on lit le journal des emails.

## Questions ouvertes (valeurs par défaut retenues)

1. La date limite des intérêts est une **nouvelle** date, distincte de la date interne.
2. La répétition est décrite par un champ libre (en ligne ou sur place).
3. Aucune exception automatique à la clôture ; la coach peut admettre un dossier.
4. Heure limite : 23 h 59 à Douala.
5. Les dossiers sur « Autre » ou sur un événement sans date sont listés, pas modifiés.
6. Les textes des tâches et des relances sont un premier jet à relire par l'équipe.
