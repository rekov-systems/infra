#!/usr/bin/env bash
set -Eeuo pipefail

# Collects encrypted, point-in-time recovery material. Provider snapshots are
# deliberately not created here: those APIs require provider credentials and
# must be recorded separately from Terraform's normal lifecycle.
: "${CONTROL_IP:?Set CONTROL_IP to the OCI control VM IPv4 address}"
: "${TENANT_IP:?Set TENANT_IP to the Contabo tenant VM IPv4 address}"
: "${SSH_PRIVATE_KEY:?Set SSH_PRIVATE_KEY}"
: "${RECOVERY_PASSPHRASE:?Set RECOVERY_PASSPHRASE in a secret environment variable}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="${RECOVERY_OUTPUT_DIR:-$root/recovery/$stamp}"
mkdir -p "$out"
chmod 700 "$out"
key="$out/id_ed25519"
printf '%s\n' "$SSH_PRIVATE_KEY" >"$key"
chmod 600 "$key"
trap 'rm -f "$key"' EXIT

ssh_opts=(-i "$key" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o ServerAliveInterval=20)
remote() {
  local host="$1" command="$2"
  ssh "${ssh_opts[@]}" "ubuntu@${host}" "$command"
}

collect_host() {
  local label="$1" host="$2"
  remote "$host" 'set -o pipefail; printf "hostname="; hostname; printf "\nos-release=\n"; cat /etc/os-release; printf "\npackages=\n"; dpkg-query -W -f="${binary:Package}=${Version}\n"; printf "\npython=\n"; command -v python3 && python3 --version; printf "\npip=\n"; python3 -m pip freeze 2>/dev/null || true; printf "\nsystemd=\n"; systemctl list-unit-files --state=enabled --no-pager 2>/dev/null || true; printf "\npress-git=\n"; git -C /home/frappe/press-bench/apps/frappe rev-parse HEAD 2>/dev/null || true; git -C /home/frappe/press-bench/apps/press rev-parse HEAD 2>/dev/null || true' >"$out/${label}-inventory.txt"
  remote "$host" 'sudo mariadb-dump --all-databases --single-transaction --routines --events --triggers --hex-blob' |
    openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:RECOVERY_PASSPHRASE >"$out/${label}-mariadb.sql.enc"
  remote "$host" 'set -o pipefail; sudo tar --exclude="*.log" --exclude="*.cache" -C / -czf - home/frappe/press-bench/sites home/frappe/agent etc/nginx etc/systemd/system/press-bench* etc/systemd/system/agent* 2>/dev/null || true' |
    openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:RECOVERY_PASSPHRASE >"$out/${label}-state.tar.gz.enc"
}

export RECOVERY_PASSPHRASE
collect_host control "$CONTROL_IP"
collect_host tenant "$TENANT_IP"

{
  printf 'created_at=%s\n' "$stamp"
  printf 'git_sha=%s\n' "$(git -C "$root" rev-parse HEAD)"
  printf 'git_ref=%s\n' "$(git -C "$root" symbolic-ref --short HEAD)"
  printf 'control_ip=%s\ntenant_ip=%s\n' "$CONTROL_IP" "$TENANT_IP"
  printf '\nchecksums=\n'
  (cd "$out" && sha256sum -- * | sort)
} >"$out/manifest.txt"
chmod 600 "$out"/*
printf 'Recovery material created at %s\n' "$out"
printf 'Create and record OCI/Contabo provider snapshot IDs before deployment.\n'
