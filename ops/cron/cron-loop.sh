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
