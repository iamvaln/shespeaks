# SheSpeaks sur le VPS : déployer, surveiller, restaurer, basculer

Ce document est pour l'équipe qui fait tourner l'application. Il décrit ce qui
existe dans le dépôt (`docker-compose.yml`, `Dockerfile`, `ops/`,
`.github/workflows/`). Toutes les commandes se lancent **sur le VPS**
(`ssh deploy-vps`), depuis le dossier de l'environnement, sauf mention
contraire :

| Environnement | Dossier sur le VPS | Fichier d'environnement | `STACK` | Adresse |
|---|---|---|---|---|
| Production | `~/shespeaks` | `.env.production` | `shespeaks` | https://sheleads.techiesconnect.org |
| Préproduction | `~/shespeaks-preprod` | `.env.preprod` | `shespeaks-preprod` | https://preprod.sheleads.techiesconnect.org |

Dans les exemples, `ENV` désigne le fichier d'environnement de l'environnement
visé. Pour la production, ajoutez `--profile prod` (il active `cron` et
`backup`) ; pour la préproduction, ne l'ajoutez pas.

## 1. Vue d'ensemble

### Services de `docker-compose.yml`

Un projet Compose par environnement, nommé par `STACK` (le fichier refuse de se
charger si `STACK` est vide).

| Service | Image | Rôle | Profil |
|---|---|---|---|
| `db` | `postgres:16-alpine` | Base Postgres (volume `pgdata`), réseau `internal` seulement. | toujours |
| `migrate` | `ghcr.io/iamvaln/shespeaks:<tag>` | Une fois par déploiement : vérifie l'environnement (`check-env.mjs --strict`) puis applique les migrations et le seed (`db.mjs setup`). L'application ne démarre que s'il réussit. | toujours |
| `app` | `ghcr.io/iamvaln/shespeaks:<tag>` | Le site (`node server.js`, port 3000). Photos dans le volume `uploads` (`/data/uploads`). Contrôle de santé : `/api/health`. Exposé par Traefik sur `APP_DOMAIN`. | toujours |
| `maintenance` | `nginx:1.27-alpine` | Page d'attente servie sur le même domaine avec une priorité plus basse : Traefik n'y route que lorsque `app` est arrêté ou non sain. | toujours |
| `cron` | `curlimages/curl` | Une fois par jour à `CRON_HOUR_UTC` (7 h UTC par défaut), appelle `POST http://app:3000/api/cron/reminders` avec `CRON_SECRET` (remplace le cron Vercel). | `prod` |
| `backup` | `ghcr.io/iamvaln/shespeaks-backup:<tag>` | Sauvegarde quotidienne de la base et des photos vers Cloudflare R2, plus une sauvegarde au démarrage. | `prod` |

Le réseau `web` est externe (celui de Traefik, partagé avec les autres projets
du VPS) ; `internal` est propre au projet. Les journaux sont limités à 3
fichiers de 10 Mo par service.

### Du code au serveur

| Événement GitHub | Environnement GitHub | Ce qui est déployé | Dossier |
|---|---|---|---|
| Push sur `develop` | `preprod` | images taguées `develop` | `~/shespeaks-preprod` |
| Tag `v*` (ex. `v1.0.0`) | `production` (**approbation manuelle exigée**) | images `shespeaks` et `shespeaks-backup`, taguées `v1.0.0` et `latest` | `~/shespeaks` |

`.github/workflows/deploy.yml` :

1. Le job `images` construit et pousse deux images vers `ghcr.io/iamvaln` :
   `shespeaks` (l'application) et `shespeaks-backup`.
2. Le job `deploy` se connecte en SSH au VPS, puis : `docker login ghcr.io`,
   `git fetch --tags origin` (avec un en-tête d'authentification portant le
   jeton du run, lecture seule), `git checkout --force` du tag ou de
   `origin/develop`, **garde** (le nom de projet que Compose annonce doit être
   `STACK`, sinon arrêt), `docker compose pull` (3 essais),
   `docker compose up -d --remove-orphans`, puis attente de l'état `healthy` de
   `<STACK>-app-1` (90 s au plus). Si l'application n'est pas saine, le run
   échoue et affiche les journaux de `migrate` et `app`.
3. Un seul déploiement à la fois par environnement
   (`concurrency: deploy-production` / `deploy-preprod`, sans annulation) : un
   second push attend la fin du premier.

`.github/workflows/ci.yml` tourne sur chaque PR et sur les pushs vers `develop`
et `main`. Deux jobs : tests complets contre un Postgres jetable (types, tests,
tests base, migrations deux fois, build, smoke) ; et construction des images
Docker (`shespeaks`, `shespeaks-backup`), migrations depuis l'image, démarrage
du conteneur et smoke test contre lui.

Les fichiers d'environnement du VPS ne contiennent **pas** de ligne
`IMAGE_TAG` : `deploy.yml` l'exporte à chaque déploiement.

## 2. Première installation d'un environnement

À faire une fois par environnement. Les étapes marquées **[compte]** demandent
un accès Cloudflare, Vercel, Supabase ou GitHub.

### 2.1 DNS **[compte]**

Dans Cloudflare (`techiesconnect.org`), créer deux enregistrements `A`, en
**DNS only** (nuage gris) :

- `sheleads` → `77.237.234.91`
- `preprod.sheleads` → `77.237.234.91`

Vérifier :

```bash
dig +short sheleads.techiesconnect.org @1.1.1.1
dig +short preprod.sheleads.techiesconnect.org @1.1.1.1
```

Les deux doivent répondre `77.237.234.91`.

### 2.2 Compartiment de sauvegarde **[compte]**

Dans Cloudflare R2, créer le compartiment `shespeaks-backups` et un jeton API
limité à ce compartiment (lecture et écriture d'objets). Noter l'identifiant de
compte, la clé d'accès et la clé secrète.

### 2.3 Valeurs à relever **[compte]**

- Vercel (Settings, Environment Variables, Production) : `SESSION_SECRET`,
  `CRON_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO`,
  `ANTHROPIC_API_KEY`, `ADMIN_EMAIL`, `ADMIN_NAME`.
- Supabase : la chaîne de connexion du pooler **en mode session** (port 5432),
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Elles ne servent qu'à la bascule
  (section 6).

### 2.4 Dossiers sur le VPS

Le dépôt doit être cloné en **HTTPS** : le déploiement fait son `git fetch` avec
un jeton dans un en-tête, ce qui ne marche pas avec un `origin` en SSH.

```bash
ssh deploy-vps 'for d in shespeaks shespeaks-preprod; do [ -d ~/$d ] || git clone https://github.com/iamvaln/shespeaks.git ~/$d; done'
ssh deploy-vps 'git -C ~/shespeaks remote get-url origin; git -C ~/shespeaks-preprod remote get-url origin'
```

Les deux adresses doivent commencer par `https://`. Si le dépôt est privé et
que le clone demande des identifiants, cloner avec un jeton en lecture, puis
retirer le jeton de l'adresse :
`git remote set-url origin https://github.com/iamvaln/shespeaks.git`.

### 2.5 Fichiers d'environnement

Depuis votre poste, dans le dépôt (le fichier modèle n'existe sur le VPS
qu'après la fusion de la branche) :

```bash
scp .env.compose.example deploy-vps:shespeaks/.env.production
scp .env.compose.example deploy-vps:shespeaks-preprod/.env.preprod
ssh deploy-vps 'chmod 600 ~/shespeaks/.env.production ~/shespeaks-preprod/.env.preprod'
ssh deploy-vps 'sed -i "/^IMAGE_TAG=/d" ~/shespeaks/.env.production ~/shespeaks-preprod/.env.preprod'
```

La dernière commande retire `IMAGE_TAG=local`, réservé aux essais en local.

Puis éditer chaque fichier sur le VPS (`ssh deploy-vps`, `nano
~/shespeaks/.env.production`). Générer les secrets sur le VPS :

```bash
openssl rand -hex 24   # POSTGRES_PASSWORD
openssl rand -hex 32   # SESSION_SECRET, CRON_SECRET (préproduction)
```

**Production** (`~/shespeaks/.env.production`) :

```
STACK=shespeaks
DEPLOY_ENV=production
APP_DOMAIN=sheleads.techiesconnect.org
APP_URL=https://sheleads.techiesconnect.org
POSTGRES_PASSWORD=<openssl rand -hex 24>
SESSION_SECRET=<la valeur de Vercel, inchangée>
CRON_SECRET=<la valeur de Vercel>
ADMIN_EMAIL=…            # valeurs de Vercel
ADMIN_NAME=…
RESEND_API_KEY=…
MAIL_FROM=…
MAIL_REPLY_TO=…
ANTHROPIC_API_KEY=…
BACKUP_R2_ACCOUNT_ID=…   # valeurs R2 (2.2)
BACKUP_R2_BUCKET=shespeaks-backups
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
```

**Préproduction** (`~/shespeaks-preprod/.env.preprod`) :

```
STACK=shespeaks-preprod
DEPLOY_ENV=preprod
APP_DOMAIN=preprod.sheleads.techiesconnect.org
APP_URL=https://preprod.sheleads.techiesconnect.org
POSTGRES_PASSWORD=<openssl rand -hex 24>
SESSION_SECRET=<neuf : openssl rand -hex 32>
CRON_SECRET=<neuf : openssl rand -hex 32>
ADMIN_EMAIL=…
ADMIN_NAME=…
RESEND_API_KEY=
ANTHROPIC_API_KEY=
```

Règles à ne pas rater (détail section 3) :

- `STACK` doit être exact dans chaque fichier : les garde-fous du déploiement et
  de la bascule comparent le projet Compose à `STACK` et s'arrêtent s'ils
  diffèrent.
- `POSTGRES_PASSWORD` en **hexadécimal** uniquement : il est inséré tel quel
  dans une URL de connexion.
- `APP_URL` ne doit pas être `localhost` : le serveur refuse de démarrer.
- Pas de ligne `IMAGE_TAG`.
- La préproduction n'envoie **aucun vrai mail** (`RESEND_API_KEY` vide) : les
  mails restent consultables dans l'espace coach, page Emails. Elle ne lance
  pas non plus le cron (le profil `prod` n'y est pas activé), donc aucune
  relance automatique.

### 2.6 Clé de déploiement et secrets GitHub **[compte]**

Depuis votre poste :

```bash
ssh-keygen -t ed25519 -f ~/.ssh/shespeaks_deploy -C "github-actions-shespeaks" -N ""
ssh deploy-vps 'cat >> ~/.ssh/authorized_keys' < ~/.ssh/shespeaks_deploy.pub
gh secret set VPS_SSH_KEY < ~/.ssh/shespeaks_deploy
gh secret set VPS_HOST --body 77.237.234.91
gh secret set VPS_USER --body deploy
```

Dans GitHub (Settings, Environments), créer les environnements `preprod` et
`production`. Sur `production`, activer **Required reviewers** : chaque
déploiement de production attend une approbation manuelle.

### 2.7 Premier déploiement

Rien ne démarre avant que les images existent. Fusionner la PR
`feat/migration-vps` dans `develop`, puis suivre le run :

```bash
gh run list --workflow Deploy --limit 1
gh run watch <id> --exit-status
gh run view <id> --json conclusion
curl -s https://preprod.sheleads.techiesconnect.org/api/health
```

Attendu : conclusion `success` et `{"ok":true}`.

Pour la production, créer un tag, puis approuver le déploiement dans GitHub
(onglet Actions, le run Deploy, bouton Review deployments) :

```bash
git tag v1.0.0
git push origin v1.0.0
```

Une production fraîchement installée ne contient que le seed : les données
arrivent par la bascule (section 6), qui exige que cette pile tourne déjà.

## 3. Variables

Fichier modèle : `.env.compose.example`. Aucune valeur entre guillemets.

| Variable | Rôle | D'où vient la valeur |
|---|---|---|
| `STACK` | Nom du projet Compose (préfixe des conteneurs, volumes, réseaux et routes Traefik). `shespeaks` ou `shespeaks-preprod`. Les garde-fous de `deploy.yml` et de `ops/cutover-remote.sh` s'arrêtent si le projet annoncé diffère. | Fixe. |
| `DEPLOY_ENV` | `production` ou `preprod`. Active les contrôles de contact stricts en production. | Fixe. |
| `APP_DOMAIN` | Domaine routé par Traefik. | DNS (2.1). |
| `APP_URL` | URL publique, utilisée dans les liens des mails. Pas de `localhost` (le serveur refuse de démarrer). | `https://` + `APP_DOMAIN`. |
| `IMAGE_TAG` | Tag des images. **Absent des fichiers du VPS** : `deploy.yml` l'exporte. `IMAGE_TAG=local` du modèle est réservé aux essais en local (`docker-compose.local.yml`). | Le déploiement. |
| `POSTGRES_PASSWORD` | Mot de passe de l'utilisateur `shespeaks`. **Hexadécimal seulement** (inséré dans une URL). | `openssl rand -hex 24`, généré sur le VPS. |
| `SESSION_SECRET` | Signe les sessions des coachs **et** sert de clé aux compteurs de la table `rate_limit_hits`. | Production : **la valeur de Vercel, inchangée**. Préproduction : neuve. |
| `CRON_SECRET` | Jeton Bearer de `/api/cron/reminders`. | Production : valeur de Vercel. Préproduction : neuve. |
| `ADMIN_EMAIL`, `ADMIN_NAME` | Premier coach, créé par le seed. | Vercel. |
| `RESEND_API_KEY` | Envoi des mails. **Vide = rien n'est envoyé**, les mails restent dans l'espace coach, page Emails. | Vercel (production) ; vide en préproduction. |
| `MAIL_FROM`, `MAIL_REPLY_TO` | Expéditeur (obligatoire et valide si `RESEND_API_KEY` est renseignée) et adresse de réponse. | Vercel. |
| `ANTHROPIC_API_KEY` | Suggestions de titres par l'IA. Vide = le bouton n'apparaît pas. | Vercel (production) ; vide en préproduction. |
| `STRICT_CONTACT_CHECKS` | Force (`1`) ou coupe (`0`) les contrôles de contact. Vide : actifs en production seulement. | Laisser vide. |
| `BACKUP_R2_ACCOUNT_ID`, `BACKUP_R2_BUCKET` | Compte et compartiment R2 des sauvegardes. | Cloudflare (2.2). Production seulement. |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Jeton R2 (transmis au conteneur `backup` sous les noms `AWS_*`). | Cloudflare (2.2). Production seulement. |

Variables facultatives, absentes du modèle (valeurs par défaut du compose) :

| Variable | Défaut | Rôle |
|---|---|---|
| `CRON_HOUR_UTC` | `7` | Heure (UTC) de l'envoi des relances. |
| `BACKUP_SCHEDULE_HOUR_UTC` | `2` | Heure (UTC) de la sauvegarde quotidienne. |
| `BACKUP_RETENTION_DAYS` | `14` | Les sauvegardes plus anciennes sont supprimées, sauf celles du dimanche, gardées 8 semaines. |
| `CERT_RESOLVER` | `le` | Résolveur de certificats de Traefik. |
| `REGISTRY` | `ghcr.io/iamvaln` | Registre des images. |

### SESSION_SECRET : ne pas le changer en production

La production reprend le `SESSION_SECRET` de Vercel. Changer sa valeur
déconnecte tous les coachs et rend illisibles les compteurs de la table
`rate_limit_hits`, copiée telle quelle lors de la bascule (leurs clés sont des
empreintes calculées avec ce secret). Ne le régénérer que volontairement.

### Modifier une variable

Éditer le fichier, puis recréer les conteneurs **avec le tag en cours**. Sans
`IMAGE_TAG`, Compose prend `latest` : en production c'est le dernier tag `v*`
(pas forcément la version qui tourne), et en préproduction ce tag n'existe pas
(les images y sont taguées `develop`). Le tag se donne **sur la commande
seulement**, jamais par `export` : une variable exportée l'emporte sur le
fichier d'environnement et fuirait vers la commande suivante de la même session
(par exemple sur l'autre environnement).

Pour ne pas retaper la lecture du tag, définir cette fonction au début de la
session (production) ; les commandes des sections 4 et 5 qui lancent des
images l'utilisent :

```bash
cd ~/shespeaks
dcprod() { IMAGE_TAG=$(docker inspect -f '{{.Config.Image}}' shespeaks-app-1 | sed 's/.*://') docker compose --env-file .env.production --profile prod "$@"; }
dcprod up -d
```

Pour la préproduction : dossier `~/shespeaks-preprod`, conteneur
`shespeaks-preprod-app-1`, fichier `.env.preprod`, sans `--profile prod`
(fonction `dcpreprod` à définir de la même façon).

## 4. Diagnostics

Production, depuis `~/shespeaks` (préproduction : `.env.preprod`, sans
`--profile prod`)  ; la fonction `dcprod` est définie en section 3 et
n'est nécessaire que pour les commandes qui lancent une image) :

```bash
# état des services
docker compose --env-file .env.production --profile prod ps

# journaux
docker compose --env-file .env.production logs --tail 200 app
docker compose --env-file .env.production logs --tail 200 migrate
docker compose --env-file .env.production --profile prod logs --tail 200 cron
docker compose --env-file .env.production --profile prod logs --tail 200 backup

# santé de l'application
curl -s https://sheleads.techiesconnect.org/api/health

# console SQL (lecture seule par convention : ne pas modifier la base à la main)
docker compose --env-file .env.production exec db psql -U shespeaks -d shespeaks
```

Si `app` n'est pas sain, le site affiche la page d'attente (`maintenance`) ;
chercher la cause dans `logs app` et `logs migrate` (un `migrate` en échec
empêche `app` de démarrer).

### Relancer les relances à la main

Même appel que celui du service `cron`, sans attendre l'heure prévue (les
relances sont idempotentes : chaque candidate est réservée avant l'envoi) :

```bash
dcprod run --rm --entrypoint sh cron \
  -c 'curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://app:3000/api/cron/reminders'
```

Le journal du cron affiche `[cron] … ok` ou `FAILED` après chaque passage quotidien.

### Revenir à une version précédente

Relancer le run Deploy de la version voulue dans GitHub (onglet Actions), ou, à
la main :

```bash
IMAGE_TAG=v1.0.0 docker compose --env-file .env.production --profile prod pull
IMAGE_TAG=v1.0.0 docker compose --env-file .env.production --profile prod up -d
```

Les migrations ne reculent jamais : une version plus ancienne doit pouvoir
fonctionner avec le schéma actuel (d'où la règle « ajouter d'abord, retirer
dans une migration ultérieure »).

## 5. Sauvegardes et restauration

Le service `backup` (production seulement) :

- fait une sauvegarde au démarrage du conteneur, puis une par jour à
  `BACKUP_SCHEDULE_HOUR_UTC` ;
- envoie vers `s3://<BACKUP_R2_BUCKET>/backups/` : `shespeaks-<horodatage>.sql.gz`
  (dump complet de la base) et `shespeaks-uploads-<horodatage>.tar.gz` (photos) ;
- supprime ce qui dépasse `BACKUP_RETENTION_DAYS` (les sauvegardes du dimanche
  restent 8 semaines).

Un échec est écrit dans `logs backup` (`FAILED`) : à surveiller, par exemple
après un changement de jeton R2.

Le conteneur accepte les modes `backup`, `restore`, `restore-uploads`, `list`
et `shell`. Depuis `~/shespeaks`, avec la fonction `dcprod` de la section 3
(elle donne à Compose le tag de l'image qui tourne, sans quoi l'image
`backup` à tirer est introuvable dans une session neuve) :

```bash
# lister le contenu du compartiment (sert aussi à vérifier les identifiants R2)
dcprod run --rm backup list

# sauvegarde immédiate
dcprod run --rm backup backup

# un shell dans l'image de sauvegarde
dcprod run --rm backup shell
```

### Restaurer la base

Le dump contient `DROP … IF EXISTS` : **les tables existantes sont supprimées
et recréées**, tout ce qui a été écrit depuis la sauvegarde est perdu. La
commande demande de retaper le nom de la base (`shespeaks`).

```bash
dcprod stop app
dcprod run --rm backup restore latest
dcprod start app
```

`latest` désigne la sauvegarde de base la plus récente ; on peut aussi passer
un nom lu avec `list` (`restore shespeaks-20260604T020001Z.sql.gz`).

### Restaurer les photos

Les fichiers de l'archive sont ajoutés ou écrasés, jamais supprimés.

```bash
dcprod run --rm backup restore-uploads latest
```

Contrôler de temps en temps que `backup list` montre une sauvegarde de moins
de 24 h. Le service `backup` n'existe qu'en production : la préproduction n'est
pas sauvegardée.

## 6. Bascule depuis Vercel et Supabase

Script : `ops/cutover.sh`, lancé **depuis votre poste** (il pilote le VPS par
`ssh deploy-vps`, et utilise `dig` et `curl` en local). Les étapes sur le VPS
sont dans `ops/cutover-remote.sh`. Aucune écriture n'est faite dans Supabase :
c'est ce qui rend la marche arrière possible.

### Avant

1. La pile de production tourne (premier déploiement par tag, 2.7) et ne
   contient que le seed ; le DNS de `sheleads.techiesconnect.org` pointe sur le
   VPS et `/api/health` répond.
2. Les migrations de l'image déployée sont **exactement** celles de la base
   Supabase (le préflight compare). Si une migration récente n'est pas encore
   appliquée côté Vercel, déployer d'abord la version de Vercel correspondante.
3. Sur le VPS, créer `~/shespeaks/ops/.env.cutover` (ignoré par git) en
   `chmod 600`, sans guillemets :

   ```
   SUPABASE_DB_URL=postgresql://postgres.xxxx:MOTDEPASSE@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=…
   # SUPABASE_PHOTO_BUCKET=speaker-photos   (défaut)
   ```

   `SUPABASE_DB_URL` est la chaîne du pooler **en mode session (port 5432)**.
   Le même fichier est nécessaire dans `~/shespeaks-preprod/ops/` pour une répétition.
4. Une branche `vercel-redirect` existe avec le déploiement Vercel qui
   redirige vers la nouvelle adresse ; on le **promeut en production** pendant
   la bascule.

### Répétition générale sur la préproduction

```bash
ops/cutover.sh --rehearsal
```

Mêmes étapes, vers `shespeaks-preprod` / `preprod.sheleads.techiesconnect.org`,
sans l'étape Vercel. Pour remettre la préproduction à zéro ensuite (vide les
tables et le volume des photos, puis rejoue le seed) :

```bash
ssh deploy-vps 'cd ~/shespeaks-preprod && ops/cutover-remote.sh shespeaks-preprod wipe'
```

`wipe` est refusé sur la production.

### Le jour J : production, une seule fois

**Attention : `ops/cutover.sh` sans option (et `ops/cutover-remote.sh
shespeaks copy-db`) EFFACE la base de production** (`TRUNCATE … RESTART
IDENTITY CASCADE`) avant d'y recopier Supabase. À lancer une seule fois, avant
la mise en service, jamais après que le VPS a reçu des écritures : relancé plus
tard, il remplacerait les données vivantes par des données Supabase périmées.
Garde-fou : `copy-db` sur `shespeaks` refuse (code 1) si la table `candidates`
de la cible n'est pas vide. Pour passer outre, en connaissance de cause :
`CUTOVER_ALLOW_OVERWRITE=1 ops/cutover.sh`. La préproduction n'est pas
concernée (les répétitions copient plusieurs fois).

Faire d'abord la répétition (`ops/cutover.sh --rehearsal`, ci-dessus), puis :

```bash
ops/cutover.sh
```

Déroulé :

1. **Préflight** (`preflight`), s'arrête sur la première anomalie :
   `ops/.env.cutover` absent ou pas en `600` ; projet Compose différent de
   `STACK` (garde du nom de projet, code 2) ; version majeure de Postgres de
   Supabase plus récente que celle du client de dump (`PG_CLIENT`, par défaut
   `postgres:17-alpine`) ; table `schema_migrations` illisible côté source ou
   cible ; **liste des migrations différente** entre Supabase et la cible
   (la différence est affichée). Il affiche l'état des services et le nombre de
   lignes de la cible (le seed seulement). Puis, depuis le poste : le domaine
   doit résoudre vers `77.237.234.91` et `/api/health` répondre.
2. **Copie des photos en avance** (`sync-photos`) : tout le bucket Supabase
   `speaker-photos` vers le volume `uploads` (`ops/sync-photos.mjs`, sans
   dépendance). Les fichiers déjà présents sont ignorés : on peut relancer.
3. Le script demande de taper `GO`. Rien n'est arrêté avant.
4. **Ouverture de la fenêtre** (`stop-app`) : `app` est arrêté, la page
   d'attente est servie.
5. **Promouvoir `vercel-redirect`** dans Vercel (Deployments, menu du
   déploiement, Promote to Production), puis taper `PROMOTED`. Le script
   attend 10 s (les requêtes en cours côté Vercel se terminent).
6. **Copie de la base** (`copy-db`) : dump des données du schéma `public`
   (sans `schema_migrations`) dans un fichier, puis, en **une seule
   transaction**, vidage des tables de la cible et chargement. Un dump qui
   échoue ou qui est vide n'est jamais appliqué.
7. **Rattrapage des photos** (`sync-photos`) : ce qui est arrivé depuis l'étape 2.
8. **Contrôles** (`verify`) : nombre de lignes identique table par table entre
   Supabase et la cible ; chaque ligne de `photos` a son fichier dans le
   volume ; liste des adresses présentes dans les liens de `email_log`.
   Un écart arrête le script, l'application reste arrêtée.
9. **Redémarrage** (`start-app`) : `docker compose start app` (même conteneur,
   même image) et attente de l'état sain.
10. **Test de fumée** : `/`, `/interet`, `/admin/login`, `/api/health` doivent
    répondre 200 (ou 307).

### Marche arrière

Tant que Supabase n'a pas été touché (il ne l'est jamais), il suffit, dans
Vercel, de promouvoir de nouveau le **déploiement de production précédent**.
Si le script s'est arrêté avant la fin et que vous voulez rouvrir le site sur
le VPS : `ssh deploy-vps 'cd ~/shespeaks && ops/cutover-remote.sh shespeaks start-app'`.

Attention : une fois que le VPS a reçu des écritures (nouvelles candidatures
après la bascule), revenir sur Vercel les perd.

### Après la bascule : ne pas casser la redirection

**Avant** de fusionner `develop` dans `main`, dans Vercel (Settings, Git) :
régler la **Production Branch** sur `vercel-redirect`, ou déconnecter
l'intégration Git. Sinon le push sur `main` redéploie l'ancienne application
par-dessus la redirection.

Ensuite : fusionner `develop` dans `main`, poser un tag `v*` pour la
production (2.7), et vérifier que la sauvegarde du lendemain apparaît avec
`backup list`.
