# Migration de SheSpeaks de Vercel + Supabase vers le VPS partagé

Date : 2026-10-10 · Statut : conception validée, en attente de relecture

## Pourquoi

Le back-office est lent et se bloque par moments. La cause tient à
l'hébergement plus qu'au code :

- les fonctions Vercel gèlent entre deux clics d'une coach : à chaque reprise,
  il faut rouvrir des connexions (TLS + pooler Supabase), ou l'on tombe sur une
  connexion coupée pendant le gel (les blocages traités dans #28 et #30) ;
- chaque page enchaîne plusieurs requêtes, et chaque aller-retour vers la base
  coûte cher quand elle est loin.

Sur le VPS, la base tourne sur la même machine que l'app, à moins d'une
milliseconde, et les connexions restent ouvertes en permanence. Les deux causes
disparaissent sans réécrire l'app.

## Ce qui est décidé

| Sujet | Décision |
|---|---|
| Machine | Le VPS Contabo partagé (`77.237.234.91`, alias SSH `deploy-vps`), qui héberge déjà gabee, celva, lehno et proxiapay. Capacité vérifiée le 2026-10-10 : 6 cœurs, 8,9 Go de RAM libres, 164 Go de disque libres, charge 0,2 |
| Domaine prod | `sheleads.techiesconnect.org` (DNS Cloudflare). Aucun enregistrement n'existe aujourd'hui pour ce nom |
| Domaine preprod | `preprod.sheleads.techiesconnect.org` |
| Environnements | Prod (tag `v*`) et preprod (push sur `develop`), chacun avec sa base, ses photos et ses secrets |
| Bascule | « Bascule éclair » : 1 à 3 minutes à une heure creuse, page d'attente qui se recharge seule, sans perte de données |
| Ce qui reste | Resend (mails) et Anthropic (suggestions de titres) ne changent pas |
| Ce qui part | Vercel (sauf une redirection de l'ancienne adresse) et Supabase (base et stockage des photos) |

## 1. Ce qui tourne sur le VPS

Deux projets Compose isolés, dans `/home/deploy/shespeaks` :

- `docker compose -p shespeaks --env-file .env.production …` (prod) ;
- `docker compose -p shespeaks-preprod --env-file .env.preprod …` (preprod).

Les fichiers `.env.*` restent sur le VPS (chmod 600), ne sont pas versionnés et
survivent aux `git checkout`.

Services d'un projet :

| Service | Rôle |
|---|---|
| `db` | `postgres:16-alpine`, volume nommé, aucun port publié hors de Docker, limite mémoire 256 Mo |
| `migrate` | Même image que `app` ; lance la vérification d'environnement puis `scripts/db.mjs deploy` (migrations + seed), puis s'arrête. `app` dépend de son succès (`service_completed_successfully`) |
| `app` | `node server.js` (Next `standalone`), image `ghcr.io/iamvaln/shespeaks`, sur le réseau externe `web` avec les labels Traefik, volume `uploads` monté sur `DATA_DIR`, healthcheck sur `/api/health`, limite mémoire 512 Mo |
| `maintenance` | `nginx:alpine` avec une page HTML unique (« On revient dans un instant », FR/EN, code 503, rechargement automatique toutes les 15 s). Même domaine que `app`, priorité Traefik plus basse : il ne répond que quand `app` est arrêté ou en mauvaise santé |
| `cron` | Petit conteneur qui appelle `POST http://app:3000/api/cron/reminders` avec `Authorization: Bearer $CRON_SECRET` chaque jour à 07:00 UTC (remplace le cron de `vercel.json`). Désactivé en preprod par défaut (profil Compose), pour ne jamais relancer de vraies candidates |
| `backup` | Prod seulement. Voir section 4 |

Tous les conteneurs : journaux json-file en rotation, 10 Mo × 3 fichiers.

Le Traefik partagé (`proxy-traefik-1`, v3.7.1) délivre les certificats Let's
Encrypt. Les enregistrements Cloudflare `sheleads` et `preprod.sheleads` sont
de type A vers `77.237.234.91`, en **DNS only** (nuage gris) : le proxy de
Cloudflare bloquerait le défi ACME, et le certificat universel de Cloudflare ne
couvre pas un sous-domaine de second niveau.

## 2. Changements dans le code

### Build et image

- `next.config.mjs` : `output: 'standalone'`.
- `Dockerfile` multi-étapes, Node 22 (le projet exige ≥ 22.18) :
  dépendances → build → image d'exécution avec `.next/standalone`,
  `.next/static`, `public/`, plus `scripts/`, `supabase/migrations/` et les
  modules de `src/lib` qu'importent `scripts/db.mjs` et `check-env.mjs`. L'image
  tourne sous un utilisateur non root.
- `.dockerignore`.
- `package.json` : le `prebuild` qui lançait `db:deploy` est retiré ; la
  vérification d'environnement passe dans `migrate`.

### Connexion à la base (`src/lib/db.ts`)

- Le SSL ne se devine plus d'après le nom d'hôte (aujourd'hui, tout hôte autre
  que `localhost` force `ssl: 'require'`, ce qui casserait la connexion à
  l'hôte Docker `db`). Il suit `sslmode` dans l'URL : `disable` → pas de SSL,
  absent ou `require` → SSL comme aujourd'hui. Les URL du VPS portent
  `?sslmode=disable`.
- Pool : `max: 10` (connexions persistantes vers une base locale).
- Les délais d'expiration (`DB_QUERY_TIMEOUT_MS`, transactions) restent.
- `prepare: false` reste : sans pooler il n'est plus requis, mais le changer
  n'apporte rien de mesurable ici et ferait une différence de plus entre
  avant et après la bascule.

### Environnement (`src/lib/env.ts`, `scripts/check-env.mjs`)

- « Production » se détecte avec `NODE_ENV=production` (ou `--strict`), plus
  avec `VERCEL`.
- L'avertissement « utilise le port 6543 » disparaît.
- `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` ne sont plus exigés en
  production.
- `APP_URL` devient obligatoire en production (le repli sur les URL Vercel
  reste dans le code jusqu'au nettoyage, mais il ne s'appliquera plus).

### Santé

- `src/app/api/health/route.ts` : `SELECT 1` avec un délai court ; 200 si la
  base répond, 503 sinon. Pas d'authentification, aucune donnée renvoyée.

### Photos

Aucun changement : le mode disque local existe déjà et fonctionne de bout en
bout (`storageMode()` vaut `local` dès que `SUPABASE_URL` est absent ;
`signUpload` répond `mode: 'local'`, le navigateur envoie à `/api/diag/photo`,
`/api/photos/[id]` sert le fichier après contrôle des droits). Les fichiers
vivent dans le volume `uploads`, au chemin enregistré dans `photos.filename`
(`<candidateId>/<uuid>.<ext>`), le même que dans le bucket Supabase.

### Redirection de l'ancienne adresse (branche `vercel-redirect`)

Une mini-app Next qui ne contient qu'un middleware, déployée sur le **même
projet Vercel** que la prod actuelle, construite d'avance sans être promue :

- cookie candidate présent → redirection 307 vers
  `https://sheleads.techiesconnect.org/reprendre/<jeton>` : la candidate
  retrouve sa session (le cookie contient le jeton, et `/reprendre` le repose
  sur le nouveau domaine) ;
- sinon → redirection 308 vers le même chemin et la même requête sur
  `sheleads.techiesconnect.org`. Les liens `/reprendre/<jeton>` des mails déjà
  envoyés continuent donc de fonctionner.

Les coachs perdent leur session et se reconnectent par lien magique.

Cette redirection reste en place tant que des liens vers l'ancienne adresse
peuvent circuler (au moins jusqu'à la fin de la saison en cours).

### Pas touché dans cette migration

Le code du stockage Supabase et la dépendance `@supabase/supabase-js` restent
jusqu'à la PR de nettoyage, pour garder une marche arrière possible.

## 3. Déploiement continu et bascule

### Déploiement continu

- `ci.yml` : inchangé sur le fond (typecheck, tests, tests de base, build,
  smoke) ; on retire ce qui suppose Vercel, et on ajoute un job qui construit
  l'image Docker et lance `scripts/smoke.mjs` contre le conteneur.
- `deploy.yml` (nouveau) :
  - push sur `develop` → image `shespeaks:develop` → déploiement preprod ;
  - tag `v*` → images `shespeaks:vX.Y.Z` et `latest` → déploiement prod.
- Déploiement : SSH vers `deploy@77.237.234.91`, `git fetch && git checkout
  <ref>`, connexion à GHCR avec le `GITHUB_TOKEN` du run, puis
  `docker compose pull && docker compose up -d`. Si `migrate` échoue, `app`
  n'est pas recréé et l'ancienne version continue de servir.
- Clé SSH dédiée (`~/.ssh/shespeaks_deploy`), installée sur l'utilisateur
  `deploy` ; secrets du dépôt `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.
- Chaque déploiement est suivi jusqu'au bout (`gh run watch`, puis vérification
  de la conclusion du run), pas seulement lancé.

### Script de bascule (`ops/cutover.sh`, lancé depuis un poste de travail)

Préalables, vérifiés par le script avant toute action :

- la prod tourne sur le VPS avec l'image validée en preprod, base migrée et
  vide ;
- `sheleads.techiesconnect.org` résout vers le VPS et sert un certificat
  valide ;
- la copie en masse des photos (`ops/sync-photos`) est faite ;
- le déploiement `vercel-redirect` existe sur Vercel, non promu ;
- les variables `SUPABASE_DB_URL` (pooler en mode session, port 5432) et
  `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` sont disponibles pour le
  script, pas pour l'app.

Étapes :

1. `docker compose stop app` → Traefik sert la page d'attente.
2. Le script s'arrête et demande de **promouvoir `vercel-redirect`** dans
   Vercel, puis attend 10 s après confirmation. À partir de là, plus rien
   n'écrit dans Supabase.
3. Copie de la base : `pg_dump --data-only --schema=public` depuis Supabase
   (conteneur `postgres` d'une version au moins égale à celle du serveur,
   relevée pendant la répétition), en excluant `schema_migrations` ; puis, sur
   le VPS, dans une transaction : `TRUNCATE` des tables applicatives et
   restauration. Le dump contient les `setval` qui recalent les séquences.
4. Rattrapage des photos : téléchargement des objets du bucket absents du
   volume `uploads`.
5. Contrôles, bloquants :
   - nombre de lignes identique pour chaque table entre Supabase et le VPS ;
   - un fichier présent dans `uploads` pour chaque ligne de `photos` ;
   - relevé du domaine utilisé dans les liens de `email_log` (affiché, pour
     confirmer que la redirection le couvre).
6. `docker compose start app`, attente du healthcheck, puis smoke test
   (accueil, `/interet`, `/admin/login`, `/api/health`).

Marche arrière :

- jusqu'à l'étape 6 : re-promouvoir l'ancien déploiement de prod dans Vercel.
  Supabase n'a jamais été modifiée, rien n'est perdu ;
- après l'ouverture : un retour ferait perdre les écritures faites sur le VPS.
  Supabase reste intacte, sans être modifiée, deux semaines, puis le projet est
  supprimé.

Pendant la fenêtre, une candidate qui clique « Suivant » reçoit un message
d'erreur ; ce qu'elle a saisi reste dans le formulaire et elle réessaie.

### Répétition générale (avant le jour J)

- Le script tourne en entier vers la **preprod**, avec une vraie copie des
  données de prod, sauf l'étape Vercel (sautée par une option `--rehearsal`).
  On note la durée de chaque étape et la version de `pg_dump` nécessaire.
- Restauration d'une sauvegarde R2 dans la preprod (section 4).
- Vérification manuelle en preprod : formulaire complet, envoi de photo,
  connexion coach, cron déclenché à la main avec les mails redirigés.
- La preprod est vidée ensuite : aucune donnée personnelle n'y reste.

## 4. Sauvegardes et exploitation

- **Sauvegardes** : service `backup` repris de `ops/backup` de lehno. Chaque
  nuit à 02:00 UTC, `pg_dump -Fc` de la base et `tar` du volume `uploads`,
  envoyés vers un compartiment R2 dédié (jeton limité à ce compartiment).
  Rétention : 14 quotidiennes et 8 hebdomadaires. Les journaux du service
  disent « uploaded » ou « FAILED ».
- **Restauration** documentée dans le README et testée pendant la répétition.
- **Diagnostics** documentés dans le README : `docker compose logs app`,
  `logs cron`, `logs backup`, `psql` en lecture seule dans `db`, relance
  manuelle du cron.
- **Documentation** : le README remplace la section Vercel par « Déploiement
  sur le VPS » (premier déploiement, variables, diagnostics, restauration) ;
  `.env.example` décrit les variables du VPS.

## 5. Tests

- Local : `docker compose up` fait tourner tout le parcours avec la même image
  que la prod (migration, formulaire, photo, relances).
- CI : tests existants, plus construction de l'image et smoke test contre le
  conteneur.
- Unitaires : la détection du SSL d'après `sslmode` et les nouvelles règles de
  `checkEnv` (`tests/env.test.ts`).
- Preprod : la répétition générale ci-dessus.

## Ce dont j'ai besoin de toi

- Créer les enregistrements DNS `sheleads` et `preprod.sheleads` (A →
  `77.237.234.91`, DNS only) dans Cloudflare, ou me donner un jeton API
  Cloudflare limité à `techiesconnect.org`.
- Créer le compartiment R2 des sauvegardes et un jeton limité à celui-ci.
- Récupérer dans Vercel les valeurs de production à reporter sur le VPS
  (`SESSION_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`,
  `ANTHROPIC_API_KEY`, `ADMIN_EMAIL`) et la chaîne de connexion Supabase en
  mode session. `SESSION_SECRET` doit être repris tel quel : il sert aussi à
  fabriquer les clés de la table `rate_limits`, copiée telle quelle, et les
  limites en cours (suggestions IA par jour, demandes de lien) seraient
  remises à zéro avec un nouveau secret.
- Promouvoir `vercel-redirect` le jour J (ou installer la CLI Vercel).
- Choisir le créneau de bascule.

## Hors périmètre

- PR de nettoyage après la bascule : retrait du code Supabase, de
  `@supabase/supabase-js`, de `vercel.json` et des replis sur les URL Vercel ;
  suppression du projet Supabase après deux semaines.
- Les autres correctifs de l'audit du 2026-10-10. La migration règle d'elle-même
  le `prebuild` qui migre la prod depuis les previews, ainsi que la région et
  le gel des instances Vercel.
