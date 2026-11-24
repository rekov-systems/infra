#!/usr/bin/env bash
set -Eeuo pipefail
: "${BACKUP_HOST:?Set BACKUP_HOST}"
: "${BACKUP_USER:?Set BACKUP_USER}"
: "${BACKUP_LABEL:?Set BACKUP_LABEL}"
: "${RECOVERY_PASSPHRASE:?Set RECOVERY_PASSPHRASE}"
: "${RECOVERY_DIR:?Set RECOVERY_DIR}"
key="$RUNNER_TEMP/${BACKUP_LABEL}-key"
install -m 0600 /dev/null "$key"
printf '%s\n' "$BACKUP_SSH_KEY" | perl -pe 's/\\\\n/\n/g; s/\r//g' >"$key"
trap 'rm -f "$key"' EXIT
opts=(-i "$key" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
mkdir -p "$RECOVERY_DIR"
ssh "${opts[@]}" "$BACKUP_USER@$BACKUP_HOST" \
  'set -e; hostname; cat /etc/os-release; free -h; df -h /; systemctl list-unit-files --state=enabled --no-pager 2>/dev/null || true; docker ps -a --no-trunc 2>/dev/null || true' \
  >"$RECOVERY_DIR/$BACKUP_LABEL-inventory.txt"
ssh "${opts[@]}" "$BACKUP_USER@$BACKUP_HOST" \
  'sudo tar --ignore-failed-read --numeric-owner -C / -czf - home/frappe home/ubuntu/pilot /opt /etc/nginx /etc/caddy /etc/systemd/system /var/lib/docker/volumes /var/lib/mysql /var/lib/redis 2>/dev/null' \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:RECOVERY_PASSPHRASE \
      >"$RECOVERY_DIR/$BACKUP_LABEL-state.tar.gz.enc"
if ssh "${opts[@]}" "$BACKUP_USER@$BACKUP_HOST" \
  '(command -v mariadb-dump >/dev/null || command -v mysqldump >/dev/null) && { systemctl is-active --quiet mariadb || systemctl is-active --quiet mysql || systemctl is-active --quiet mysqld; }'; then
  ssh "${opts[@]}" "$BACKUP_USER@$BACKUP_HOST" \
    'if command -v mariadb-dump >/dev/null; then sudo mariadb-dump --all-databases --single-transaction --routines --events --triggers --hex-blob; else sudo mysqldump --all-databases --single-transaction --routines --events --triggers --hex-blob; fi' \
    | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:RECOVERY_PASSPHRASE \
        >"$RECOVERY_DIR/$BACKUP_LABEL-mariadb.sql.enc"
fi
test -s "$RECOVERY_DIR/$BACKUP_LABEL-state.tar.gz.enc"
openssl enc -d -aes-256-cbc -pbkdf2 -salt -pass env:RECOVERY_PASSPHRASE \
  -in "$RECOVERY_DIR/$BACKUP_LABEL-state.tar.gz.enc" | tar -tzf - >/dev/null
if [[ -f "$RECOVERY_DIR/$BACKUP_LABEL-mariadb.sql.enc" ]]; then
  dump_check="$(mktemp)"
  openssl enc -d -aes-256-cbc -pbkdf2 -salt -pass env:RECOVERY_PASSPHRASE \
    -in "$RECOVERY_DIR/$BACKUP_LABEL-mariadb.sql.enc" >"$dump_check"
  grep -q 'MariaDB dump\|MySQL dump' "$dump_check"
  rm -f "$dump_check"
fi
sha256sum "$RECOVERY_DIR/$BACKUP_LABEL-"* >"$RECOVERY_DIR/$BACKUP_LABEL-SHA256SUMS"
