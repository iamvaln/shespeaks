# Pistes envoyées : en consultation, plus modifiables

Date : 2026-10-14 · Demande de la propriétaire : « quand on a déjà soumis les pistes à la
candidate, ces dernières ne sont plus éditables ; le bloc peut même être déplacé dans un onglet plus
loin, juste pour la consultation ».

## Constat

Dans la fiche (points de départ A et B), le bloc « Pistes de sujet » reste modifiable dès que la
candidate a répondu : après « a choisi un sujet », la coach peut encore réécrire, écarter, ajouter
des pistes et même renvoyer une série, alors que la candidate a déjà choisi parmi les pistes
envoyées. Seule l'attente d'une réponse, l'approbation du sujet et la soumission verrouillent le bloc.

## Règle

Une **série** de pistes = l'envoi « pistes retenues » (une proposition `choix`) et la réponse qui suit.

| État de la dernière série | Le bloc des pistes |
|---|---|
| Aucune envoyée | modifiable, onglet « Sujet et pistes » |
| Envoyée, en attente de sa réponse | consultation (verrou existant) |
| **Elle a choisi** | **consultation** (nouveau) |
| Elle a répondu « aucune ne me convient » | modifiable : la coach prépare la série suivante |
| Sujet approuvé, candidature soumise | consultation (verrou existant) |

- **Consultation** : le bloc quitte l'onglet « Sujet et pistes » (qui devient « Sujet ») et va dans un
  onglet **« Pistes envoyées »**, placé après « Réponses », visible seulement quand le bloc n'est pas
  modifiable **et** qu'une série a réellement été envoyée (un statut posé à la main sans échange
  ne crée pas d'onglet : le bloc reste en lecture seule où il était). Il montre les pistes telles
  qu'elles sont, sans bouton d'écriture, avec la raison du verrou et la piste choisie (pastille
  « Son choix », retrouvée par sa place dans la série envoyée). Sa réponse complète (idées,
  commentaire) reste dans « Échanges avec la candidate », que l'en-tête de l'onglet relie.
- L'onglet « Sujet » renvoie vers l'onglet des pistes par une ligne dans « Échanges avec la candidate ».
- Les actions faites depuis cet onglet (suivi, rappel, admission tardive) y ramènent la coach.
- **Retour en arrière** : « Rouvrir les échanges » (existant) rend le bloc modifiable. Il est
  proposé aussi quand le seul verrou est « elle a choisi », dans l'onglet « Sujet » et dans l'onglet
  des pistes (même texte de confirmation) ; depuis ce dernier, la page revient sur la fiche avec le
  message. Une nouvelle série envoyée puis choisie referme le bloc. Les horodatages étant à la
  seconde, une réouverture dans la seconde même de sa réponse laisse la main à la coach (jamais
  d'impasse). Rouvrir pour ses pistes a l'effet de toute réouverture : seule sa propre confirmation
  compte de nouveau comme soumission.
- Le serveur refuse les écritures sur les pistes (ajouter, régénérer, retenir, écarter, rétablir,
  choisir, enregistrer, supprimer, suggestions par IA, envoi d'une série) tant que le bloc est en
  consultation, avec le même message que l'écran. Un seul garde, `tracksWriteRefusal` (le verrou des
  échanges d'abord, puis « elle a choisi »), est utilisé par les deux actions et testé en base ; les
  actions elles-mêmes ne sont pas importables dans les tests.
- Points de départ C et D : pas de bloc de pistes, rien ne change (l'onglet garde son nom).
- **Le sujet suit son choix** : à sa réponse « choisie », le titre et le format du sujet reprennent
  la piste choisie quand le sujet est vide ou porte encore le choix d'une série précédente ; un
  titre que la coach a écrit n'est jamais remplacé. C'est ce qui remplace le bouton « Choisir ».

## Hors périmètre

- La limite à deux séries (la dernière : elle choisit ou la coach la disqualifie) : chantier à part.
- Le bouton « Choisir » de la coach ne sert plus après le choix de la candidate : le sujet se remplit
  à partir de ce qu'elle a choisi (voir plus haut). Il disparaît avec le reste en consultation.

## Tests

- Fonctions pures : la règle (aucune série, en attente, choisie, « aucune », nouvelle série choisie,
  échanges rouverts avant, après ou dans la même seconde que le choix, points de départ C et D) et
  les onglets (`ficheTabs` : onglet propre seulement si lecture seule et série envoyée, place après
  « Réponses », libellés, C et D inchangés).
- Base de données : le garde `tracksWriteRefusal` (rien, en attente, choisie, « aucune », rouverte,
  inconnue), l'envoi d'une série refusé après le choix, « Rouvrir les échanges » accepté puis la
  série suivante, « aucune » laisse la main, le sujet suit son choix.
- Chromium (scripts de contrôle hors dépôt) : onglet présent ou non selon l'état, aucun bouton
  d'écriture, retour sur la bonne page, 390 px.
