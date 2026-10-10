# Migration de SheSpeaks vers le VPS : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** faire tourner SheSpeaks (app, base Postgres, photos, relances,
sauvegardes) sur le VPS partagé, en prod et en preprod, puis basculer depuis
Vercel + Supabase sans perte de données.

**Architecture :** une image Docker unique (Next `standalone`) sert l'app et le
service de migration ; Compose ajoute Postgres 16, une page d'attente nginx, un
déclencheur du cron et un service de sauvegarde vers R2, derrière le Traefik
partagé. GitHub Actions publie les images sur GHCR et déploie en SSH. Un script
de bascule copie la base et les photos depuis Supabase pendant que Vercel
redirige vers le nouveau domaine.

**Tech Stack :** Next.js 15.5, Node 22, `postgres` (postgres.js) 3.4,
Postgres 16, Docker / Compose, Traefik v3.7 (déjà en place), GitHub Actions,
GHCR, Cloudflare R2 (aws-cli), API REST de Supabase Storage.

**Spec :** `docs/superpowers/specs/2026-10-10-migration-vps-design.md`

## Global Constraints

- Node ≥ 22.18 partout (le `package.json` l'exige) ; en local, utiliser
  `export PATH=/opt/homebrew/opt/node@22/bin:$PATH` (le Node par défaut du Mac
  est la 20).
- VPS : `deploy@77.237.234.91`, alias SSH `deploy-vps`. Prod dans
  `/home/deploy/shespeaks`, preprod dans `/home/deploy/shespeaks-preprod`
  (deux clones du dépôt, comme lehno et lehno-sandbox).
- Projets Compose : `shespeaks` (prod) et `shespeaks-preprod`. Le nom vient de
  la variable `STACK`, obligatoire, et chaque déploiement vérifie le nom
  annoncé par Compose avant toute action (incident lehno du 14 septembre).
- Domaines : `sheleads.techiesconnect.org` (prod),
  `sheleads.techiesconnect.net` (preprod). Enregistrements A vers
  `77.237.234.91`, DNS only.
- Traefik : réseau externe `web`, entrypoint `websecure`, certresolver `le`.
- Images : `ghcr.io/iamvaln/shespeaks:<tag>` et
  `ghcr.io/iamvaln/shespeaks-backup:<tag>` ; tags `develop` (preprod) et
  `vX.Y.Z` + `latest` (prod).
- `DEPLOY_ENV` vaut `production` ou `preprod` dans les conteneurs.
- Aucune ligne `Co-Authored-By: Claude` ni « Generated with Claude Code » dans
  les commits ou les PR (CLAUDE.md de l'utilisateur).
- Commentaires de code en anglais, au ton du code existant ; documentation
  destinée à l'équipe en français.
- Ne jamais afficher ni committer de secret ; les fichiers `.env.*` du VPS
  restent sur le VPS (chmod 600).

## Review Focus

1. **Adresse IP falsifiée derrière Traefik** : sur Vercel, `x-real-ip` est
   posé par la plateforme. Derrière Traefik, une visiteuse qui envoie
   `X-Real-Ip: 1.2.3.4` ne doit pas changer la clé des limites de débit
   (`requestIp`, `src/lib/ratelimit.ts:20`). Vérifié en preprod (Tâche 12,
   étape 6) avec correctif prêt.
2. **Volume `uploads` non inscriptible** : un volume nommé neuf appartient à
   root ; l'app tourne sous l'utilisateur `node` (uid 1000). Un envoi de photo
   doit réussir au premier démarrage. Couvert par le smoke test contre la pile
   Compose locale (Tâche 4, étape 7).
3. **`pg_dump` 17 restauré dans Postgres 16** : le dump contient
   `SET transaction_timeout`, refusé par la 16. La copie doit réussir quand
   même. Couvert par la répétition (Tâche 12) et le filtre `sed` (Tâche 8).
4. **Contrôles de contact stricts désactivés en silence** : ils s'activaient
   sur `VERCEL_ENV=production`. Sur le VPS de prod ils doivent rester actifs,
   et inactifs en preprod. Couvert par les tests de `strictContactChecks`
   (Tâche 2).
5. **Page d'attente qui ne prend pas le relais** : quand `app` est arrêté ou
   en mauvaise santé, Traefik doit servir la page d'attente (503), pas une
   404. Vérifié en preprod (Tâche 12, étape 4).

---

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `src/lib/env.ts` (modifié) | + `databaseSsl(url)` ; règles d'environnement sans dépendre de Vercel |
| `src/lib/db.ts`, `scripts/db.mjs` (modifiés) | SSL suivant l'URL ; pool à 10 |
| `src/lib/contact.ts` (modifié) | contrôles stricts aussi quand `DEPLOY_ENV=production` |
| `scripts/check-env.mjs` (modifié) | « production » = `NODE_ENV=production` ou Vercel |
| `src/app/api/health/route.ts` (nouveau) | santé : la base répond-elle ? |
| `next.config.mjs`, `package.json` (modifiés) | `standalone` ; plus de `prebuild` |
| `Dockerfile`, `.dockerignore` (nouveaux) | image de l'app et du service de migration |
| `docker-compose.yml` (nouveau) | services db, migrate, app, maintenance, cron, backup |
| `docker-compose.local.yml`, `.env.compose.example` (nouveaux) | faire tourner la pile sur un poste |
| `ops/maintenance/index.html`, `ops/maintenance/default.conf` | page d'attente |
| `ops/cron/cron-loop.sh` | déclencheur quotidien des relances |
| `ops/backup/*` | sauvegarde et restauration vers R2 (repris de lehno) |
| `ops/sync-photos.mjs` (+ `tests/sync-photos.test.ts`) | copie du bucket Supabase vers le volume |
| `ops/cutover-remote.sh`, `ops/cutover.sh` | bascule (côté VPS, côté poste) |
| `.github/workflows/ci.yml` (modifié), `.github/workflows/deploy.yml` (nouveau) | CI et déploiement |
| `docs/deploy-vps.md` (nouveau), `README.md`, `.env.example` | documentation |
| branche `vercel-redirect` | redirection de l'ancienne adresse |

---

## Partie A : code (sur la branche `feat/migration-vps`)

### Task 1 : SSL suivant l'URL, pool à 10

**Files :**
- Modify : `src/lib/env.ts` (ajout après `resolveDatabaseUrl`)
- Modify : `src/lib/db.ts:78-95` (`sql()`)
- Modify : `scripts/db.mjs:25-31` (`connect()`)
- Test : `tests/env.test.ts`

**Interfaces :**
- Produces : `export function databaseSsl(url: string): false | string` dans
  `src/lib/env.ts`.

- [ ] **Step 1 : écrire le test qui échoue** (à la fin de `tests/env.test.ts`,
  et ajouter `databaseSsl` à l'import en tête de fichier)

```ts
test('database SSL follows sslmode in the URL, else off only for a local host', () => {
  assert.equal(databaseSsl('postgresql://u:p@db:5432/shespeaks?sslmode=disable'), false);
  assert.equal(databaseSsl('postgresql://u:p@db:5432/shespeaks?sslmode=require'), 'require');
  assert.equal(databaseSsl('postgresql://u:p@h:5432/x?application_name=a&sslmode=verify-full'), 'verify-full');
  assert.equal(databaseSsl('postgres://shespeaks:shespeaks@localhost:5432/shespeaks'), false);
  assert.equal(databaseSsl('postgres://u:p@127.0.0.1:5432/x'), false);
  assert.equal(databaseSsl('postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:6543/postgres'), 'require');
  assert.equal(databaseSsl('postgresql://u:p@db:5432/shespeaks'), 'require', 'no sslmode on a remote-looking host keeps today\'s behaviour');
});
```

- [ ] **Step 2 : lancer le test, il doit échouer**

Run : `npm test 2>&1 | grep -E "database SSL|not ok|SyntaxError" | head`
Expected : échec (`databaseSsl` n'est pas exporté).

- [ ] **Step 3 : implémenter** dans `src/lib/env.ts`, juste après
  `resolveDatabaseUrl` :

```ts
/**
 * TLS for the database connection. `sslmode` in the URL decides when it is there (`disable` on the VPS, where Postgres is
 * another container of the same stack); otherwise TLS is required except on a local host, as before. The driver would read
 * `sslmode` by itself, but an explicit `ssl` option overrides it, so the choice is made here once for the app and the scripts.
 */
export function databaseSsl(url: string): false | string {
  const mode = /[?&]sslmode=([^&]+)/.exec(url)?.[1];
  if (mode) return mode === 'disable' ? false : mode;
  return /@(localhost|127\.0\.0\.\d+)(:|\/)/.test(url) ? false : 'require';
}
```

- [ ] **Step 4 : brancher la fonction.** Dans `src/lib/db.ts`, importer
  `databaseSsl` à côté de `resolveDatabaseUrl`, puis dans `sql()` supprimer la
  ligne `const local = …` et remplacer les options concernées :

```ts
    g.__shespeaksSql = postgres(url, {
      max: 10, // one long-lived process next to its database (it was 3 on serverless functions)
      prepare: false, // kept for the cutover: required behind the Supabase pooler, harmless on a direct connection
      ssl: databaseSsl(url) as false | 'require',
```

  (les autres options, `idle_timeout`, `connect_timeout`, `onnotice`, `types`,
  ne changent pas). Dans `scripts/db.mjs`, importer `databaseSsl` depuis
  `'../src/lib/env.ts'` et remplacer les deux dernières lignes de `connect()` :

```js
  return postgres(url, { max: 1, prepare: false, ssl: databaseSsl(url), onnotice: () => {}, connect_timeout: 20 });
```

- [ ] **Step 5 : vérifier**

Run : `npm test && npm run typecheck`
Expected : tous les tests passent, typecheck sans erreur.

- [ ] **Step 6 : vérifier contre une vraie base locale sans SSL**

```bash
docker run -d --name ss-pg -e POSTGRES_USER=shespeaks -e POSTGRES_PASSWORD=shespeaks -e POSTGRES_DB=shespeaks -p 55432:5432 postgres:16-alpine
sleep 4
DATABASE_URL='postgresql://shespeaks:shespeaks@127.0.0.1:55432/shespeaks?sslmode=disable' node --experimental-strip-types --no-warnings scripts/db.mjs setup
docker rm -f ss-pg
```
Expected : `migrations: applied …` pour les 7 fichiers, puis le seed.

- [ ] **Step 7 : commit**

```bash
git add src/lib/env.ts src/lib/db.ts scripts/db.mjs tests/env.test.ts
git commit -m "Database connection: TLS follows sslmode in the URL; pool of 10 for a long-lived server"
```

### Task 2 : environnement sans Vercel (production, contrôles de contact, photos)

**Files :**
- Modify : `src/lib/contact.ts:7-13`
- Modify : `src/lib/env.ts` (bloc « photo storage »)
- Modify : `scripts/check-env.mjs`
- Test : `tests/contact.test.ts`, `tests/env.test.ts`

**Interfaces :**
- Consumes : rien de la Tâche 1.
- Produces : `DEPLOY_ENV` (`production` | `preprod`) reconnu par
  `strictContactChecks` ; `check-env.mjs` strict quand `NODE_ENV=production`.

- [ ] **Step 1 : tests qui échouent.** Dans `tests/contact.test.ts`, dans le
  premier test (celui qui contient déjà les assertions sur `VERCEL_ENV`),
  ajouter :

```ts
  assert.equal(strictContactChecks({ DEPLOY_ENV: 'production' }), true);
  assert.equal(strictContactChecks({ DEPLOY_ENV: 'preprod' }), false);
  assert.equal(strictContactChecks({ DEPLOY_ENV: 'production', STRICT_CONTACT_CHECKS: '0' }), false);
```

  Dans `tests/env.test.ts`, ajouter :

```ts
test('photos on disk: no warning when DATA_DIR is set (the VPS volume), a warning otherwise, an error on Vercel', () => {
  const disk = { ...good, SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined };
  assert.ok(!names({ ...disk, DATA_DIR: '/data' }).some((n) => n.includes('SUPABASE')));
  assert.ok(names(disk).includes('warn:SUPABASE_URL+SUPABASE_SERVICE_ROLE_KEY'));
  assert.ok(names({ ...disk, VERCEL: '1', DATA_DIR: '/data' }).includes('error:SUPABASE_URL+SUPABASE_SERVICE_ROLE_KEY'));
});
```

- [ ] **Step 2 : lancer, ils doivent échouer**

Run : `npm test 2>&1 | grep -E "^not ok" `
Expected : le test de contact et le nouveau test d'environnement échouent.

- [ ] **Step 3 : implémenter.** `src/lib/contact.ts` :

```ts
/** On for production: the Vercel production deployment (VERCEL_ENV) or the VPS production stack (DEPLOY_ENV). STRICT_CONTACT_CHECKS=1 or 0 forces it on or off. */
export function strictContactChecks(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.STRICT_CONTACT_CHECKS?.trim().toLowerCase();
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return env.VERCEL_ENV === 'production' || env.DEPLOY_ENV === 'production';
}
```

  `src/lib/env.ts`, dans le bloc « photo storage », remplacer la branche
  `else if (!sbUrl) { … }` par :

```ts
  } else if (!sbUrl) {
    if (onVercel) add('error', ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], 'Manquantes. Vercel n’a pas de disque persistant : les photos de speaker ne pourraient pas être conservées.');
    else if (!isSet(env.DATA_DIR)) add('warn', ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], 'Non renseignées et DATA_DIR absent : les photos sont écrites dans ./data, qui disparaît avec le conteneur. Sur le VPS, DATA_DIR pointe vers le volume uploads.');
```

  `scripts/check-env.mjs` (remplacer les lignes 1 à 7) :

```js
// Usage: node --experimental-strip-types scripts/check-env.mjs [--strict]
// On the VPS the `migrate` service runs it before the migrations (NODE_ENV=production): an error stops the deployment and
// the running version keeps serving. On Vercel (VERCEL=1) errors still fail the build. Locally it only prints.
import { checkEnv, formatIssues, hasErrors } from '../src/lib/env.ts';

const production = process.argv.includes('--strict') || !!process.env.VERCEL || process.env.NODE_ENV === 'production';
const strict = production;
const issues = checkEnv(process.env, { production });
```

  et, dans le message final, remplacer « in Vercel → Project Settings →
  Environment Variables » par « in the environment file of this deployment
  (.env.production / .env.preprod on the VPS, Vercel → Settings → Environment
  Variables on Vercel) ».

- [ ] **Step 4 : vérifier**

Run : `npm test && npm run typecheck`
Expected : tout passe.

- [ ] **Step 5 : commit**

```bash
git add src/lib/contact.ts src/lib/env.ts scripts/check-env.mjs tests/contact.test.ts tests/env.test.ts
git commit -m "Environment rules without Vercel: strict contact checks on the VPS production stack, photos on a DATA_DIR volume"
```

### Task 3 : route de santé

**Files :**
- Create : `src/app/api/health/route.ts`
- Modify : `scripts/smoke.mjs` (nouveau bloc juste avant la ligne
  `console.log(failures ? …`)

**Interfaces :**
- Produces : `GET /api/health` → `200 {"ok":true}` si la base répond,
  `503 {"ok":false}` sinon, `cache-control: no-store`. Utilisée par le
  healthcheck Compose (Tâche 4) et le script de bascule (Tâche 8).

- [ ] **Step 1 : le contrôle de smoke qui échoue**

```js
// health: what the container healthcheck and the cutover script ask
{
  const r = await fetch(BASE + '/api/health');
  const body = await r.json().catch(() => null);
  ok(r.status === 200 && body?.ok === true && r.headers.get('cache-control')?.includes('no-store'), 'health: the database answers and the answer is not cached');
}
```

- [ ] **Step 2 : constater l'échec** (base et serveur locaux)

```bash
docker run -d --name ss-pg -e POSTGRES_USER=shespeaks -e POSTGRES_PASSWORD=shespeaks -e POSTGRES_DB=shespeaks -p 55432:5432 postgres:16-alpine && sleep 4
export DATABASE_URL='postgresql://shespeaks:shespeaks@127.0.0.1:55432/shespeaks?sslmode=disable' SESSION_SECRET=local-session-secret-0123456789 CRON_SECRET=local-cron-secret-0123456789 APP_URL=http://localhost:3000
npm run db:setup && npm run build && (npm start > /tmp/ss.log 2>&1 &) && sleep 5
node scripts/smoke.mjs | grep health
```
Expected : `FAIL  health: …` (404).

- [ ] **Step 3 : implémenter** `src/app/api/health/route.ts`

```ts
import { NextResponse } from 'next/server';
import { get } from '@/lib/db';

export const dynamic = 'force-dynamic';

// For the container healthcheck and the cutover script: is the database answering? No data, no authentication.
export async function GET() {
  const headers = { 'cache-control': 'no-store' };
  try {
    await get('SELECT 1 AS ok');
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers });
  }
}
```

- [ ] **Step 4 : vérifier**

```bash
pkill -f "next start"; npm run build && (npm start > /tmp/ss.log 2>&1 &) && sleep 5
node scripts/smoke.mjs | tail -3
pkill -f "next start"; docker rm -f ss-pg
```
Expected : `PASS  health: …` et `All smoke checks passed`.

- [ ] **Step 5 : commit**

```bash
git add src/app/api/health/route.ts scripts/smoke.mjs
git commit -m "Health route: tells the container healthcheck whether the database answers"
```

### Task 4 : image Docker et pile Compose

**Files :**
- Modify : `next.config.mjs`, `package.json` (scripts)
- Create : `Dockerfile`, `.dockerignore`, `docker-compose.yml`,
  `docker-compose.local.yml`, `.env.compose.example`,
  `ops/maintenance/index.html`, `ops/maintenance/default.conf`,
  `ops/cron/cron-loop.sh`
- Modify : `.gitignore`

**Interfaces :**
- Consumes : `/api/health` (Tâche 3), `databaseSsl` (Tâche 1),
  `check-env.mjs` strict sous `NODE_ENV=production` (Tâche 2).
- Produces : services Compose `db`, `migrate`, `app`, `maintenance`, `cron`
  (profil `prod`), `backup` (profil `prod`, Tâche 5) ; réseau interne
  `${STACK}_internal` ; volumes `${STACK}_pgdata` et `${STACK}_uploads` ;
  `DATA_DIR=/data`, photos dans `/data/uploads`.

- [ ] **Step 1 : configuration Next et scripts.** `next.config.mjs` : ajouter
  `output: 'standalone',` en tête de `nextConfig`. `package.json` : supprimer
  la ligne `"prebuild"` (les migrations passent dans le service `migrate`).

- [ ] **Step 2 : `.dockerignore`**

```
node_modules
.next
.git
.github
.env
.env.*
!.env.example
data
docs
tests
*.log
.DS_Store
```

- [ ] **Step 3 : `Dockerfile`**

```dockerfile
# One image for the app (`node server.js`) and the `migrate` service (`scripts/db.mjs setup`).
FROM node:22-alpine AS deps
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /src
COPY --from=deps /src/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 DATA_DIR=/data
COPY --from=build --chown=node:node /src/.next/standalone ./
COPY --from=build --chown=node:node /src/.next/static ./.next/static
COPY --from=build --chown=node:node /src/public ./public
# what the migrate service runs: the CLI, the migrations, and the one module they import
COPY --from=build --chown=node:node /src/scripts ./scripts
COPY --from=build --chown=node:node /src/supabase/migrations ./supabase/migrations
COPY --from=build --chown=node:node /src/src/lib/env.ts ./src/lib/env.ts
# a named volume mounted here takes this ownership the first time, so the app (not root) can write photos
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 4 : construire et vérifier l'image**

```bash
docker build -t shespeaks:local .
docker run --rm shespeaks:local node -e "import('postgres').then(() => console.log('postgres ok'))"
docker run --rm shespeaks:local node --experimental-strip-types --no-warnings scripts/db.mjs 2>&1 | head -1
```
Expected : `postgres ok`, puis la ligne `usage: node scripts/db.mjs …`. Si
`postgres` manque dans le `standalone`, ajouter dans le stage final
`COPY --from=deps --chown=node:node /src/node_modules/postgres ./node_modules/postgres`.

- [ ] **Step 5 : fichiers d'exploitation.** `ops/maintenance/default.conf` :

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  location = /index.html { internal; }
  location / {
    add_header Retry-After 30 always;
    add_header Cache-Control "no-store" always;
    error_page 503 /index.html;
    return 503;
  }
}
```

  `ops/maintenance/index.html` :

```html
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="15">
<title>SheSpeaks · On revient dans un instant</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: #fbf7f2; color: #1d1a17; padding: 16px; }
  main { max-width: 32rem; text-align: center; }
  h1 { font-size: 1.5rem; margin: 0 0 .75rem; }
  p { line-height: 1.5; margin: .5rem 0; }
  .en { color: #5c554e; font-size: .95rem; margin-top: 1.5rem; }
</style>
</head>
<body>
<main>
  <h1>On revient dans un instant</h1>
  <p>SheSpeaks est en courte maintenance. Cette page se recharge toute seule : tes réponses déjà enregistrées sont en sécurité.</p>
  <p class="en">SheSpeaks is briefly down for maintenance. This page reloads by itself; the answers you already saved are safe.</p>
</main>
</body>
</html>
```

  `ops/cron/cron-loop.sh` (exécutable : `chmod +x`) :

```sh
#!/bin/sh
# Daily trigger of the reminder engine (replaces the Vercel cron). Sleeps until CRON_HOUR_UTC, calls the app, repeats.
set -eu
: "${CRON_SECRET:?CRON_SECRET is required}"
HOUR=${CRON_HOUR_UTC:-7}
URL=${CRON_URL:-http://app:3000/api/cron/reminders}
echo "[cron] reminders daily at ${HOUR}:00 UTC → ${URL}"
while true; do
  # `sed` drops a leading zero: sh would read 08 and 09 as invalid octal numbers
  now=$(( $(date -u +%H | sed 's/^0//') * 3600 + $(date -u +%M | sed 's/^0//') * 60 + $(date -u +%S | sed 's/^0//') ))
  target=$(( HOUR * 3600 ))
  [ "$target" -le "$now" ] && target=$(( target + 86400 ))
  sleep $(( target - now ))
  if out=$(curl -fsS --max-time 600 -X POST -H "Authorization: Bearer ${CRON_SECRET}" "$URL"); then
    echo "[cron] $(date -u +%FT%TZ) ok ${out}"
  else
    echo "[cron] $(date -u +%FT%TZ) FAILED" >&2
  fi
done
```

- [ ] **Step 6 : `docker-compose.yml`**

```yaml
# SheSpeaks on the shared VPS. One project per environment, named by STACK (shespeaks | shespeaks-preprod):
#   docker compose --env-file .env.production --profile prod up -d      (prod: + cron + backup)
#   docker compose --env-file .env.preprod up -d                        (preprod)
name: ${STACK:?STACK must be set (shespeaks or shespeaks-preprod)}

x-logging: &logging
  driver: json-file
  options: { max-size: "10m", max-file: "3" }

x-app-env: &app-env
  NODE_ENV: production
  DEPLOY_ENV: ${DEPLOY_ENV:?DEPLOY_ENV must be production or preprod}
  DATABASE_URL: postgresql://shespeaks:${POSTGRES_PASSWORD:?}@db:5432/shespeaks?sslmode=disable
  DATA_DIR: /data
  APP_URL: ${APP_URL:?}
  SESSION_SECRET: ${SESSION_SECRET:?}
  CRON_SECRET: ${CRON_SECRET:?}
  ADMIN_EMAIL: ${ADMIN_EMAIL:-}
  ADMIN_NAME: ${ADMIN_NAME:-}
  RESEND_API_KEY: ${RESEND_API_KEY:-}
  MAIL_FROM: ${MAIL_FROM:-}
  MAIL_REPLY_TO: ${MAIL_REPLY_TO:-}
  ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
  STRICT_CONTACT_CHECKS: ${STRICT_CONTACT_CHECKS:-}

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: shespeaks
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?}
      POSTGRES_DB: shespeaks
    volumes: [pgdata:/var/lib/postgresql/data]
    networks: [internal]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U shespeaks -d shespeaks"]
      interval: 5s
      timeout: 5s
      retries: 20
    mem_limit: 256m
    logging: *logging

  migrate:
    image: ${REGISTRY:-ghcr.io/iamvaln}/shespeaks:${IMAGE_TAG:-latest}
    environment: *app-env
    command: ["sh", "-c", "node --experimental-strip-types --no-warnings scripts/check-env.mjs --strict && node --experimental-strip-types --no-warnings scripts/db.mjs setup"]
    depends_on:
      db: { condition: service_healthy }
    networks: [internal]
    restart: "no"
    logging: *logging

  app:
    image: ${REGISTRY:-ghcr.io/iamvaln}/shespeaks:${IMAGE_TAG:-latest}
    restart: unless-stopped
    environment: *app-env
    volumes: [uploads:/data/uploads]
    depends_on:
      migrate: { condition: service_completed_successfully }
    networks: [internal, web]
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1"]
      interval: 10s
      timeout: 5s
      start_period: 20s
      retries: 3
    mem_limit: 512m
    labels:
      - traefik.enable=true
      - traefik.docker.network=web
      - traefik.http.routers.${STACK}-app.rule=Host(`${APP_DOMAIN:?}`)
      - traefik.http.routers.${STACK}-app.entrypoints=websecure
      - traefik.http.routers.${STACK}-app.tls.certresolver=${CERT_RESOLVER:-le}
      - traefik.http.routers.${STACK}-app.priority=100
      - traefik.http.services.${STACK}-app.loadbalancer.server.port=3000
    logging: *logging

  # Answers on the same domain with a lower priority: Traefik only routes here while `app` is stopped or unhealthy.
  maintenance:
    image: nginx:1.27-alpine
    restart: unless-stopped
    volumes:
      - ./ops/maintenance/index.html:/usr/share/nginx/html/index.html:ro
      - ./ops/maintenance/default.conf:/etc/nginx/conf.d/default.conf:ro
    networks: [web]
    mem_limit: 32m
    labels:
      - traefik.enable=true
      - traefik.docker.network=web
      - traefik.http.routers.${STACK}-maint.rule=Host(`${APP_DOMAIN:?}`)
      - traefik.http.routers.${STACK}-maint.entrypoints=websecure
      - traefik.http.routers.${STACK}-maint.tls.certresolver=${CERT_RESOLVER:-le}
      - traefik.http.routers.${STACK}-maint.priority=1
      - traefik.http.services.${STACK}-maint.loadbalancer.server.port=80
    logging: *logging

  cron:
    image: curlimages/curl:8.10.1
    profiles: [prod]
    restart: unless-stopped
    entrypoint: ["/bin/sh", "/ops/cron-loop.sh"]
    environment:
      CRON_SECRET: ${CRON_SECRET:?}
      CRON_HOUR_UTC: ${CRON_HOUR_UTC:-7}
    volumes: [./ops/cron/cron-loop.sh:/ops/cron-loop.sh:ro]
    networks: [internal]
    mem_limit: 32m
    logging: *logging

volumes:
  pgdata:
  uploads:

networks:
  internal:
  web:
    external: true
```

  Le service `backup` est ajouté à la Tâche 5.

- [ ] **Step 7 : pile locale.** `docker-compose.local.yml` :

```yaml
# Local run of the VPS stack: `docker network create web` once, then
#   docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.compose up -d --build
services:
  migrate:
    build: .
    image: shespeaks:local
  app:
    image: shespeaks:local
    ports: ["3000:3000"]
```

  `.env.compose.example` :

```
# Copy to .env.compose for a local run, or to .env.production / .env.preprod on the VPS (chmod 600). No quotes needed.
STACK=shespeaks-local
DEPLOY_ENV=preprod
APP_DOMAIN=localhost
APP_URL=http://localhost:3000
IMAGE_TAG=local
POSTGRES_PASSWORD=change-me-openssl-rand-hex-24
SESSION_SECRET=change-me-openssl-rand-hex-32
CRON_SECRET=change-me-openssl-rand-hex-32
ADMIN_EMAIL=coach@example.com
ADMIN_NAME=Coach
RESEND_API_KEY=
MAIL_FROM=
ANTHROPIC_API_KEY=
# prod only (backup service, profile prod)
BACKUP_R2_ACCOUNT_ID=
BACKUP_R2_BUCKET=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
```

  `.gitignore` : ajouter `.env.compose` et `ops/.env.cutover`.

  Vérifier :

```bash
docker network create web 2>/dev/null || true
cp .env.compose.example .env.compose
sed -i '' 's/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=localpw123/; s/^SESSION_SECRET=.*/SESSION_SECRET=local-session-secret-0123456789/; s/^CRON_SECRET=.*/CRON_SECRET=local-cron-secret-0123456789/' .env.compose
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.compose up -d --build
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.compose ps
SESSION_SECRET=local-session-secret-0123456789 node scripts/smoke.mjs | tail -3
```
Expected : `migrate` sorti avec le code 0, `app` `healthy`, `All smoke checks
passed` (dont les envois de photos : le volume est inscriptible, Review
Focus 2).

  Puis le cron, déclenché à la main :

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.compose --profile prod run --rm --entrypoint sh cron -c 'curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://app:3000/api/cron/reminders'
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.compose down -v
```
Expected : un JSON de rapport des relances.

- [ ] **Step 8 : commit**

```bash
git add next.config.mjs package.json Dockerfile .dockerignore docker-compose.yml docker-compose.local.yml .env.compose.example ops/maintenance ops/cron .gitignore
git commit -m "Docker image and Compose stack for the VPS: app, migrations, Postgres, waiting page, reminder trigger"
```

### Task 5 : sauvegardes vers R2

**Files :**
- Create : `ops/backup/Dockerfile`, `ops/backup/bin/entrypoint`,
  `ops/backup/bin/backup-loop`, `ops/backup/bin/backup-once`,
  `ops/backup/bin/list-backups`, `ops/backup/bin/restore`,
  `ops/backup/bin/restore-uploads`
- Modify : `docker-compose.yml` (service `backup`)

**Interfaces :**
- Consumes : volumes `pgdata` (via le service `db`) et `uploads` (Tâche 4).
- Produces : image `ghcr.io/iamvaln/shespeaks-backup` ; objets R2
  `backups/shespeaks-<YYYYMMDDTHHMMSSZ>.sql.gz` et
  `backups/shespeaks-uploads-<YYYYMMDDTHHMMSSZ>.tar.gz`.

Écart assumé avec la spec : dump SQL compressé (`--format=plain | gzip`) au
lieu de `-Fc`, pour reprendre tel quel l'outil de restauration de lehno, déjà
éprouvé sur ce VPS.

- [ ] **Step 1 : copier les fichiers de lehno**

```bash
mkdir -p ops/backup/bin
cp ~/dev/lehno/ops/backup/Dockerfile ops/backup/
cp ~/dev/lehno/ops/backup/bin/{entrypoint,backup-loop,backup-once,list-backups,restore} ops/backup/bin/
sed -i '' 's/lehno-/shespeaks-/g; s/Gabee DB backup sidecar/SheSpeaks backup sidecar (database + photos)/' ops/backup/Dockerfile ops/backup/bin/*
grep -rn "lehno\|gabee" ops/backup || echo clean
```
Expected : `clean`.

- [ ] **Step 2 : ajouter les photos et la rétention hebdomadaire à
  `backup-once`.** Juste avant le bloc « Prune », insérer :

```bash
UPLOADS_DIR=${UPLOADS_DIR:-/uploads}
UNAME="shespeaks-uploads-${TS}.tar.gz"
echo "[backup] archiving ${UPLOADS_DIR} → ${UNAME}"
tar -C "${UPLOADS_DIR}" -czf "/tmp/${UNAME}" .
aws s3 cp "/tmp/${UNAME}" "s3://${BACKUP_R2_BUCKET}/${PREFIX}/${UNAME}" \
  --endpoint-url "https://${BACKUP_R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --no-progress
rm -f "/tmp/${UNAME}"
echo "[backup] uploaded ${PREFIX}/${UNAME}"
```

  Dans la boucle de purge, remplacer le filtre de nom et l'extraction de date
  pour couvrir les deux familles, et garder les dimanches pendant 8 semaines :

```bash
  case "$fname" in shespeaks-*.sql.gz|shespeaks-uploads-*.tar.gz) ;; *) continue ;; esac
  fdate=$(printf '%s\n' "$fname" | sed -n 's/^shespeaks-\(uploads-\)\{0,1\}\([0-9]\{8\}\)T.*$/\2/p')
  [ -z "$fdate" ] && continue
  weekly_cutoff=$(date -u -d "@$(( $(date -u +%s) - 56*86400 ))" +%Y%m%d)
  if [ "$fdate" -lt "$cutoff_yyyymmdd" ]; then
    # older than the daily window: Sunday backups are kept for 8 weeks
    if [ "$(date -u -d "$fdate" +%u)" = "7" ] && [ "$fdate" -ge "$weekly_cutoff" ]; then continue; fi
```

  (le reste du `if`, `aws s3 rm …` et `pruned=$((pruned + 1))`, ne change
  pas).

- [ ] **Step 3 : `ops/backup/bin/restore-uploads`** (exécutable)

```bash
#!/bin/bash
# Restore the photos from R2 into UPLOADS_DIR: `docker compose run --rm backup restore-uploads latest`.
# Files are added or overwritten, never deleted.
set -euo pipefail
: "${BACKUP_R2_ACCOUNT_ID:?}" "${BACKUP_R2_BUCKET:?}"
PREFIX=${BACKUP_R2_PREFIX:-backups}
UPLOADS_DIR=${UPLOADS_DIR:-/uploads}
EP="https://${BACKUP_R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
target="${1:-}"
[ -z "$target" ] && { echo "usage: restore-uploads <name|latest>" >&2; exit 2; }
if [ "$target" = "latest" ]; then
  target=$(aws s3 ls "s3://${BACKUP_R2_BUCKET}/${PREFIX}/" --endpoint-url "$EP" | awk '{print $NF}' | grep -E '^shespeaks-uploads-[0-9]{8}T[0-9]{6}Z\.tar\.gz$' | sort | tail -1)
  [ -z "$target" ] && { echo "restore-uploads: no photo archive found" >&2; exit 1; }
fi
aws s3 cp "s3://${BACKUP_R2_BUCKET}/${PREFIX}/${target}" "/tmp/${target}" --endpoint-url "$EP" --no-progress
tar -C "${UPLOADS_DIR}" -xzf "/tmp/${target}"
rm -f "/tmp/${target}"
echo "[restore-uploads] ${target} → ${UPLOADS_DIR}"
```

  Dans `entrypoint`, ajouter la ligne `restore-uploads) exec restore-uploads "$@" ;;`
  dans le `case`.

- [ ] **Step 4 : service Compose** (dans `docker-compose.yml`, après `cron`)

```yaml
  backup:
    image: ${REGISTRY:-ghcr.io/iamvaln}/shespeaks-backup:${IMAGE_TAG:-latest}
    profiles: [prod]
    restart: unless-stopped
    environment:
      PGHOST: db
      PGUSER: shespeaks
      PGPASSWORD: ${POSTGRES_PASSWORD:?}
      PGDATABASE: shespeaks
      UPLOADS_DIR: /uploads
      BACKUP_SCHEDULE_HOUR_UTC: ${BACKUP_SCHEDULE_HOUR_UTC:-2}
      BACKUP_RETENTION_DAYS: ${BACKUP_RETENTION_DAYS:-14}
      BACKUP_R2_ACCOUNT_ID: ${BACKUP_R2_ACCOUNT_ID:-}
      BACKUP_R2_BUCKET: ${BACKUP_R2_BUCKET:-}
      AWS_ACCESS_KEY_ID: ${R2_ACCESS_KEY_ID:-}
      AWS_SECRET_ACCESS_KEY: ${R2_SECRET_ACCESS_KEY:-}
    volumes: [uploads:/uploads]
    depends_on:
      db: { condition: service_healthy }
    networks: [internal]
    mem_limit: 128m
    logging: *logging
```

- [ ] **Step 5 : vérifier l'image et la syntaxe**

```bash
docker build -t shespeaks-backup:local ops/backup
docker run --rm shespeaks-backup:local bash -n /usr/local/bin/backup-once && echo syntax-ok
docker run --rm --entrypoint date shespeaks-backup:local -u -d 20261011 +%u
STACK=x DEPLOY_ENV=preprod POSTGRES_PASSWORD=x APP_URL=x SESSION_SECRET=x CRON_SECRET=x APP_DOMAIN=x docker compose --profile prod config -q && echo compose-ok
```
Expected : `syntax-ok`, `7` (le 11 octobre 2026 est un dimanche),
`compose-ok`. La vraie sauvegarde vers R2 est vérifiée en preprod (Tâche 12).

- [ ] **Step 6 : commit**

```bash
git add ops/backup docker-compose.yml
git commit -m "Nightly backups to R2: database dump and photo archive, 14 daily and 8 weekly kept, restore commands"
```

### Task 6 : copie des photos depuis Supabase Storage

**Files :**
- Create : `ops/sync-photos.mjs`
- Test : `tests/sync-photos.test.ts`

**Interfaces :**
- Produces : `listAll(fetchFn, base, key, bucket): Promise<string[]>`,
  `missing(remote: string[], present: Set<string>): string[]`,
  `localPath(root: string, p: string): string` (lève une erreur si `p` sort de
  `root`), et l'exécution directe
  `node ops/sync-photos.mjs <dossier cible>` (variables `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PHOTO_BUCKET` défaut
  `speaker-photos`). Sortie : `[sync-photos] remote N, already here M, copied K`.
  Code de sortie 1 si un téléchargement échoue.

- [ ] **Step 1 : tests qui échouent** `tests/sync-photos.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { listAll, missing, localPath } from '../ops/sync-photos.mjs';

// Supabase Storage lists one level at a time: folders come back with id null.
function fakeStorage(tree: Record<string, string[]>) {
  const calls: string[] = [];
  const fetchFn = async (_url: string, init: { body: string }) => {
    const { prefix, offset } = JSON.parse(init.body);
    calls.push(`${prefix}@${offset}`);
    const names = (tree[prefix] ?? []).slice(offset, offset + 2); // pages of 2 to exercise paging
    return new Response(JSON.stringify(names.map((n) => (n.endsWith('/') ? { name: n.slice(0, -1), id: null } : { name: n, id: 'x' }))));
  };
  return { fetchFn, calls };
}

test('listAll walks folders and pages and returns full object paths', async () => {
  const { fetchFn } = fakeStorage({ '': ['12/', '7/'], '12/': ['a.jpg', 'b.png', 'c.jpg'], '7/': ['d.jpg'] });
  const all = await listAll(fetchFn as never, 'https://x.supabase.co', 'key', 'speaker-photos', 2);
  assert.deepEqual(all.sort(), ['12/a.jpg', '12/b.png', '12/c.jpg', '7/d.jpg']);
});

test('missing keeps only what is not already on disk', () => {
  assert.deepEqual(missing(['1/a.jpg', '1/b.jpg', '2/c.png'], new Set(['1/a.jpg'])), ['1/b.jpg', '2/c.png']);
});

test('localPath refuses a path that leaves the target folder', () => {
  assert.equal(localPath('/data/uploads', '12/a.jpg'), path.join('/data/uploads', '12/a.jpg'));
  assert.throws(() => localPath('/data/uploads', '../etc/passwd'));
  assert.throws(() => localPath('/data/uploads', '/etc/passwd'));
});
```

- [ ] **Step 2 : lancer, ils doivent échouer**

Run : `npm test 2>&1 | grep -E "sync-photos|Cannot find" | head -3`
Expected : module introuvable.

- [ ] **Step 3 : implémenter** `ops/sync-photos.mjs`

```js
// Copies the speaker photos from the Supabase Storage bucket into a folder (the `uploads` volume on the VPS), keeping
// the object paths (`<candidateId>/<uuid>.<ext>`, what photos.filename holds). Files already there are skipped: run it
// once ahead of the cutover for the bulk, then again during the cutover for what arrived since. No dependency.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node ops/sync-photos.mjs /data/uploads
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const headers = (key) => ({ authorization: `Bearer ${key}`, apikey: key });

/** Every object path of the bucket. The list API returns one folder level per call, in pages; folders have id null. */
export async function listAll(fetchFn, base, key, bucket, pageSize = 1000, prefix = '') {
  const out = [];
  for (let offset = 0; ; offset += pageSize) {
    const r = await fetchFn(`${base}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: { ...headers(key), 'content-type': 'application/json' },
      body: JSON.stringify({ prefix, limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!r.ok) throw new Error(`list ${prefix || '/'}: HTTP ${r.status}`);
    const items = await r.json();
    for (const it of items) {
      if (it.id === null) out.push(...(await listAll(fetchFn, base, key, bucket, pageSize, `${prefix}${it.name}/`)));
      else out.push(`${prefix}${it.name}`);
    }
    if (items.length < pageSize) return out;
  }
}

export const missing = (remote, present) => remote.filter((p) => !present.has(p));

export function localPath(root, p) {
  const full = path.resolve(root, p);
  if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error(`refused path: ${p}`);
  return full;
}

function filesUnder(root, dir = '') {
  if (!fs.existsSync(path.join(root, dir))) return [];
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesUnder(root, path.join(dir, e.name)) : [path.join(dir, e.name).split(path.sep).join('/')]);
}

async function main() {
  const root = process.argv[2];
  const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_PHOTO_BUCKET || 'speaker-photos';
  if (!root || !base || !key) { console.error('usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node ops/sync-photos.mjs <folder>'); process.exit(2); }
  const remote = await listAll(fetch, base, key, bucket);
  const todo = missing(remote, new Set(filesUnder(root)));
  let failed = 0;
  for (const p of todo) {
    const r = await fetch(`${base}/storage/v1/object/authenticated/${bucket}/${p.split('/').map(encodeURIComponent).join('/')}`, { headers: headers(key) });
    if (!r.ok) { console.error(`[sync-photos] FAILED ${p}: HTTP ${r.status}`); failed++; continue; }
    const dest = localPath(root, p);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(`${dest}.part`, Buffer.from(await r.arrayBuffer()));
    fs.renameSync(`${dest}.part`, dest); // never leave a half-written photo under its real name
  }
  console.log(`[sync-photos] remote ${remote.length}, already here ${remote.length - todo.length}, copied ${todo.length - failed}${failed ? `, FAILED ${failed}` : ''}`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
```

- [ ] **Step 4 : vérifier**

Run : `npm test && npm run typecheck`
Expected : tout passe. Si `tsc` se plaint de l'import d'un `.mjs` sans types,
ajouter `// @ts-expect-error untyped ops script` au-dessus de l'import dans le
test, pas une déclaration de module.

- [ ] **Step 5 : commit**

```bash
git add ops/sync-photos.mjs tests/sync-photos.test.ts
git commit -m "Photo copy from Supabase Storage to the uploads volume, resumable, without dependency"
```

### Task 7 : CI et déploiement continu

**Files :**
- Modify : `.github/workflows/ci.yml`
- Create : `.github/workflows/deploy.yml`

**Interfaces :**
- Consumes : `Dockerfile` (Tâche 4), `ops/backup` (Tâche 5),
  `docker-compose.yml`.
- Produces : images GHCR ; déploiement preprod sur push `develop`, prod sur
  tag `v*`. Secrets requis : `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.

- [ ] **Step 1 : `ci.yml`.** Le step « Build (runs the environment check) »
  devient deux steps :

```yaml
      - name: Environment check (production rules)
        run: npm run check:env
        env:
          APP_URL: https://ci.example.com
          SESSION_SECRET: ci-session-secret-0123456789abcdef
          CRON_SECRET: ci-cron-secret-0123456789abcdef
          DATA_DIR: ./data

      - name: Build
        run: npm run build
```

  Puis ajouter un second job, à la suite de `test` :

```yaml
  image:
    name: Docker image, migrations and smoke test against the container
    runs-on: ubuntu-latest
    timeout-minutes: 20
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_USER: shespeaks, POSTGRES_PASSWORD: shespeaks, POSTGRES_DB: shespeaks }
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U shespeaks" --health-interval 5s --health-timeout 5s --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t shespeaks:ci .
      - run: docker build -t shespeaks-backup:ci ops/backup
      - name: Migrations from the image (environment check included)
        run: >-
          docker run --rm --network host
          -e DATABASE_URL='postgresql://shespeaks:shespeaks@localhost:5432/shespeaks?sslmode=disable'
          -e APP_URL=https://ci.example.com -e SESSION_SECRET=ci-session-secret-0123456789abcdef
          -e CRON_SECRET=ci-cron-secret-0123456789abcdef -e ADMIN_EMAIL=coach@example.com -e DEPLOY_ENV=preprod
          shespeaks:ci sh -c 'node --experimental-strip-types --no-warnings scripts/check-env.mjs --strict && node --experimental-strip-types --no-warnings scripts/db.mjs setup'
      - name: Start the container
        run: |
          docker run -d --name app --network host \
            -e DATABASE_URL='postgresql://shespeaks:shespeaks@localhost:5432/shespeaks?sslmode=disable' \
            -e APP_URL=https://ci.example.com -e SESSION_SECRET=ci-session-secret-0123456789abcdef \
            -e CRON_SECRET=ci-cron-secret-0123456789abcdef -e DEPLOY_ENV=preprod shespeaks:ci
          for i in $(seq 1 30); do curl -sf http://localhost:3000/api/health > /dev/null && exit 0; sleep 1; done
          docker logs app; exit 1
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - name: Smoke test against the container
        run: node scripts/smoke.mjs
        env: { SESSION_SECRET: ci-session-secret-0123456789abcdef }
      - if: always()
        run: docker logs app || true
```

- [ ] **Step 2 : `deploy.yml`**

```yaml
name: Deploy

on:
  push:
    branches: [develop]
    tags: ['v*']

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false

env:
  REGISTRY: ghcr.io/iamvaln

jobs:
  images:
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    outputs:
      tag: ${{ steps.t.outputs.tag }}
    steps:
      - uses: actions/checkout@v4
      - id: t
        run: echo "tag=${{ github.ref_type == 'tag' && github.ref_name || 'develop' }}" >> "$GITHUB_OUTPUT"
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: '${{ github.actor }}', password: '${{ secrets.GITHUB_TOKEN }}' }
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ${{ env.REGISTRY }}/shespeaks:${{ steps.t.outputs.tag }}
            ${{ github.ref_type == 'tag' && format('{0}/shespeaks:latest', env.REGISTRY) || '' }}
          cache-from: type=gha,scope=app
          cache-to: type=gha,scope=app,mode=max
      - uses: docker/build-push-action@v6
        with:
          context: ops/backup
          push: true
          tags: ${{ env.REGISTRY }}/shespeaks-backup:${{ steps.t.outputs.tag }}

  deploy:
    needs: images
    runs-on: ubuntu-latest
    environment: ${{ github.ref_type == 'tag' && 'production' || 'preprod' }}
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          envs: GHCR_USER,GHCR_TOKEN,TAG,STACK,DIR,ENVFILE,PROFILE,REF
          script: |
            set -euo pipefail
            cd "$HOME/$DIR"
            echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
            git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GHCR_TOKEN" | base64 -w0)" fetch --tags origin
            git checkout --force "$REF"
            export IMAGE_TAG="$TAG"
            # the project Compose announces must be this environment's, never the other one (lehno, 14 September)
            PROJET=$(docker compose --env-file "$ENVFILE" config --format json | sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' | head -1)
            [ "$PROJET" = "$STACK" ] || { echo "STOP: Compose announces « $PROJET », expected « $STACK »"; exit 1; }
            n=0
            until docker compose --env-file "$ENVFILE" $PROFILE pull; do
              n=$((n+1)); [ "$n" -ge 3 ] && { echo "pull failed $n times"; exit 1; }; sleep 10
            done
            docker compose --env-file "$ENVFILE" $PROFILE up -d --remove-orphans
            # `up -d` returns before the app is healthy: wait for it, and fail the run if it never is
            for i in $(seq 1 30); do
              s=$(docker inspect -f '{{.State.Health.Status}}' "$STACK-app-1" 2>/dev/null || echo none)
              [ "$s" = "healthy" ] && break
              sleep 3
            done
            [ "$s" = "healthy" ] || { docker compose --env-file "$ENVFILE" logs --tail 80 migrate app; exit 1; }
            docker logout ghcr.io
            docker image prune -f
        env:
          GHCR_USER: ${{ github.actor }}
          GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAG: ${{ needs.images.outputs.tag }}
          REF: ${{ github.ref_type == 'tag' && github.ref_name || 'origin/develop' }}
          STACK: ${{ github.ref_type == 'tag' && 'shespeaks' || 'shespeaks-preprod' }}
          DIR: ${{ github.ref_type == 'tag' && 'shespeaks' || 'shespeaks-preprod' }}
          ENVFILE: ${{ github.ref_type == 'tag' && '.env.production' || '.env.preprod' }}
          PROFILE: ${{ github.ref_type == 'tag' && '--profile prod' || '' }}
```

- [ ] **Step 3 : vérifier la syntaxe**

```bash
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -color .github/workflows/ci.yml .github/workflows/deploy.yml
```
Expected : aucune erreur (avertissements shellcheck à corriger s'ils
portent sur une vraie variable non citée).

- [ ] **Step 4 : commit, push de la branche et PR vers `develop`**

```bash
git add .github/workflows/ci.yml .github/workflows/deploy.yml
git commit -m "CI builds and smoke-tests the Docker image; deploys to the VPS: develop to preprod, v* tags to production"
git push -u origin feat/migration-vps
```
La PR ne se fusionne qu'après la Tâche 11 (secrets et dossiers du VPS en
place) : sinon le premier push sur `develop` déclenche un déploiement qui
échoue. Suivre la CI de la PR avec `gh pr checks --watch`.

### Task 8 : script de bascule

**Files :**
- Create : `ops/cutover-remote.sh` (exécuté sur le VPS),
  `ops/cutover.sh` (exécuté sur le poste)

**Interfaces :**
- Consumes : `/api/health` (Tâche 3), `ops/sync-photos.mjs` (Tâche 6),
  volumes et réseau de la Tâche 4.
- Produces : `ops/cutover-remote.sh <stack> <step>` avec les étapes
  `preflight | stop-app | copy-db | sync-photos | verify | start-app | wipe`
  (`wipe` refusé pour `shespeaks`) ; `ops/cutover.sh [--rehearsal]`.
- Sur le VPS, les identifiants Supabase vivent dans
  `~/<dossier>/ops/.env.cutover` (chmod 600, ignoré par git, supprimé après la
  bascule) : `SUPABASE_DB_URL` (pooler en mode session, port 5432),
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Step 1 : `ops/cutover-remote.sh`** (exécutable)

```bash
#!/bin/bash
# Cutover steps, run on the VPS from the stack's folder: ops/cutover-remote.sh <shespeaks|shespeaks-preprod> <step>
set -euo pipefail
STACK=${1:?stack}; STEP=${2:?step}
case "$STACK" in shespeaks) ENVFILE=.env.production ;; shespeaks-preprod) ENVFILE=.env.preprod ;; *) echo "unknown stack" >&2; exit 2 ;; esac
cd "$(dirname "$0")/.."
DC="docker compose --env-file $ENVFILE"
PG_CLIENT=${PG_CLIENT:-postgres:17-alpine}   # >= the Supabase server version (checked in preflight)
NET="${STACK}_internal"
VOL="${STACK}_uploads"
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' "$ENVFILE")
TARGET="postgresql://shespeaks:${PW}@db:5432/shespeaks?sslmode=disable"
CUT=ops/.env.cutover
TABLES_SQL="select tablename from pg_tables where schemaname='public' and tablename <> 'schema_migrations' order by 1"

src_psql() { docker run --rm -i --env-file "$CUT" "$PG_CLIENT" sh -c 'psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 "$@"' -- "$@"; }
dst_psql() { docker run --rm -i --network "$NET" "$PG_CLIENT" psql "$TARGET" -X -q -v ON_ERROR_STOP=1 "$@"; }
counts() { local run=$1 out=""; for t in $($run -tAc "$TABLES_SQL"); do out+="$t $($run -tAc "select count(*) from public.\"$t\"")"$'\n'; done; printf '%s' "$out"; }

case "$STEP" in
  preflight)
    [ -f "$CUT" ] || { echo "missing $CUT"; exit 1; }
    [ "$(stat -c %a "$CUT")" = "600" ] || { echo "$CUT must be chmod 600"; exit 1; }
    echo "supabase server: $(src_psql -tAc 'show server_version')   client: $(docker run --rm "$PG_CLIENT" pg_dump --version)"
    $DC ps --format '{{.Service}} {{.State}} {{.Health}}'
    echo "target rows (should be the seed only):"; counts dst_psql
    ;;
  stop-app)  $DC stop app ;;
  copy-db)
    tables=$(dst_psql -tAc "$TABLES_SQL" | sed 's/.*/public."&"/' | paste -sd, -)
    {
      echo "SET session_replication_role = replica;"   # foreign keys are checked by the source; rows arrive table by table
      echo "TRUNCATE $tables RESTART IDENTITY CASCADE;"
      docker run --rm --env-file "$CUT" "$PG_CLIENT" sh -c 'pg_dump "$SUPABASE_DB_URL" --data-only --schema=public --exclude-table=public.schema_migrations --no-owner --no-privileges' \
        | sed '/^SET transaction_timeout/d'   # pg_dump 17 writes it, Postgres 16 refuses it
    } | dst_psql --single-transaction
    echo "copy-db done"
    ;;
  sync-photos)
    docker run --rm --user 1000:1000 --env-file "$CUT" -v "$VOL:/data/uploads" -v "$PWD/ops:/ops:ro" node:22-alpine node /ops/sync-photos.mjs /data/uploads
    ;;
  verify)
    a=$(counts src_psql); b=$(counts dst_psql)
    if [ "$a" != "$b" ]; then echo "ROW COUNTS DIFFER"; diff <(echo "$a") <(echo "$b") || true; exit 1; fi
    echo "row counts identical:"; echo "$a"
    want=$(dst_psql -tAc "select filename from photos order by 1")
    have=$(docker run --rm -v "$VOL:/u:ro" alpine sh -c 'cd /u && find . -type f ! -name "*.part" | sed "s|^\./||" | sort')
    lost=$(comm -23 <(echo "$want" | sed '/^$/d' | sort) <(echo "$have" | sort))
    [ -z "$lost" ] || { echo "PHOTOS WITHOUT A FILE:"; echo "$lost"; exit 1; }
    echo "every photo row has its file ($(echo "$want" | sed '/^$/d' | wc -l))"
    echo "addresses in the links of email_log:"
    dst_psql -tAc "select substring(body_text from 'https?://[^/[:space:]]+') as host, count(*) from email_log group by 1 order by 2 desc"
    ;;
  start-app)
    $DC up -d app
    for i in $(seq 1 30); do [ "$(docker inspect -f '{{.State.Health.Status}}' "$STACK-app-1")" = healthy ] && { echo "app healthy"; exit 0; }; sleep 3; done
    echo "app not healthy"; $DC logs --tail 80 app; exit 1
    ;;
  wipe)
    [ "$STACK" = shespeaks-preprod ] || { echo "wipe is for the preprod only" >&2; exit 2; }
    tables=$(dst_psql -tAc "$TABLES_SQL" | sed 's/.*/public."&"/' | paste -sd, -)
    dst_psql -c "TRUNCATE $tables RESTART IDENTITY CASCADE;"
    docker run --rm -v "$VOL:/u" alpine sh -c 'rm -rf /u/*'
    $DC run --rm migrate   # seed again
    echo "preprod wiped"
    ;;
  *) echo "unknown step $STEP" >&2; exit 2 ;;
esac
```

- [ ] **Step 2 : `ops/cutover.sh`** (exécutable)

```bash
#!/bin/bash
# Cutover from Vercel + Supabase to the VPS. Run from a workstation: ops/cutover.sh [--rehearsal]
# --rehearsal: same steps into the preprod, without the Vercel step.
set -euo pipefail
if [ "${1:-}" = "--rehearsal" ]; then STACK=shespeaks-preprod; DIR=shespeaks-preprod; DOMAIN=sheleads.techiesconnect.net; REH=1
else STACK=shespeaks; DIR=shespeaks; DOMAIN=sheleads.techiesconnect.org; REH=0; fi
R() { ssh deploy-vps "cd ~/$DIR && ops/cutover-remote.sh $STACK $1"; }
t0=$(date +%s); step() { echo; echo "== [$(( $(date +%s) - t0 ))s] $*"; }

step "preflight"
R preflight
[ "$(dig +short "$DOMAIN" @1.1.1.1 | tail -1)" = "77.237.234.91" ] || { echo "$DOMAIN does not resolve to the VPS"; exit 1; }
curl -sf "https://$DOMAIN/api/health" > /dev/null || { echo "https://$DOMAIN/api/health does not answer"; exit 1; }
step "bulk photo copy (ahead of the window)"
R sync-photos
read -r -p "Everything above is right? Type GO to start the window: " a; [ "$a" = GO ] || exit 1

step "window opens: app stopped, waiting page served"
R stop-app
if [ "$REH" = 0 ]; then
  echo "Now promote the vercel-redirect deployment in Vercel (Deployments → … → Promote to Production)."
  read -r -p "Type PROMOTED once it is live: " a; [ "$a" = PROMOTED ] || { echo "aborting: restart the VPS app with 'R start-app' if needed"; exit 1; }
  sleep 10   # requests already running on Vercel finish
fi
step "database copy";  R copy-db
step "photo catch-up";  R sync-photos
step "checks";          R verify
step "app starts";      R start-app
for p in / /interet /admin/login /api/health; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN$p"); echo "$code $p"
  case "$code" in 200|307) ;; *) echo "smoke failed on $p"; exit 1 ;; esac
done
step "done in $(( $(date +%s) - t0 ))s"
[ "$REH" = 0 ] && echo "Rollback until now: promote the previous production deployment in Vercel. Supabase was never written to."
```

- [ ] **Step 3 : vérifier la syntaxe**

```bash
bash -n ops/cutover-remote.sh && bash -n ops/cutover.sh && echo ok
docker run --rm -v "$PWD:/mnt" koalaman/shellcheck:stable /mnt/ops/cutover-remote.sh /mnt/ops/cutover.sh /mnt/ops/cron/cron-loop.sh
```
Expected : `ok` ; corriger les avertissements shellcheck qui portent sur des
variables non citées. Le vrai test est la répétition (Tâche 12).

- [ ] **Step 4 : commit**

```bash
git add ops/cutover-remote.sh ops/cutover.sh
git commit -m "Cutover script: waiting page, database and photo copy from Supabase, row and file checks, rehearsal mode"
git push
```

### Task 9 : redirection de l'ancienne adresse (branche `vercel-redirect`)

**Files (branche orpheline `vercel-redirect`) :**
- Create : `package.json`, `redirect.ts`, `middleware.ts`, `app/layout.tsx`,
  `app/page.tsx`, `redirect.test.ts`, `tsconfig.json`, `.gitignore`

**Interfaces :**
- Produces : `redirectTarget(pathname: string, search: string, token: string | undefined): { url: string; status: 307 | 308 }`.

- [ ] **Step 1 : créer la branche dans un worktree séparé**

```bash
git worktree add --detach ../shespeaks-redirect
cd ../shespeaks-redirect && git checkout --orphan vercel-redirect && git rm -rf . -q
```

- [ ] **Step 2 : test qui échoue** `redirect.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redirectTarget } from './redirect.ts';

const NEW = 'https://sheleads.techiesconnect.org';
const TOKEN = 'Ab3_dE-f'.repeat(4);

test('a candidate with a session goes to her resume link on the new domain', () => {
  assert.deepEqual(redirectTarget('/interet', '', TOKEN), { url: `${NEW}/reprendre/${TOKEN}`, status: 307 });
});
test('resume links from old emails keep their path', () => {
  assert.deepEqual(redirectTarget(`/reprendre/${TOKEN}`, '', undefined), { url: `${NEW}/reprendre/${TOKEN}`, status: 308 });
  assert.deepEqual(redirectTarget(`/reprendre/${TOKEN}`, '', 'other-token-other-token-0'), { url: `${NEW}/reprendre/${TOKEN}`, status: 308 });
});
test('everyone else keeps path and query', () => {
  assert.deepEqual(redirectTarget('/admin/verify', '?t=abc', undefined), { url: `${NEW}/admin/verify?t=abc`, status: 308 });
  assert.deepEqual(redirectTarget('/', '', undefined), { url: `${NEW}/`, status: 308 });
});
test('a malformed cookie is ignored, not put in a URL', () => {
  assert.deepEqual(redirectTarget('/plan', '', 'a/../b'), { url: `${NEW}/plan`, status: 308 });
  assert.deepEqual(redirectTarget('/plan', '', 'short'), { url: `${NEW}/plan`, status: 308 });
});
```

- [ ] **Step 3 : implémentation** `redirect.ts`

```ts
// The old Vercel address now only forwards to the VPS. A candidate's session cookie belongs to the old domain and does not
// follow the redirect: when she has one, she is sent through her resume link, which sets it again on the new domain.
export const NEW_ORIGIN = 'https://sheleads.techiesconnect.org';
const TOKEN = /^[A-Za-z0-9_-]{20,128}$/;

export function redirectTarget(pathname: string, search: string, token: string | undefined): { url: string; status: 307 | 308 } {
  if (!pathname.startsWith('/reprendre/') && token && TOKEN.test(token)) return { url: `${NEW_ORIGIN}/reprendre/${token}`, status: 307 };
  return { url: `${NEW_ORIGIN}${pathname}${search}`, status: 308 };
}
```

  `middleware.ts`

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { redirectTarget } from './redirect.ts';

export function middleware(req: NextRequest) {
  const { url, status } = redirectTarget(req.nextUrl.pathname, req.nextUrl.search, req.cookies.get('ss_token')?.value);
  return NextResponse.redirect(url, status);
}
export const config = { matcher: '/:path*' };
```

  `app/layout.tsx` et `app/page.tsx` (jamais servis, Next les exige) :

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="fr"><body>{children}</body></html>;
}
```

```tsx
export default function Page() {
  return <p>SheSpeaks a déménagé : https://sheleads.techiesconnect.org</p>;
}
```

  `package.json`

```json
{
  "name": "shespeaks-redirect",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.18" },
  "scripts": { "build": "next build", "test": "node --test --experimental-strip-types redirect.test.ts" },
  "dependencies": { "next": "^15.5.0", "react": "^19.1.0", "react-dom": "^19.1.0" },
  "devDependencies": { "@types/react": "^19.1.0", "@types/node": "^22.0.0", "typescript": "^5.7.0" }
}
```

  `tsconfig.json` : copier celui de `develop` sans la ligne `paths`.
  `.gitignore` : `node_modules`, `.next`, `next-env.d.ts`.

- [ ] **Step 4 : vérifier**

```bash
npm install && npm test && npx next build
```
Expected : 4 tests passent, build OK.

- [ ] **Step 5 : commit et push** (Vercel construit alors un déploiement de
  preview de cette branche, non promu)

```bash
git add -A && git commit -m "Old Vercel address forwards to sheleads.techiesconnect.org; candidates keep their session through their resume link"
git push -u origin vercel-redirect
cd - && git worktree remove ../shespeaks-redirect
```

### Task 10 : documentation

**Files :**
- Create : `docs/deploy-vps.md`
- Modify : `README.md` (section « Deploy » et « Database, CI and
  deployments »), `.env.example`

- [ ] **Step 1 : `docs/deploy-vps.md`** avec ces sections, en français, chaque
  commande copiable :
  1. **Vue d'ensemble** : le tableau des services de `docker-compose.yml` et
     le flux develop → preprod, tag `v*` → prod.
  2. **Première installation d'un environnement** : les commandes de la
     Tâche 11 ci-dessous.
  3. **Variables** : chaque variable de `.env.compose.example`, son rôle, d'où
     vient sa valeur ; insister sur `SESSION_SECRET` repris de Vercel (clés de
     `rate_limits`).
  4. **Diagnostics** : `docker compose --env-file .env.production ps`,
     `logs --tail 200 app`, `logs cron`, `logs backup`, `psql` en lecture
     seule (`docker compose --env-file .env.production exec db psql -U shespeaks -d shespeaks`),
     relancer les relances à la main (commande `run --rm --entrypoint sh cron`
     de la Tâche 4).
  5. **Sauvegardes et restauration** : `docker compose --env-file .env.production --profile prod run --rm backup list`,
     `… backup restore latest`, `… backup restore-uploads latest`.
  6. **Bascule** : déroulé de `ops/cutover.sh`, marche arrière.

- [ ] **Step 2 : `README.md`** : remplacer les paragraphes Vercel/Supabase des
  sections « Deploy » et « Database, CI and deployments » par un résumé de
  cinq lignes et un lien vers `docs/deploy-vps.md` ; retirer les mentions de
  `MIGRATE_ON_BUILD` et du `prebuild`. `.env.example` : en tête, une ligne
  « Sur le VPS, voir `.env.compose.example` et `docs/deploy-vps.md` » ; la
  section « Database migrations on Vercel builds » devient « (Vercel
  uniquement, jusqu'à la bascule) ».

- [ ] **Step 3 : commit**

```bash
git add docs/deploy-vps.md README.md .env.example
git commit -m "Documentation: deploying and running SheSpeaks on the VPS"
git push
```

---

## Partie B : mise en service (actions sur le VPS et les comptes, avec l'utilisateur)

Chaque étape qui dépend d'un compte de l'utilisateur est marquée **[toi]**.

### Task 11 : préparer le VPS, les DNS et GitHub

- [ ] **Step 1 [toi]** : dans Cloudflare, créer `A sheleads → 77.237.234.91`
  dans la zone `techiesconnect.net` (preprod) et dans la zone
  `techiesconnect.org` (prod), **DNS only**. Vérifier : `dig +short sheleads.techiesconnect.org @1.1.1.1` →
  `77.237.234.91`.
- [ ] **Step 2 [toi]** : créer le compartiment R2 `shespeaks-backups` et un
  jeton limité à ce compartiment (lecture et écriture d'objets) ; noter
  l'account id, l'access key, la secret key.
- [ ] **Step 3 [toi]** : relever dans Vercel (Settings → Environment
  Variables, Production) `SESSION_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`,
  `MAIL_FROM`, `MAIL_REPLY_TO`, `ANTHROPIC_API_KEY`, `ADMIN_EMAIL`,
  `ADMIN_NAME` ; et dans Supabase la chaîne du pooler **en mode session**
  (port 5432), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] **Step 4 : dossiers et fichiers d'environnement sur le VPS**

```bash
ssh deploy-vps 'for d in shespeaks shespeaks-preprod; do [ -d ~/$d ] || git clone https://github.com/iamvaln/shespeaks.git ~/$d; done'
```
  Puis, sur le VPS, créer `~/shespeaks/.env.production` et
  `~/shespeaks-preprod/.env.preprod` à partir de `.env.compose.example`
  (chmod 600) :
  - prod : `STACK=shespeaks`, `DEPLOY_ENV=production`,
    `APP_DOMAIN=sheleads.techiesconnect.org`,
    `APP_URL=https://sheleads.techiesconnect.org`, `POSTGRES_PASSWORD=$(openssl rand -hex 24)`
    (généré sur le VPS), les valeurs de Vercel, les valeurs R2 ;
  - preprod : `STACK=shespeaks-preprod`, `DEPLOY_ENV=preprod`,
    `APP_DOMAIN=sheleads.techiesconnect.net`, `APP_URL` assortie,
    `POSTGRES_PASSWORD`, `SESSION_SECRET` et `CRON_SECRET` **neufs**
    (`openssl rand -hex 32`), `RESEND_API_KEY` vide (les mails de preprod
    restent dans la page Emails), `ANTHROPIC_API_KEY` vide.

  Ces fichiers ne contiennent **aucune ligne `IMAGE_TAG`** (le workflow la
  fournit à chaque déploiement ; à la main, la passer en ligne de commande) et
  doivent porter le bon `STACK` : `grep '^STACK=' ~/shespeaks/.env.production`
  → `shespeaks`, `~/shespeaks-preprod/.env.preprod` → `shespeaks-preprod`.

  Le dépôt n'a aucune image tant que la PR n'est pas fusionnée : passer à
  l'étape suivante avant de démarrer quoi que ce soit.
- [ ] **Step 5 : clé de déploiement et secrets GitHub**

```bash
ssh-keygen -t ed25519 -f ~/.ssh/shespeaks_deploy -C "github-actions-shespeaks" -N ""
ssh deploy-vps 'cat >> ~/.ssh/authorized_keys' < ~/.ssh/shespeaks_deploy.pub
gh secret set VPS_SSH_KEY < ~/.ssh/shespeaks_deploy
gh secret set VPS_HOST --body 77.237.234.91
gh secret set VPS_USER --body deploy
```
  Créer les environnements GitHub `preprod` et `production` (Settings →
  Environments) ; sur `production`, exiger une approbation manuelle.
- [ ] **Step 6** : fusionner la PR `feat/migration-vps` dans `develop`, puis
  suivre le run : `gh run list --workflow Deploy --limit 1` puis
  `gh run watch <id> --exit-status` et `gh run view <id> --json conclusion`.
  Expected : `success`, et `https://sheleads.techiesconnect.net/api/health`
  → `{"ok":true}`.

### Task 12 : valider la preprod et répéter la bascule

- [ ] **Step 1** : parcours manuel sur la preprod : formulaire complet sur
  les quatre branches, envoi de photo puis affichage sur `/plan`, connexion
  coach (le lien est dans la page Emails, puisque Resend est vide), fiche
  candidate, page Réglages.
- [ ] **Step 2** : relances à la main, avec le profil `prod` qui n'est pas
  lancé en preprod :

```bash
ssh deploy-vps 'cd ~/shespeaks-preprod && IMAGE_TAG=develop docker compose --env-file .env.preprod --profile prod run --rm --entrypoint sh cron -c "curl -fsS -X POST -H \"Authorization: Bearer \$CRON_SECRET\" http://app:3000/api/cron/reminders"'
```
  Expected : un rapport JSON ; les mails apparaissent dans la page Emails.
- [ ] **Step 3** : sauvegarde et restauration. Donner temporairement les
  variables R2 à la preprod dans `.env.preprod` (préfixe
  `BACKUP_R2_PREFIX=preprod-test`, désormais transmis au service `backup`),
  puis, avec `IMAGE_TAG=develop` en ligne de commande (le fichier n'a pas de
  `IMAGE_TAG`) :
  `IMAGE_TAG=develop docker compose --env-file .env.preprod --profile prod run --rm backup backup`,
  `IMAGE_TAG=develop … backup list`, `IMAGE_TAG=develop … backup restore latest`
  (taper le nom de la base), `IMAGE_TAG=develop … backup restore-uploads latest`.
  Retirer ensuite ces variables et
  supprimer le préfixe `preprod-test/` dans R2.
- [ ] **Step 4 : la page d'attente prend le relais (Review Focus 5)**

```bash
ssh deploy-vps 'cd ~/shespeaks-preprod && docker compose --env-file .env.preprod stop app'
curl -s -o /dev/null -w '%{http_code}\n' https://sheleads.techiesconnect.net/interet
ssh deploy-vps 'cd ~/shespeaks-preprod && docker compose --env-file .env.preprod start app'
```
  Expected : `503` pendant l'arrêt, puis `200` une fois `app` sain.
- [ ] **Step 5 : répétition générale**. Sur le VPS, créer
  `~/shespeaks-preprod/ops/.env.cutover` (chmod 600) avec les valeurs Supabase
  de la Tâche 11, puis depuis le poste : `ops/cutover.sh --rehearsal`.
  Expected : chaque étape réussit, `verify` affiche des comptes identiques et
  « every photo row has its file » ; noter la durée totale, la version du
  serveur Supabase et l'adresse dominante dans `email_log`. Si la version du
  serveur dépasse 17, relancer avec `PG_CLIENT=postgres:<version>-alpine`.
  Supabase reste en service pendant la répétition : `verify` peut signaler des
  écarts sur les tables qui bougent (`rate_limit_hits`, `login_tokens`,
  `email_log`). Lancer la répétition à une heure creuse et relancer `verify`
  (`ssh deploy-vps 'cd ~/shespeaks-preprod && ops/cutover-remote.sh shespeaks-preprod verify'`)
  avant de conclure à une vraie anomalie.
  Se connecter ensuite en coach sur la preprod et ouvrir trois fiches réelles
  avec photos pour vérifier à l'œil.
- [ ] **Step 6 : adresse IP falsifiée (Review Focus 1).** Un conteneur
  d'écho (`traefik/whoami`) branché sur le même domaine, avec une priorité plus
  haute pour le seul chemin `/__ip`, montre les en-têtes que l'app reçoit :

```bash
ssh deploy-vps 'docker run -d --rm --name ip-echo --network web -l traefik.enable=true -l "traefik.http.routers.ipecho.rule=Host(\`sheleads.techiesconnect.net\`) && PathPrefix(\`/__ip\`)" -l traefik.http.routers.ipecho.entrypoints=websecure -l traefik.http.routers.ipecho.tls.certresolver=le -l traefik.http.routers.ipecho.priority=200 -l traefik.http.services.ipecho.loadbalancer.server.port=80 traefik/whoami'
curl -s -H "X-Real-Ip: 203.0.113.9" -H "X-Forwarded-For: 203.0.113.9" https://sheleads.techiesconnect.net/__ip | grep -i -E "x-real-ip|x-forwarded-for"
ssh deploy-vps 'docker stop ip-echo'
```
  Expected : `X-Real-Ip` vaut **ta** vraie adresse, pas `203.0.113.9`. Si
  c'est `203.0.113.9`, la limite de débit se contourne : modifier
  `requestIp` (`src/lib/ratelimit.ts:20`) pour prendre le **dernier** élément
  de `x-forwarded-for` quand `DEPLOY_ENV` est défini (Traefik ajoute la vraie
  adresse en dernier), avec ce test dans `tests/logic.test.ts` ou le fichier
  qui teste déjà `requestIp` :

```ts
test('behind Traefik the client is the last x-forwarded-for hop, whatever the visitor sends', () => {
  const h = new Headers({ 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '203.0.113.9, 198.51.100.7' });
  assert.equal(requestIp(h, { DEPLOY_ENV: 'production' }), '198.51.100.7');
  assert.equal(requestIp(h, {}), '203.0.113.9'); // Vercel: x-real-ip is set by the platform
});
```
  (signature `requestIp(h: Headers, env = process.env)`), puis redéployer la
  preprod et refaire la vérification.
- [ ] **Step 7** : vider la preprod :
  `ssh deploy-vps 'cd ~/shespeaks-preprod && ops/cutover-remote.sh shespeaks-preprod wipe && rm ops/.env.cutover'`.

### Task 13 : prod sur le VPS, puis bascule

- [ ] **Step 1** : tag de la version validée en preprod, **sur `develop`**
  (fusionner dans `main` ne vient qu'après la bascule, pour que Vercel ne
  reconstruise pas sa prod en pleine opération) :
  `git tag v1.0.0 origin/develop && git push origin v1.0.0`, approuver le
  déploiement dans GitHub, suivre le run jusqu'au `success`. Vérifier
  `https://sheleads.techiesconnect.org/api/health` → `{"ok":true}` et
  `docker compose --env-file .env.production --profile prod ps` : `cron` et
  `backup` démarrés ; `logs backup` dit « uploaded ».
- [ ] **Step 2 [toi]** : choisir le créneau (heure creuse, la nuit à Douala) ;
  dans Vercel, vérifier que le déploiement de la branche `vercel-redirect` est
  prêt et que l'ancien déploiement de prod est repérable pour une marche
  arrière.
- [ ] **Step 3** : créer `~/shespeaks/ops/.env.cutover` (chmod 600) sur le
  VPS, puis lancer `ops/cutover.sh` depuis le poste. Au message, **[toi]**
  promouvoir `vercel-redirect`.
- [ ] **Step 4** : **avant** de fusionner `develop` dans `main`, dans Vercel
  (Settings → Git), régler la **Production Branch** sur `vercel-redirect` (ou
  déconnecter l'intégration Git) : sinon le push sur `main` redéploie
  l'ancienne application par-dessus la redirection. Puis, après le succès :
  - tester l'ancienne adresse : `curl -sI https://shespeaks-taupe.vercel.app/interet`
    → `308` vers `https://sheleads.techiesconnect.org/interet` ; un lien
    `/reprendre/<jeton>` d'un vrai mail de `email_log` ouvre bien la session ;
  - **[toi]** se connecter en coach sur le nouveau domaine, et **tester un
    envoi de photo en production** juste après la bascule (formulaire, puis
    affichage sur `/plan`) ;
  - supprimer `~/shespeaks/ops/.env.cutover` ;
  - fusionner `develop` dans `main`.
- [ ] **Step 5** : le lendemain, vérifier `logs cron` (relances de 07:00
  UTC) et `logs backup` (sauvegarde de 02:00 UTC). Dans deux semaines :
  la PR de nettoyage (hors de ce plan) et la suppression du projet Supabase.
