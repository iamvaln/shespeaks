# Calendrier commun, admission, relances et plan de préparation

Date : 2026-10-13 · Statut : conception à relire, puis implémentation en cinq livraisons (A à E)

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
  limite de temps : on ne peut pas garantir deux semaines de préparation ;
- une candidate peut rester bloquée à la fin du formulaire sans que personne le voie
  (voir « Livraison A »).

Le but : un **calendrier commun** à toutes les candidates (une date limite des intérêts,
un jour de répétition), des **règles d'admission** claires, un **plan de préparation**
daté qui démarre dès la soumission, sans attendre la décision de l'événement, et des
**relances à chaque étape**, dont le rythme dépend de l'urgence.

Si la candidate n'est pas retenue, ce n'est pas grave : elle a travaillé son sujet et
pourra candidater à un prochain événement.

## Décisions

| Sujet | Décision |
|---|---|
| Date limite des intérêts | Une date commune (réglage `interest_deadline`), valable jusqu'à 23 h 59 (heure de Douala) le jour dit. Passé ce moment, plus aucune candidature n'est acceptée : ni nouveau dossier, ni envoi d'un dossier commencé. Vide = pas de clôture (rien ne change tant qu'elle n'est pas réglée). |
| Jour de répétition | Une date commune (réglage `rehearsal_date`), une seule pour toutes. Un champ libre `rehearsal_info` (lieu, lien, horaire) s'affiche aux candidates et dans les mails. |
| Deux semaines minimum | Entre la date limite des intérêts et le jour de répétition : 14 jours au moins. Les Paramètres affichent un avertissement (non bloquant) si l'écart est plus court. |
| Date interne actuelle | `internal_deadline` ne change pas : c'est la date à laquelle la candidate doit avoir soumis son sujet à l'appel à speakers pour que l'équipe le relise. Si l'équipe veut une seule date, elle règle les deux sur le même jour. |
| Événements proposés | Seulement ceux qui ont une date d'événement valide, non passée. « Autre » disparaît de la liste. Un dossier existant garde sa valeur. |
| Dossiers commencés à la clôture | Pas d'exception automatique. La coach peut, depuis la fiche, **admettre un dossier malgré la clôture**. |
| Plan de préparation | Démarre quand la candidate **compte comme soumise**, quelle que soit la façon (sa confirmation, le statut posé par la coach, la réponse du formulaire). Il ne dépend pas de la décision de l'événement. |
| Échéances | Calculées à la lecture à partir des dates communes et de la date de son événement, jamais figées en base : un changement de date se répercute partout. |
| État de chaque tâche | Seulement ce qui s'est passé : fait, passée, échéance décalée par la coach, une note. Rien n'est créé tant que personne n'a rien fait. |
| Relances | Un journal `reminders_sent` rend chaque relance unique. Une relance est « due et pas encore envoyée », jamais « exactement J-n » (le cron ne tourne qu'une fois par jour). |
| Rythme | Il dépend du nombre de jours entre l'envoi de son intérêt et la répétition (« urgence »). |
| Non retenue | Le plan reste visible, un message encourage et oriente vers un prochain événement. Les relances par email s'arrêtent. |
| IA | Jamais mentionnée côté candidate. Les nouveaux textes et mails entrent dans les tests qui le vérifient. |
| Langues | Textes candidates en français et en anglais ; l'espace coach reste en français. |

## Le calendrier

```
        intérêt envoyé        date limite          répétition      événement
  ───────┬───────────────────────┬────────────────────┬──────────────┬──────►
         │ ≥ 14 jours (garanti) ─┘                                    │
         └──── plan de préparation ───────────────────┘───────────────┘
```

Trois dates communes (Paramètres) et deux dates par événement (calendrier existant) :

- `interest_deadline` : dernier jour pour envoyer son intérêt ;
- `internal_deadline` (existant) : dernier jour pour soumettre à l'appel, avec la
  marge de relecture de l'équipe ;
- `rehearsal_date` : jour de répétition commun ;
- par événement : `cfp_close_date` et `event_date` (déjà là).

Règles de cohérence, affichées comme avertissements dans les Paramètres, jamais
bloquantes : écart entre `interest_deadline` et `rehearsal_date` d'au moins 14 jours ;
`interest_deadline` avant `rehearsal_date` ; `rehearsal_date` avant la date de
l'événement le plus proche parmi ceux qui sont proposés.

Toutes les dates sont des jours (texte `AAAA-MM-JJ`), lus dans le fuseau d'Africa/Douala
avec les fonctions de `src/lib/dates.ts`. Une date absente ou illisible n'est jamais
calculée : la fonctionnalité concernée se dégrade (voir « Cas limites »).

## Livraison A : le formulaire (fiabilité et admission)

### A1. Finalisation fiable

Un défaut reproduit sur une base de test : quand la candidate envoie la dernière page,
le marqueur de reprise passe à « terminé » dans une première transaction, puis la
finalisation (`completeDiagnostic` : date de fin, statut « Intérêt reçu », sujet,
notification des coachs) tourne dans une seconde. Si elle échoue (délai de la base,
connexion perdue), la candidate reste « En cours », sans date de fin, avec le marqueur
« terminé » : le formulaire repart à l'écran 1, l'admin affiche « écran 1 sur 6 »,
aucun coach n'est prévenu, et les relances continuent de lui écrire.

Corrections :

1. La finalisation entre dans la transaction qui enregistre la dernière page : le
   marqueur « terminé » et la date de fin vont ensemble ou pas du tout. Les mails
   partent après validation de la transaction.
2. **Rattrapage à la lecture** : un dossier « terminé » sans date de fin (cas déjà
   existants) est finalisé quand on le lit (`wizardState`, reprise par lien ou code).
3. **Script de rattrapage** `scripts/recover-stuck-forms.mjs` : liste (par défaut) puis
   finalise (`--apply`) les dossiers au marqueur « terminé » sans date de fin, et liste
   aussi les dossiers sur « Autre » ou sur un événement sans date. Il n'envoie aucun mail
   à la candidate ; il signale à la coach les dossiers rattrapés.

### A2. Admission

- **Événements proposés** : `getRefs` ne renvoie que les événements dont `event_date`
  est une date valide, non passée ; l'option « Autre » est retirée. La validation côté
  serveur s'appuie sur la même liste. Si aucun événement n'est ouvert, le formulaire
  affiche le message « candidatures closes ». Un dossier en cours dont l'événement
  n'est plus proposé doit en choisir un autre pour enregistrer l'écran 1.
- **Clôture** : après `interest_deadline` + 23 h 59 (Douala), `submitScreen` refuse un
  nouveau dossier et l'envoi de tout dossier non terminé, avec l'erreur `closed`, sauf
  si la coach l'a admis. Le formulaire, la reprise par lien ou par code, et la page
  d'accueil affichent « Les candidatures sont closes » avec la date.
- **Admettre malgré la clôture** : bouton sur la fiche d'un dossier non terminé, qui
  renseigne `candidates.admitted_late_at`. Le dossier peut alors être terminé.
- **Annonce de la clôture** : un bandeau « Candidatures ouvertes jusqu'au … » sur la page
  d'accueil et en haut du formulaire.
- **Relances d'un formulaire abandonné** : elles s'arrêtent après la clôture, sauf pour
  les dossiers admis.

### A3. Réglages

Page Paramètres : `interest_deadline`, `rehearsal_date`, `rehearsal_info`,
`calendar_reminders_enabled`, avec les avertissements de cohérence. Aucune migration
(les réglages sont créés à l'enregistrement).

Migration `0016_calendar.sql` (additive) : colonne `candidates.admitted_late_at` ;
les tables de la livraison B et D sont créées par la même migration pour n'avoir qu'un
fichier à appliquer, mais elles ne servent qu'à partir de leur livraison.

## Livraison B : le plan de préparation (candidate)

### B1. Tâches types

Une liste en code (`src/lib/prep.ts`, pure, textes FR/EN comme `roadmap.ts`). Chaque
tâche : une clé stable, une phase, un titre, une description courte, l'ancre de son
échéance, un décalage en jours, « incontournable » ou non, et qui la valide.

| Phase | Clé | Tâche | Échéance | Incontournable |
|---|---|---|---|---|
| Poser les bases | `outline` | Écrire le plan du talk en trois parties à partir du résumé approuvé | soumission + 3 j | oui |
| | `material` | Réunir exemples, chiffres, démos | soumission + 7 j | oui |
| | `timing` | Répartir le temps section par section (selon le format) | soumission + 7 j | non |
| Slides | `slides_draft` | Première version des slides | répétition − 5 j | oui |
| | `slides_review` | Relecture des slides avec la coach | répétition − 2 j | oui (validée par la coach) |
| Répétition | `rehearsal_solo` | Une répétition seule, chronométrée | répétition − 3 j | non |
| | `rehearsal_day` | Répétition générale | répétition | oui (validée par la coach) |
| | `qa` | Préparer les réponses aux questions probables | répétition + 2 j | non |
| Avant l'événement | `slides_final` | Version finale des slides | événement − 7 j | oui |
| | `logistics` | Équipement, transport, horaire d'arrivée, slides en local et sur clé | événement − 2 j | oui |

Le détail de chaque tâche reprend le texte du plan de route actuel (`roadmap.ts`),
précisé selon le format du talk (talk, lightning, atelier) et les réponses déjà
recueillies (première fois sur scène, trac, anglais). Aucun mot sur l'IA.

### B2. Calcul des échéances

Fonction pure `prepSchedule({ today, interestOn, submittedOn, rehearsal, eventDay, format })`
qui renvoie la liste ordonnée des tâches avec leur échéance et leur état d'urgence.

- Les échéances relatives à la soumission partent du jour où elle a soumis ; les autres
  sont à rebours de `rehearsal_date` ou de `event_date`.
- Une échéance ne passe jamais avant le lendemain de la soumission ; des échéances
  voisines sont déplacées pour garder l'ordre des tâches.
- **Urgence** = nombre de jours entre le jour où elle a envoyé son intérêt et la
  répétition : 28 et plus « confortable », 21 à 27 « normale », 14 à 20 « serrée », moins
  de 14 « très serrée » (dossiers admis après coup ou dates modifiées). En « serrée » et
  « très serrée », seules les tâches incontournables sont proposées.
- **Dates manquantes** : sans `rehearsal_date`, les tâches de répétition s'ancrent sur
  l'événement (événement − 10 j), et sans date d'événement valide les tâches datées sont
  affichées sans échéance, dans l'ordre. Une répétition après l'événement est ignorée
  et signalée dans les Paramètres.
- Une échéance décalée par la coach prend le dessus.

### B3. Persistance

Table `prep_tasks (candidate_id, key, done_at, done_by, skipped_at, due_override, note,
updated_at)`, clé primaire `(candidate_id, key)`, suppression en cascade, sécurité par
ligne activée. Une ligne n'existe que si quelqu'un a coché, passé, décalé ou noté.

Cocher est idempotent et réversible. `done_by` vaut `candidate` ou le nom de la coach.
Une note (500 caractères) accompagne le geste : c'est le journal des actions.

### B4. Espace de la candidate

- La section « Ta préparation » remplace la phrase « Bravo, ta candidature est
  soumise » dès qu'elle compte comme soumise : avancement (« 3 sur 9 »), phases,
  tâches avec échéance (« dans 4 jours », « en retard »), case à cocher, note facultative,
  et le détail de la répétition (`rehearsal_info`).
- Écriture par `POST /api/espace/prep` (clé, fait ou non, note), session par le cookie
  comme les autres routes ; les erreurs sont des codes traduits côté page.
- Un email « Ta candidature est soumise, voici ta préparation » à la candidate quand elle
  confirme (aujourd'hui seule la coach est prévenue).
- **Plan de route** : il reçoit l'information « soumise » (`countsAsSubmitted`) pour que
  l'étape 1 soit cochée et que le texte « démarre la préparation pendant que les
  organisateurs décident » soit enfin affiché ; les étapes 2 à 5 pointent vers « Ta
  préparation » au lieu de répéter les mêmes conseils.
- Si le parcours est rouvert (`reopened_at`), la section est masquée et les relances
  suspendues ; ses coches sont conservées.
- Après « Non retenue » : un message d'encouragement et le plan reste lisible.

## Livraison C : l'espace coach

- Un onglet « Préparation » sur la fiche : tâches, état, échéance, note ; cocher pour
  elle, passer, décaler une échéance ; la validation de `slides_review` fait avancer le
  statut vers « Slides validées » et celle de `rehearsal_day` vers « Répétition faite »
  (`advance`, jamais en arrière).
- Un bouton « Relancer sur WhatsApp » avec un message prérempli (prénom, prochaine
  tâche, échéance), sur le modèle du lien WhatsApp existant.
- Bouton « Admettre malgré la clôture » (livraison A).
- Tableau de bord : « Préparation en retard » (candidates soumises ayant une tâche en
  retard ou sans nouvelle depuis N jours). Liste des candidates : colonne d'avancement
  (« 3/9 ») et pastille de retard, calculées en une requête pour toutes les lignes.
- Réglages de la page Paramètres (livraison A).

## Livraison D : les relances

Le cron quotidien appelle une nouvelle passe `runCalendarReminders`, activée par
`calendar_reminders_enabled` (séparée de `reminders_enabled`, qui ne concerne que le
formulaire). Le cron tourne à 07 h UTC (08 h à Douala).

| Étape | Relance | Déclencheur | Clé dans le journal |
|---|---|---|---|
| Formulaire | « Il te reste N jours pour envoyer ton intérêt » | formulaire non terminé, à J-3 et J-1 de `interest_deadline` | `form_closing:3`, `form_closing:1` |
| Échanges | rappel actuel à 48 h (inchangé) | proposition sans réponse | déjà `proposals.reminded_at` |
| Soumission | « Soumets avant le … » | étape « soumission », à J-7, J-3, J-1 de la première échéance à venir parmi `internal_deadline` et `cfp_close_date` de son événement | `submit:7`, `submit:3`, `submit:1` |
| Préparation | point d'étape : prochaines tâches, en retard d'abord | soumise, tâches restantes, tous les 7 jours (confortable), 4 jours (normale), 2 jours (serrée) | `checkin:AAAA-MM-JJ` |
| Préparation | tâche à faire demain ou en retard | échéance de la tâche | `task:<clé>:due`, `task:<clé>:late` |
| Répétition | « Répétition dans N jours » | J-7, J-3, J-1, jour même, pour toutes les soumises | `rehearsal:7`, `:3`, `:1`, `:0` |
| Événement | logistique | J-7 et J-2, statut Retenue ou au-delà | `event:7`, `event:2` |
| Coach | « Candidates sans nouvelles » | au moins une candidate soumise sans activité depuis N jours (tâche en retard ou sans coche) | pas de journal : un envoi par jour |

Règles communes :

- **Revendiquer avant d'envoyer** : une ligne dans `reminders_sent (candidate_id, key,
  sent_at)` insérée avec `ON CONFLICT DO NOTHING`, l'envoi n'a lieu que si l'insertion a
  réussi. Un cron manqué un jour rattrape le lendemain ; deux passages simultanés ne
  doublent rien.
- **Un seul email par candidate et par passage** : les relances dues le même jour sont
  regroupées, la plus urgente donne le sujet.
- Pas d'email à une candidate sans adresse, au statut « Non retenue », ni après
  l'événement. Les doublons d'adresse suivent l'idiome existant (une relance par boîte).
- Au plus 300 candidates par passage ; le reste attend le lendemain (le journal évite
  les doublons).
- Chaque email donne un lien vers « Ta préparation » ou le formulaire. Le lien n'enregistre
  rien tout seul : les anti-spams ouvrent les liens.
- Les relances partent en FR ou EN selon la langue de la candidate.

## Livraison E : la suite de la décision

- Après « Retenue » : un message qui confirme et ramène les échéances à l'événement.
- Après « Non retenue » : message d'encouragement (« ce que tu as préparé reste à toi »)
  et accès à son dossier ; un lien pour candidater à un autre événement ouvert, en
  reprenant ses réponses. Le dispositif « reprendre avec un code » permet déjà de démarrer
  un nouveau parcours quand tous les siens sont terminés ; il reste à recopier ses
  réponses, son sujet et sa photo validée.
- Cette livraison est la moins urgente : elle suit les quatre autres.

## Cas limites

- **Dates absentes ou illisibles** : `interest_deadline` vide = candidatures ouvertes ;
  `rehearsal_date` vide = ancrage sur l'événement ; événement sans date valide = non
  proposé aux nouvelles candidates, plan sans échéance pour les anciennes.
- **Dates qui changent** : les échéances étant calculées, une nouvelle date se répercute
  sur les prochaines lectures. Les relances déjà envoyées ne sont pas renvoyées.
- **Dossier admis après coup ou intérêt envoyé tard** : urgence « serrée » ou « très
  serrée », plan réduit aux incontournables.
- **Quatre chemins vers « soumise »** (confirmation, statut posé par la coach, réponse du
  formulaire, état du sujet) : le plan n'est jamais « créé », il se lit.
- **Parcours rouvert** : plan masqué, relances suspendues, coches conservées.
- **Candidate sans email** : seul l'affichage dans son espace et la relance WhatsApp de la
  coach la touchent.
- **Même boîte mail pour deux dossiers** : une seule relance par boîte et par passage.
- **Suppression d'une candidate** : tout ce qui la concerne part en cascade.
- **Fuseaux** : jours de Douala, cron en UTC ; on compare des jours, jamais des instants.
- **Charge** : listes de candidates et tableau de bord restent à une requête par
  agrégat, sans requête par ligne.

## Sécurité et vie privée

- La route d'écriture n'accepte que la candidate connectée par son cookie, pour son
  dossier, et des clés de tâches connues.
- Notes limitées à 500 caractères, affichées sans HTML.
- Les nouveaux textes candidates n'évoquent jamais l'IA ; ils s'ajoutent aux tests de
  vocabulaire (dictionnaire et mails).
- Les nouvelles tables activent la sécurité par ligne.

## Tests

- Fonctions pures : admission (ouvert/fermé aux limites, fuseau), événements proposés,
  urgence, échéances (cas confortable, serré, dates manquantes, répétition après
  l'événement, décalage coach), règles de cohérence.
- Base de données : cocher et décocher, notes, cascade, journal des relances (un seul
  envoi, deux passages simultanés, rattrapage le lendemain), clôture (refus, admission),
  finalisation atomique (reproduction du défaut avec un déclencheur qui échoue), rattrapage
  à la lecture, script de rattrapage en simulation.
- Mails : FR et EN, vocabulaire, liens, regroupement.
- Chromium : formulaire fermé et rouvert par la coach, liste des événements, section
  « Ta préparation » (cocher, note, échéances, mobile), onglet coach, paramètres.
- Chaque livraison passe une relecture indépendante (trois lecteurs, chaque trouvaille
  contestée par deux sceptiques) avant la fusion.

## Mise en production

Les migrations ne font qu'ajouter, appliquées avant le démarrage du code (voir
`docs/deploy-vps.md`). Tant que `interest_deadline` et `rehearsal_date` ne sont pas
réglées, le comportement est celui d'aujourd'hui, sauf la liste des événements (livraison
A). Ordre : A (le formulaire se ferme et la finalisation devient fiable), B, C, puis D
une fois les textes relus par l'équipe, E en dernier. Les relances automatiques ne
partent qu'après réglage de `calendar_reminders_enabled`, vérifié d'abord sur la
préproduction (sans envoi réel).

## Questions ouvertes (valeurs par défaut retenues)

1. La date limite des intérêts est une **nouvelle** date, distincte de la date interne.
2. La répétition est décrite par un champ libre (en ligne ou sur place).
3. Aucune exception automatique à la clôture ; la coach peut admettre un dossier.
4. Heure limite : 23 h 59 à Douala.
5. Les dossiers sur « Autre » ou sur un événement sans date sont listés, pas modifiés.
6. Les textes des tâches et des relances sont un premier jet à relire par l'équipe.
