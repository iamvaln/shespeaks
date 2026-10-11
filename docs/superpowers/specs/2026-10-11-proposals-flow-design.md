# Parcours de propositions entre la coach et la candidate

Date : 2026-10-11 · Statut : conception validée, en attente de relecture

## Pourquoi

Aujourd'hui, quand une coach enregistre un sujet sur la fiche, rien ne se passe
pour la candidate : pas de mail, pas d'explication, pas de recommandations sur
la façon d'aborder le sujet, pas de moyen de dire si elle est d'accord. La suite
(photo de speaker, soumission à l'appel à speakers) ne s'enchaîne pas non plus.

Le but : un aller-retour suivi entre la coach et la candidate, dans l'espace de
la candidate, jusqu'à un sujet qu'elle approuve, une photo validée et une
candidature soumise, avec l'historique visible des deux côtés.

## Décisions

| Sujet | Décision |
|---|---|
| Périmètre | Un seul mécanisme pour toutes les candidates |
| Branches A et B | La coach envoie 2 ou 3 sujets ; la candidate choisit ; la coach développe le sujet choisi puis l'envoie comme sujet ajusté |
| Sujet ajusté (C, D, ou A/B après leur choix) | Titre, résumé, « Pourquoi ces changements », « Comment t'y prendre » ; la candidate approuve ou refuse avec un commentaire ; la coach renvoie jusqu'à l'accord |
| Photo | La coach valide une photo ou demande une autre photo avec un commentaire ; même aller-retour |
| Soumission | La candidate soumet elle-même sur la plateforme de l'événement, puis clique « J'ai soumis ma candidature » |
| Construction | Un journal des échanges (table `proposals`) ; l'étape courante est calculée, jamais stockée |
| IA | Jamais mentionnée côté candidate : tout vient de « ta coach » |
| Hors périmètre | Les correctifs des relances (doublon, relance WhatsApp, résumé coach) : issue #47 |

## Les étapes

1. **Intérêt reçu** : formulaire terminé.
2. **Choix du sujet** (A et B seulement) : la coach envoie 2 ou 3 sujets, la
   candidate en choisit un ou répond qu'aucun ne lui convient (commentaire
   obligatoire). Dans les deux cas la main revient à la coach.
3. **Sujet à valider** : la coach envoie un sujet ajusté ; la candidate approuve
   ou demande des changements (commentaire obligatoire).
4. **Photo** : la coach valide une photo, ou demande une autre photo avec un
   commentaire ; la candidate dépose une nouvelle photo.
5. **Soumission** : sujet approuvé et photo validée ; la candidate soumet sur la
   plateforme de l'événement puis confirme.
6. **Candidature soumise**.

L'étape courante se déduit des données (dernière proposition de chaque type,
`photo_validated_at`, `submitted_at`) par une fonction pure et testée,
`journeyStep(candidate, proposals, subject)`.

Une seule proposition **en attente** par type : en envoyer une nouvelle passe la
précédente à « remplacée ».

## 1. L'espace de la candidate (`/plan`)

Trois blocs s'ajoutent en haut de la page, au-dessus du plan de route et des
photos.

**« Où tu en es »** : la frise des étapes ci-dessus (l'étape 2 seulement pour
A et B), l'étape courante mise en évidence.

**« À faire maintenant »** : la carte de l'échange en attente.

- **Choix de sujets** : 2 ou 3 cartes, chacune avec le titre, le format et la
  phrase de la coach « pourquoi ce sujet t'irait ». Un bouton « Je choisis ce
  sujet » par carte (commentaire facultatif), ou « Aucun ne me convient »
  (commentaire obligatoire).
- **Sujet ajusté** : titre, résumé, « Pourquoi ces changements », « Comment t'y
  prendre » (étapes numérotées). « J'approuve ce sujet », ou « Je souhaite des
  changements » (commentaire obligatoire).
- **Photo demandée** : le commentaire de la coach et le dépôt de photo existant.
  Après dépôt, ou sans demande : « Ta photo est en cours de validation ».
- **Soumission** : titre et résumé validés avec un bouton « Copier » chacun, la
  photo validée à télécharger, le lien de l'appel à speakers et sa date limite,
  puis « J'ai soumis ma candidature ».
- **Rien à faire** : « L'équipe prépare ta proposition, tu recevras un email. »

**« Historique »** : les échanges datés, le contenu envoyé (dépliable), sa
réponse et son commentaire. Une carte répondue se fige et passe dans
l'historique.

Tous les textes existent en français et en anglais (`src/lib/i18n.ts`).

### Retrouver son espace (`/acces`)

- Liens depuis l'accueil, le début du formulaire (« Tu as déjà commencé ?
  Retrouve ton espace ») et toute page qui exige une session.
- Elle tape son email ; si un ou plusieurs parcours existent avec cette adresse
  (même boîte, au sens de `mailboxKey`), un mail lui envoie son ou ses liens
  `/reprendre/<jeton>`, avec l'événement et la date de chacun.
- Même réponse et même durée que l'adresse existe ou non (« Si cette adresse est
  connue, tu vas recevoir un email »), comme la connexion des coachs
  (`deferMail`) ; plafonds par adresse et par IP (`src/lib/ratelimit.ts`) ; le
  lien n'est jamais affiché à l'écran.
- Sans accès à sa boîte : sur la fiche, « Envoyer son lien d'accès sur
  WhatsApp » ouvre un lien `wa.me` vers son numéro enregistré, avec un message
  prérempli contenant son lien.

## 2. La fiche côté coach

**Bloc « Échanges avec la candidate »**, en tête de l'onglet « Sujet et
pistes » : l'étape courante, ce qu'on attend et de qui, l'historique (le même que
celui de la candidate), et « Marquer comme traité » sur une réponse.

**Choix de sujets (A et B)**, depuis la liste des pistes :

1. Les pistes **retenues** (« Retenir », y compris les suggestions de l'IA) sont
   celles qui partiront.
2. Chaque piste retenue a son titre, son format et un nouveau champ « Pour la
   candidate : pourquoi ce sujet lui irait » (`tracks.pitch`), qu'on ajuste et
   enregistre une par une.
3. « Envoyer les pistes retenues à la candidate (N) » : actif avec 2 ou 3 pistes
   retenues ayant chacune un titre et une phrase ; une confirmation récapitule
   l'envoi ; une **copie figée** part.

Le champ « Pour la candidate » est prérempli quand une suggestion de l'IA est
retenue : l'explication de l'IA (`hook`, écrite pour la coach) sert de point de
départ, la coach la réécrit pour la candidate.

**Sujet ajusté**, depuis « Sujet retenu » : sous titre et résumé, deux champs
« Pourquoi ces changements » (`subjects.why`) et « Comment t'y prendre »
(`subjects.plan`, une étape par ligne). La proposition d'amélioration de l'IA
les préremplit (sa note et son plan, via « Utiliser ») ; la coach ajuste et
enregistre autant qu'elle veut, puis « Envoyer à la candidate pour
validation » (confirmation, copie figée). L'envoi exige un titre et un résumé.

**Photo**, dans l'onglet Photos : « Valider cette photo » sur la photo choisie
(`candidates.photo_validated_at`, `selected_photo_id`), ou « Demander une autre
photo » avec un commentaire obligatoire.

**Soumission** : « En attente de sa soumission » jusqu'à sa confirmation.

Rien ne part jamais automatiquement : seule la coach envoie.

## 3. Mails, notifications, statut

**Mails à la candidate** (sa langue, son lien personnel) :

| Événement | Objet |
|---|---|
| Choix de sujets envoyé | « Ta coach te propose des sujets » |
| Sujet ajusté envoyé | « Ton sujet ajusté est prêt : dis-nous s'il te convient » |
| Autre photo demandée | « Une nouvelle photo, s'il te plaît » (avec le commentaire) |
| Sujet approuvé et photo validée | « Tout est prêt : tu peux soumettre ta candidature » (titre, résumé, lien de l'appel, date limite) |
| Demande sur `/acces` | « Ton lien pour retrouver ton espace » |

**Relance** : une proposition sans réponse depuis 48 h déclenche **un** rappel
automatique, dans la tournée quotidienne existante ; le résumé des coachs le
signale.

**Notifications aux coachs** (coach assignée, sinon les destinataires des
alertes actuelles), avec le lien de la fiche : sujet choisi ou aucun (avec le
commentaire), sujet approuvé ou changements demandés (avec le commentaire),
nouvelle photo déposée, soumission confirmée.

**« À traiter »** : une réponse de la candidate l'est jusqu'à ce que la coach
envoie la proposition suivante ou clique « Marquer comme traité » ; elle compte
dans le compteur du menu et le tableau de bord.

**Statut** (jamais en arrière, la coach garde la main) : sujet approuvé →
« Sujet validé » ; soumission confirmée → « Candidature soumise ». Chaque
avancée est inscrite dans `status_history` (auteur « la candidate » ou
« automatique »).

## 4. Données, sécurité, tests

**Migration additive** :

- `proposals` : `id`, `candidate_id` (→ candidates, cascade), `kind`
  (`choix` | `sujet` | `photo`), `payload` (JSON, copie figée de l'envoi),
  `state` (`envoyee` | `repondue` | `remplacee`), `response`
  (`choisie` | `aucune` | `approuvee` | `changements` | `photo_deposee`),
  `response_choice` (index du sujet choisi), `candidate_comment`, `coach_id`,
  `sent_at`, `answered_at`, `handled_at`, `reminded_at`.
- `tracks.pitch`, `subjects.why`, `subjects.plan`,
  `candidates.photo_validated_at`, `candidates.submitted_at`.

**Sécurité** :

- Les actions de la candidate passent par sa session (cookie `ss_token`) ;
  chaque réponse vérifie que la proposition lui appartient et est en attente, et
  s'enregistre en une opération atomique (`UPDATE … WHERE state='envoyee'
  RETURNING`) : ni double réponse, ni réponse à une proposition remplacée.
- `/acces` : anti-énumération, plafonds, lien envoyé uniquement à l'adresse
  enregistrée.
- Commentaires plafonnés (1000 caractères), échappés à l'écran (React) et dans
  les mails (`esc`).
- La candidate ne voit que les copies figées, jamais les pistes vivantes.
- Le test « aucune mention de l'IA côté candidate » couvre les nouveaux textes et
  les nouveaux mails.

**Tests** :

- Unitaires : `journeyStep` pour chaque situation ; validation des envois (2 ou
  3 sujets, champs requis) ; textes FR et EN complets.
- Base de données : envoyer, répondre, remplacer ; double réponse refusée ;
  avancées du statut ; compteur « à traiter » ; relance unique à 48 h ; limites
  de `/acces`.
- Smoke test de bout en bout : choix envoyé → choisi → sujet ajusté →
  changements demandés → nouvel envoi → approuvé → photo validée → soumission
  confirmée.
- Préproduction : le parcours complet avec une candidate de test avant la prod.
