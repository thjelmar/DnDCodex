#!/usr/bin/env bash
# Tests db-backup.sh with fake pg_dump, pg_restore, and curl commands, so it needs no
# database or network. Run it from anywhere:  bash pi/backup/test-db-backup.sh

set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir "$work/bin"

# Fake pg_dump: writes $FAKE_DUMP_BYTES bytes to the --file path, or fails when FAKE_DUMP_FAIL is set.
cat > "$work/bin/pg_dump" << 'EOF'
#!/usr/bin/env bash
[ -z "${FAKE_DUMP_FAIL:-}" ] || exit 1
for arg in "$@"; do case "$arg" in --file=*) out="${arg#--file=}" ;; esac; done
head -c "${FAKE_DUMP_BYTES:-1000}" /dev/zero | tr '\0' 'x' > "$out"
EOF
echo '#!/usr/bin/env bash' > "$work/bin/pg_restore"
# Fake curl: records the message instead of sending it.
cat > "$work/bin/curl" << EOF
#!/usr/bin/env bash
echo "\$@" >> "$work/alerts.log"
EOF
chmod +x "$work/bin/"*

export PATH="$work/bin:$PATH"
export BACKUP_DB_HOST=db.example BACKUP_DB_USER=u BACKUP_DB_PASSWORD=p
export BACKUP_DIR="$work/db" BACKUP_KEEP=3 ALERT_WEBHOOK_URL=https://example.invalid/hook

failures=0
check() { # check <description> <command...>
  local what="$1"; shift
  if "$@"; then echo "ok   - $what"; else echo "FAIL - $what"; failures=$((failures + 1)); fi
}
dumps() { ls -1 "$BACKUP_DIR"/codex-*.dump 2> /dev/null | wc -l | tr -d ' '; }

# Five runs with KEEP=3 leave 3 dumps. Names have second resolution, so wait between runs.
for _ in 1 2 3 4 5; do bash "$here/db-backup.sh" > /dev/null; sleep 1; done
check "rotation keeps the newest 3 of 5 dumps" test "$(dumps)" = 3
check "no alert after healthy runs" test ! -e "$work/alerts.log"
check "no partial files are left behind" test -z "$(ls -A "$BACKUP_DIR" | grep partial || true)"

# A failing pg_dump keeps the existing dumps, removes the partial file, and alerts.
before="$(ls -1 "$BACKUP_DIR" | sort | tr '\n' ' ')"
FAKE_DUMP_FAIL=1 bash "$here/db-backup.sh" > /dev/null 2>&1 && ran_ok=1 || ran_ok=0
check "a failed dump exits non-zero" test "$ran_ok" = 0
check "a failed dump leaves existing dumps untouched" test "$(ls -1 "$BACKUP_DIR" | sort | tr '\n' ' ')" = "$before"
check "a failed dump posts an alert" grep -q "failed" "$work/alerts.log"

# A dump under half the previous size still succeeds but warns.
: > "$work/alerts.log"
sleep 1
FAKE_DUMP_BYTES=100 bash "$here/db-backup.sh" > /dev/null
check "a much smaller dump posts a warning" grep -q "less than half" "$work/alerts.log"

# An empty dump counts as a failure.
: > "$work/alerts.log"
sleep 1
FAKE_DUMP_BYTES=0 bash "$here/db-backup.sh" > /dev/null 2>&1 && ran_ok=1 || ran_ok=0
check "an empty dump is rejected" test "$ran_ok" = 0

# BACKUP_KEEP must be a positive whole number.
BACKUP_KEEP=0 bash "$here/db-backup.sh" > /dev/null 2>&1 && ran_ok=1 || ran_ok=0
check "BACKUP_KEEP=0 is rejected" test "$ran_ok" = 0

[ "$failures" = 0 ] && echo "All checks passed." || { echo "$failures check(s) failed."; exit 1; }
