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
| Aucune envoyée | modifiable, onglet « Sujet » |
| Envoyée, en attente de sa réponse | consultation (verrou existant) |
| **Elle a choisi** | **consultation** (nouveau) |
| Elle a répondu « aucune ne me convient » | modifiable : la coach prépare la série suivante |
| Sujet approuvé, candidature soumise | consultation (verrou existant) |

- **Consultation** : le bloc quitte l'onglet « Sujet » et va dans un onglet **« Pistes envoyées »**,
  placé après « Réponses », visible seulement quand le bloc n'est pas modifiable. Il montre les
  pistes telles qu'elles sont, sans aucun bouton d'écriture, avec la mention du verrou, la piste
  que la candidate a choisie et, pour la dernière série, son retour.
- L'onglet « Sujet » renvoie vers lui par une ligne dans « Échanges avec la candidate ».
- **Retour en arrière** : « Rouvrir les échanges » (existant) rend le bloc modifiable. Il est
  proposé aussi quand le seul verrou est « elle a choisi », avec le même texte de confirmation.
  Une nouvelle série envoyée puis choisie referme le bloc.
- Le serveur refuse les écritures sur les pistes (ajouter, régénérer, retenir, écarter, rétablir,
  choisir, enregistrer, supprimer, suggestions par IA, envoi d'une série) tant que le bloc est en
  consultation, avec le même message que l'écran.
- Points de départ C et D : pas de bloc de pistes, rien ne change.

## Hors périmètre

- La limite à deux séries (la dernière : elle choisit ou la coach la disqualifie) : chantier à part.
- Le bouton « Choisir » de la coach ne sert plus après le choix de la candidate : le sujet se remplit
  à partir de ce qu'elle a choisi. Il disparaît avec le reste en consultation.

## Tests

- Fonction pure : aucune série, en attente, choisie, « aucune », nouvelle série choisie, échanges
  rouverts avant ou après le choix, points de départ C et D.
- Base de données : l'envoi d'une série et l'écriture des pistes sont refusés après le choix ;
  « Rouvrir les échanges » est accepté, puis la série suivante ; « aucune » laisse la main.
- Chromium : onglet présent ou non selon l'état, aucun bouton d'écriture dans l'onglet, bloc
  modifiable de retour dans « Sujet » après « aucune », 390 px.
