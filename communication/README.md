# Communication SheSpeaks

Supports de communication du programme (vidéos d'annonce, visuels). Rien ici n'est servi par l'application.

## Vidéos animées

Deux épisodes verticaux (1080 × 1920, 9:16, pour statuts WhatsApp, Reels, Stories), en français et en anglais, prêts dans `exports/` :

| Fichier | Version |
|---|---|
| `exports/episode1.mp4` · `exports/episode1-en.mp4` | Épisode 1, FR · EN |
| `exports/episode2.mp4` · `exports/episode2-en.mp4` | Épisode 2, FR · EN |
| `exports/covers/episode1-cover.png` … `episode2-cover-en.png` | Images de couverture (1080 × 1920) à téléverser comme miniature sur Instagram, TikTok, LinkedIn |

Les vidéos ne commencent pas par un fondu au noir : leur première image sert d'aperçu (statut WhatsApp).


| Épisode | Histoire | État |
|---|---|---|
| 1 · « Ce que j'ai fait hier » (29 s) | Dans la foule d'une conférence tech, elle n'ose pas prendre la parole ; sa voisine lui montre SheSpeaks ; elle soumet son intérêt. | Fait |
| 2 · « Et après ? » (30 s) | Les idées de sujets envoyées par l'équipe, la grille de relecture, la candidature au DevFest, le talk retenu, la répétition avec une coach, le Jour J, puis une autre fille dans le public qui rêve à son tour. | Fait |

Fil rouge visuel : elle est grise au début, l'ambre gagne sa silhouette à mesure qu'elle avance (élastique, sweat), jusqu'à l'ellipse ambre de la scène au Jour J.

### Fabrication

Chaque épisode est une page HTML : des personnages en SVG animés en fonction du temps (`video/lib/characters.js`), sur la charte du site (nuit `#111528`, ambre `#F5A524`, Archivo, IBM Plex Mono). L'animation est écrite en « temps d'histoire » ; le montage (`SS.edl`, en tête de `episode1.js` et `episode2.js`) choisit les passages, leur vitesse et les arrêts sur image, et tient chaque épisode sous **30 s** (limite d'un statut WhatsApp).

```bash
cd communication/video
npm install                                     # puppeteer-core + ffmpeg précompilé, utilise Google Chrome installé
node render.mjs episode1.html                   # → communication/exports/episode1.mp4 (idem episode2.html)
node render.mjs episode1.html --lang en         # → communication/exports/episode1-en.mp4
node render.mjs episode1-cover.html --cover     # → communication/exports/covers/episode1-cover.png (--lang en aussi)
node render.mjs episode1.html --stills 2,4.5    # images fixes pour relire un moment précis (→ exports/stills/, non versionné)
```

Pour prévisualiser sans rendu : ouvrir `video/episode1.html` dans Chrome (lecture en boucle ; `?t=4.2` fige une image, `?lang=en` passe en anglais). Les textes sont écrits `SS.t('français', 'english')` ; les écrans du téléphone reprennent les vrais libellés de l'app (`src/lib/i18n.ts`, `src/lib/questions.ts`).

La vidéo sort **sans son** : ajouter une musique libre de droits au montage (CapCut, Instagram…).
