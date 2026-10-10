#!/bin/bash
# Cutover from Vercel + Supabase to the VPS. Run from a workstation: ops/cutover.sh [--rehearsal]
# --rehearsal: same data steps into the preprod, without the Vercel and DNS steps.
#
# Production keeps its address, shespeaks.techiesconnect.org, whose DNS moves from Vercel to the VPS. The order matters:
#   1. Vercel stops taking writes (its production serves the waiting page of the vercel-redirect app for this host),
#   2. the data is copied and checked while nobody can write anywhere,
#   3. the DNS record moves to the VPS, then the app starts there (Traefik gets the certificate once the DNS points to it).
# Visitors whose resolver still has the old answer keep seeing Vercel's waiting page, which reloads itself, until it expires.
set -euo pipefail
VPS_IP=77.237.234.91
VERCEL_CNAME=3274a422fa4302f2.vercel-dns-017.com   # the record before the cutover, for a rollback
if [ "${1:-}" = "--rehearsal" ]; then STACK=shespeaks-preprod; DIR=shespeaks-preprod; DOMAIN=sheleads.techiesconnect.net; REH=1
else STACK=shespeaks; DIR=shespeaks; DOMAIN=shespeaks.techiesconnect.org; REH=0; fi
# shellcheck disable=SC2029  # DIR, STACK and the step are meant to expand here
R() { ssh -n deploy-vps "cd ~/$DIR && CUTOVER_ALLOW_OVERWRITE=${CUTOVER_ALLOW_OVERWRITE:-} ops/cutover-remote.sh $STACK $1"; }
t0=$(date +%s); step() { echo; echo "== [$(( $(date +%s) - t0 ))s] $*"; }
# the VPS answer for DOMAIN, whatever the public DNS says (-k until Traefik has the certificate)
vps() { curl -s ${2:+"$2"} -o /dev/null -w '%{http_code}' --max-time 15 --resolve "$DOMAIN:443:$VPS_IP" "https://$DOMAIN$1"; }
# wait until a check passes: wait_for <seconds> <description> <command…>
wait_for() { local max=$1 what=$2; shift 2; local i=0; until "$@"; do i=$((i+5)); [ "$i" -ge "$max" ] && { echo "TIMEOUT: $what"; return 1; }; sleep 5; done; echo "ok: $what (${i}s)"; }
vercel_waiting() { curl -s --max-time 10 "https://$DOMAIN/interet" | grep -q 'On revient dans un instant'; }
dns_on_vps() { [ "$(dig +short "$DOMAIN" @1.1.1.1 | tail -1)" = "$VPS_IP" ] && [ "$(dig +short "$DOMAIN" @8.8.8.8 | tail -1)" = "$VPS_IP" ]; }
cert_ok() { [ "$(vps /api/health)" = 200 ]; }   # strict TLS: a valid certificate for DOMAIN

step "preflight"
R preflight
if [ "$REH" = 1 ]; then
  [ "$(dig +short "$DOMAIN" @1.1.1.1 | tail -1)" = "$VPS_IP" ] || { echo "$DOMAIN does not resolve to the VPS"; exit 1; }
  curl -sf "https://$DOMAIN/api/health" > /dev/null || { echo "https://$DOMAIN/api/health does not answer"; exit 1; }
else
  [ "$(vps /api/health -k)" = 200 ] || { echo "the production stack on the VPS does not answer for $DOMAIN"; exit 1; }
  echo "public DNS for $DOMAIN today: $(dig +short "$DOMAIN" @1.1.1.1 | tr '\n' ' ')"
fi
step "bulk photo copy (ahead of the window)"
R sync-photos
read -r -p "Everything above is right? Type GO to start the window: " a; [ "$a" = GO ] || exit 1

step "window opens: VPS app stopped"
R stop-app
if [ "$REH" = 0 ]; then
  echo "In Vercel → Settings → Git → Production Branch: set it to vercel-redirect and save (Vercel builds it, about a minute)."
  echo "Waiting until https://$DOMAIN serves the waiting page (Vercel no longer takes writes)…"
  wait_for 900 "Vercel serves the waiting page" vercel_waiting || { echo "nothing was copied: set the Production Branch back to main, then: ssh deploy-vps 'cd ~/$DIR && ops/cutover-remote.sh $STACK start-app'"; exit 1; }
  sleep 10   # requests already running on Vercel finish
fi
step "database copy";  R copy-db
step "photo catch-up";  R sync-photos
step "checks";          R verify
if [ "$REH" = 0 ]; then
  step "DNS"
  echo "In Cloudflare, zone techiesconnect.org: replace the record 'shespeaks' (CNAME $VERCEL_CNAME) by an A record → $VPS_IP, proxy OFF (DNS only)."
  wait_for 1800 "$DOMAIN resolves to the VPS (1.1.1.1 and 8.8.8.8)" dns_on_vps || { echo "rollback: put the CNAME back, set the Production Branch back to main. Supabase was never written to."; exit 1; }
fi
step "app starts";      R start-app
if [ "$REH" = 0 ]; then
  wait_for 600 "valid certificate and healthy app on the VPS" cert_ok || { echo "the app runs but has no certificate yet: see 'docker logs proxy-traefik-1' on the VPS; the DNS rollback still restores Vercel"; exit 1; }
fi
for p in / /interet /admin/login /api/health; do
  code=$(vps "$p"); echo "$code $p"
  case "$code" in 200|307) ;; *) echo "smoke failed on $p"; exit 1 ;; esac
done
step "done in $(( $(date +%s) - t0 ))s"
if [ "$REH" = 0 ]; then
  echo "Production now runs on the VPS. Rollback from here loses what was written on the VPS since: CNAME back to $VERCEL_CNAME,"
  echo "Production Branch back to main, and stop the VPS app and cron (cd ~/shespeaks && dcprod stop app cron)."
fi
exit 0
