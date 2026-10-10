#!/bin/bash
# Cutover from Vercel + Supabase to the VPS. Run from a workstation: ops/cutover.sh [--rehearsal]
# --rehearsal: same steps into the preprod, without the Vercel step.
set -euo pipefail
if [ "${1:-}" = "--rehearsal" ]; then STACK=shespeaks-preprod; DIR=shespeaks-preprod; DOMAIN=preprod.sheleads.techiesconnect.org; REH=1
else STACK=shespeaks; DIR=shespeaks; DOMAIN=sheleads.techiesconnect.org; REH=0; fi
# shellcheck disable=SC2029  # DIR, STACK and the step are meant to expand here
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
exit 0
