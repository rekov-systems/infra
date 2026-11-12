#!/usr/bin/env bash
set -Eeuo pipefail

# Collects encrypted, point-in-time recovery material in R2. Provider
# snapshots are intentionally not used by this deployment.
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
  local label="$1" host="$2" dump_password="${3:-}" dump_command password_b64
  remote "$host" 'set -o pipefail; printf "hostname="; hostname; printf "\nos-release=\n"; cat /etc/os-release; printf "\npackages=\n"; dpkg-query -W -f="\${binary:Package}=\${Version}\n"; printf "\npython=\n"; command -v python3 && python3 --version; printf "\npip=\n"; python3 -m pip freeze 2>/dev/null || true; printf "\nsystemd=\n"; systemctl list-unit-files --state=enabled --no-pager 2>/dev/null || true; printf "\npress-git=\n"; git -C /home/frappe/press-bench/apps/frappe rev-parse HEAD 2>/dev/null || true; git -C /home/frappe/press-bench/apps/press rev-parse HEAD 2>/dev/null || true' >"$out/${label}-inventory.txt"
  if [[ -n "$dump_password" ]]; then
    password_b64="$(printf '%s' "$dump_password" | base64 -w0)"
    dump_command="sudo env MYSQL_PWD=\"\$(printf '%s' '$password_b64' | base64 -d)\" mariadb-dump -u root --all-databases --single-transaction --routines --events --triggers --hex-blob"
  else
    dump_command='sudo mariadb-dump --all-databases --single-transaction --routines --events --triggers --hex-blob'
  fi
  remote "$host" "$dump_command" |
    openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:RECOVERY_PASSPHRASE >"$out/${label}-mariadb.sql.enc"
  remote "$host" 'sudo tar --ignore-failed-read --exclude="*.log" --exclude="*.cache" -C / -czf - home/frappe/press-bench/sites home/frappe/agent etc/nginx etc/systemd/system/press-bench* etc/systemd/system/agent* 2>/dev/null' |
    openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:RECOVERY_PASSPHRASE >"$out/${label}-state.tar.gz.enc"
}

export RECOVERY_PASSPHRASE
collect_host control "$CONTROL_IP" "${PRESS_DB_ROOT_PASSWORD:-}"
collect_host tenant "$TENANT_IP"

if [[ -n "${PRESS_CONTROL_HOSTNAME:-}" ]]; then
  remote "$CONTROL_IP" "sudo -u frappe bash -lc 'cd /home/frappe/press-bench && bench --site \"${PRESS_CONTROL_HOSTNAME}\" execute \"__import__(\\\"json\\\").dumps(frappe.get_all(\\\"Self Hosted Server\\\", fields=[\\\"name\\\",\\\"status\\\",\\\"server\\\",\\\"database_server\\\"], limit_page_length=50))\"'" \
    >"$out/press-status.json" 2>&1 || printf '%s\n' 'Press status unavailable' >"$out/press-status.json"
else
  printf '%s\n' 'Press status not requested' >"$out/press-status.json"
fi

if [[ -n "${RECOVERY_METADATA_FILE:-}" && -r "$RECOVERY_METADATA_FILE" ]]; then
  cp "$RECOVERY_METADATA_FILE" "$out/terraform-outputs.json"
else
  printf '%s\n' 'Terraform outputs not provided' >"$out/terraform-outputs.json"
fi

{
  printf 'created_at=%s\n' "$stamp"
  printf 'git_sha=%s\n' "$(git -C "$root" rev-parse HEAD)"
  printf 'git_ref=%s\n' "$(git -C "$root" symbolic-ref --short HEAD)"
  printf 'control_ip=%s\ntenant_ip=%s\n' "$CONTROL_IP" "$TENANT_IP"
  printf '\nchecksums=\n'
  # Do not checksum the manifest while it is being written, and never retain
  # the temporary SSH key as recovery material. The key is removed by the EXIT
  # trap before the next workflow step uploads this directory.
  mapfile -t checksum_files < <(
    find "$out" -maxdepth 1 -type f \
      ! -name manifest.txt ! -name id_ed25519 -printf '%f\n' | sort
  )
  ((${#checksum_files[@]} > 0)) || {
    echo 'No recovery artifacts were created.' >&2
    exit 1
  }
  (cd "$out" && sha256sum -- "${checksum_files[@]}" | sort)
} >"$out/manifest.txt"
chmod 600 "$out"/*
printf 'Recovery material created at %s\n' "$out"
printf 'R2-only recovery material created; provider snapshots are not used.\n'
