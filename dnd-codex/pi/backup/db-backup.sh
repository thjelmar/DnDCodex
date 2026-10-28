#!/usr/bin/env bash
# Nightly dump of the D&D Codex Supabase database (the public schema) to the Pi.
#
# Run by codex-db-backup.timer. Each run:
#   1. dumps the database to a temporary file with pg_dump (custom format, already compressed),
#   2. checks that the file isn't empty and that pg_restore can read it,
#   3. moves it into place as codex-<date>_<time>.dump,
#   4. deletes all but the newest BACKUP_KEEP dumps.
# A failed run leaves every existing dump alone and posts to the Discord webhook.
#
# Settings come from the environment (see pi/.env.example): the BACKUP_DB_* connection
# values, BACKUP_KEEP, BACKUP_DIR, and ALERT_WEBHOOK_URL. The password goes in
# PGPASSWORD so it never appears in the process list.

set -euo pipefail

: "${BACKUP_DB_HOST:?Missing BACKUP_DB_HOST. See pi/.env.example.}"
: "${BACKUP_DB_USER:?Missing BACKUP_DB_USER. See pi/.env.example.}"
: "${BACKUP_DB_PASSWORD:?Missing BACKUP_DB_PASSWORD. See pi/.env.example.}"

KEEP="${BACKUP_KEEP:-7}"
BACKUP_DIR="${BACKUP_DIR:-${STATE_DIRECTORY:-$HOME/codex-backups}/db}"

if ! [[ "$KEEP" =~ ^[1-9][0-9]*$ ]]; then
  echo "BACKUP_KEEP must be a whole number of 1 or more, not '$KEEP'." >&2
  exit 1
fi

export PGHOST="$BACKUP_DB_HOST"
export PGPORT="${BACKUP_DB_PORT:-5432}"
export PGDATABASE="${BACKUP_DB_NAME:-postgres}"
export PGUSER="$BACKUP_DB_USER"
export PGPASSWORD="$BACKUP_DB_PASSWORD"
export PGSSLMODE=require

alert() {
  [ -n "${ALERT_WEBHOOK_URL:-}" ] || return 0
  curl -fsS --max-time 10 -X POST -H 'Content-Type: application/json' \
    -d "{\"username\":\"Codex Pi\",\"content\":\"$1\",\"allowed_mentions\":{\"parse\":[]}}" \
    "$ALERT_WEBHOOK_URL" > /dev/null || echo "Could not post the alert to Discord." >&2
}

mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y-%m-%d_%H%M%S)"
partial="$BACKUP_DIR/.codex-$stamp.dump.partial"
final="$BACKUP_DIR/codex-$stamp.dump"
newest_before="$(ls -1 "$BACKUP_DIR"/codex-*.dump 2> /dev/null | sort | tail -n 1 || true)"

trap 'rm -f "$partial"' EXIT
trap 'alert "🔴 Nightly database backup failed on $(hostname). Run: journalctl -u codex-db-backup"' ERR

pg_dump --schema=public --no-owner --no-privileges --format=custom --file="$partial"

[ -s "$partial" ]
pg_restore --list "$partial" > /dev/null
mv "$partial" "$final"

size="$(wc -c < "$final" | tr -d ' ')"
echo "Backed up $size bytes to $(basename "$final")."

# A dump far smaller than the last one usually means data went missing.
if [ -n "$newest_before" ]; then
  previous="$(wc -c < "$newest_before" | tr -d ' ')"
  if [ "$size" -lt $((previous / 2)) ]; then
    alert "🟡 Tonight's database backup on $(hostname) is less than half the size of the previous one ($size bytes, was $previous). Check that nothing was deleted."
  fi
fi

ls -1 "$BACKUP_DIR"/codex-*.dump | sort | awk -v keep="$KEEP" '{ a[NR] = $0 } END { for (i = 1; i <= NR - keep; i++) print a[i] }' |
  while IFS= read -r old; do
    rm -- "$old"
    echo "Removed old backup $(basename "$old")."
  done
