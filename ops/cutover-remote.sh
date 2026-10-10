#!/bin/bash
# Cutover steps, run on the VPS from the stack's folder: ops/cutover-remote.sh <shespeaks|shespeaks-preprod> <step>
# steps: preflight | stop-app | copy-db | sync-photos | verify | start-app | wipe
set -euo pipefail
STACK=${1:?stack}; STEP=${2:?step}
case "$STACK" in shespeaks) ENVFILE=.env.production ;; shespeaks-preprod) ENVFILE=.env.preprod ;; *) echo "unknown stack" >&2; exit 2 ;; esac
cd "$(dirname "$0")/.."
[ -f "$ENVFILE" ] || { echo "missing $ENVFILE" >&2; exit 1; }

# An exported shell variable beats --env-file in compose interpolation: drop everything the caller may have
# exported that compose would read (the variables of the env file, and compose's own), then re-check the project.
KEEP_STACK=$STACK   # the env file defines STACK too: the unset below would take the script's own value away
while IFS= read -r v; do unset "$v"; done < <(sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' "$ENVFILE")
unset COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_PROFILES COMPOSE_ENV_FILES
STACK=$KEEP_STACK   # a fresh assignment is not exported: compose still reads STACK from the env file only
# CUTOVER_COMPOSE_OVERRIDE: extra compose file for a local rehearsal (e.g. docker-compose.local.yml); unused on the VPS.
DC=(docker compose)
[ -z "${CUTOVER_COMPOSE_OVERRIDE:-}" ] || DC+=(-f docker-compose.yml -f "$CUTOVER_COMPOSE_OVERRIDE")
DC+=(--env-file "$ENVFILE")
project=$("${DC[@]}" config --format json | sed -n 's/^  "name": "\(.*\)",$/\1/p')
[ "$project" = "$STACK" ] || { echo "compose project is '$project', expected '$STACK': refusing to go on" >&2; exit 2; }

PG_CLIENT=${PG_CLIENT:-postgres:17-alpine}   # >= the Supabase server version (checked in preflight)
NET="${STACK}_internal"
VOL="${STACK}_uploads"
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' "$ENVFILE")
[ -n "$PW" ] || { echo "POSTGRES_PASSWORD missing in $ENVFILE" >&2; exit 1; }
TARGET="postgresql://shespeaks:${PW}@db:5432/shespeaks?sslmode=disable"
CUT=ops/.env.cutover
TABLES_SQL="select tablename from pg_tables where schemaname='public' and tablename <> 'schema_migrations' order by 1"

src_psql() { docker run --rm -i --env-file "$CUT" "$PG_CLIENT" sh -c 'psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 "$@"' -- "$@"; }
dst_psql() { docker run --rm -i --network "$NET" "$PG_CLIENT" psql "$TARGET" -X -q -v ON_ERROR_STOP=1 "$@"; }
# Fails (instead of printing a partial list) when the table list or a count cannot be read.
counts() {
  local run=$1 out="" t tl n
  tl=$($run -tAc "$TABLES_SQL") || return 1
  [ -n "$tl" ] || return 1
  for t in $tl; do n=$($run -tAc "select count(*) from public.\"$t\"") || return 1; out+="$t $n"$'\n'; done
  printf '%s' "$out"
}
file_mode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }   # GNU (VPS) or BSD (workstation)

case "$STEP" in
  preflight)
    [ -f "$CUT" ] || { echo "missing $CUT"; exit 1; }
    [ "$(file_mode "$CUT")" = "600" ] || { echo "$CUT must be chmod 600"; exit 1; }
    server=$(src_psql -tAc 'show server_version')
    client=$(docker run --rm "$PG_CLIENT" pg_dump --version)
    echo "supabase server: $server   client: $client"
    server_major=${server%%.*}
    client_major=$(echo "$client" | sed -n 's/^pg_dump (PostgreSQL) \([0-9]*\).*/\1/p')
    case "$server_major$client_major" in ''|*[!0-9]*) echo "cannot read the Postgres versions" >&2; exit 1 ;; esac
    [ "$server_major" -le "$client_major" ] || { echo "Supabase server ($server_major) is newer than the dump client ($client_major): set PG_CLIENT to a newer image" >&2; exit 1; }
    src_mig=$(src_psql -tAc "select filename from schema_migrations order by 1")
    dst_mig=$(dst_psql -tAc "select filename from schema_migrations order by 1")
    [ -n "$src_mig" ] && [ -n "$dst_mig" ] || { echo "cannot read schema_migrations (source or target)" >&2; exit 1; }
    if [ "$src_mig" != "$dst_mig" ]; then
      echo "MIGRATIONS DIFFER (< source Supabase, > target):" >&2
      diff <(echo "$src_mig") <(echo "$dst_mig") >&2 || true
      exit 1
    fi
    echo "migrations identical ($(echo "$src_mig" | wc -l | tr -d ' '))"
    "${DC[@]}" ps --format '{{.Service}} {{.State}} {{.Health}}'
    echo "target rows (should be the seed only):"; counts dst_psql
    ;;
  stop-app)  "${DC[@]}" stop app ;;
  copy-db)
    tables=$(dst_psql -tAc "$TABLES_SQL" | sed 's/.*/public."&"/' | paste -sd, -)
    [ -n "$tables" ] || { echo "no table on the target: has the migrate service run?" >&2; exit 1; }
    # The copy truncates the target: on production, refuse once the VPS holds candidates (go-live already happened).
    if [ "$STACK" = shespeaks ] && [ "${CUTOVER_ALLOW_OVERWRITE:-}" != 1 ]; then
      have=$(dst_psql -tAc "select count(*) from candidates") || { echo "cannot count the target candidates" >&2; exit 1; }
      [ "$have" = 0 ] || { echo "REFUSED: production already holds $have candidate(s); copy-db would erase them. Set CUTOVER_ALLOW_OVERWRITE=1 only if that is intended." >&2; exit 1; }
    fi
    # Dump to a file first: a dump that dies halfway must not be restored (psql would commit what it got).
    dump=$(umask 077; mktemp "${TMPDIR:-/tmp}/cutover-dump.XXXXXX")
    trap 'rm -f "$dump"' EXIT
    docker run --rm --env-file "$CUT" "$PG_CLIENT" sh -c 'pg_dump "$SUPABASE_DB_URL" --data-only --schema=public --exclude-table=public.schema_migrations --no-owner --no-privileges' > "$dump"
    [ -s "$dump" ] || { echo "empty dump" >&2; exit 1; }
    {
      echo "SET session_replication_role = replica;"   # foreign keys are checked by the source; rows arrive table by table
      echo "TRUNCATE $tables RESTART IDENTITY CASCADE;"
      sed '/^SET transaction_timeout/d' "$dump"   # pg_dump 17 writes it, Postgres 16 refuses it
    } | dst_psql --single-transaction
    echo "copy-db done"
    ;;
  sync-photos)
    docker run --rm --user 1000:1000 --env-file "$CUT" -v "$VOL:/data/uploads" -v "$PWD/ops:/ops:ro" node:22-alpine node /ops/sync-photos.mjs /data/uploads
    ;;
  verify)
    a=$(counts src_psql) || { echo "cannot count the source rows" >&2; exit 1; }
    b=$(counts dst_psql) || { echo "cannot count the target rows" >&2; exit 1; }
    [ -n "$a" ] && [ -n "$b" ] || { echo "empty row counts" >&2; exit 1; }
    if [ "$a" != "$b" ]; then echo "ROW COUNTS DIFFER"; diff <(echo "$a") <(echo "$b") || true; exit 1; fi
    echo "row counts identical:"; echo "$a"
    want=$(dst_psql -tAc "select filename from photos order by 1")
    have=$(docker run --rm -v "$VOL:/u:ro" alpine sh -c 'cd /u && find . -type f ! -name "*.part" | sed "s|^\./||" | sort')
    lost=$(comm -23 <(echo "$want" | sed '/^$/d' | sort) <(echo "$have" | sort))
    [ -z "$lost" ] || { echo "PHOTOS WITHOUT A FILE:"; echo "$lost"; exit 1; }
    echo "every photo row has its file ($(echo "$want" | sed '/^$/d' | wc -l | tr -d ' '))"
    echo "addresses in the links of email_log:"
    dst_psql -tAc "select substring(body_text from 'https?://[^/[:space:]]+') as host, count(*) from email_log group by 1 order by 2 desc"
    ;;
  start-app)
    "${DC[@]}" start app   # inverse of stop-app: same container, same image
    for _ in $(seq 1 30); do [ "$(docker inspect -f '{{.State.Health.Status}}' "$STACK-app-1")" = healthy ] && { echo "app healthy"; exit 0; }; sleep 3; done
    echo "app not healthy"; "${DC[@]}" logs --tail 80 app; exit 1
    ;;
  wipe)
    [ "$STACK" = shespeaks-preprod ] || { echo "wipe is for the preprod only" >&2; exit 2; }
    # pin the tag to the running app image, not to the env file / defaults
    IMAGE_TAG=$(docker inspect -f '{{.Config.Image}}' "$STACK-app-1" | sed 's/.*://')
    [ -n "$IMAGE_TAG" ] || { echo "cannot read the running app image" >&2; exit 1; }
    export IMAGE_TAG
    tables=$(dst_psql -tAc "$TABLES_SQL" | sed 's/.*/public."&"/' | paste -sd, -)
    dst_psql -c "TRUNCATE $tables RESTART IDENTITY CASCADE;"
    docker run --rm -v "$VOL:/u" alpine sh -c 'rm -rf /u/*'
    "${DC[@]}" run --rm migrate   # seed again
    echo "preprod wiped"
    ;;
  *) echo "unknown step $STEP" >&2; exit 2 ;;
esac
