#!/usr/bin/env bash
# Public origin: OCI serial + optional SSH + origin/Cloudflare HTTP until ready.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=lib-oci-console.sh
source "$SCRIPT_DIR/lib-oci-console.sh"

WORK="${WORK:-terraform}"
if [ "$WORK" = . ] || [ "$WORK" = ./ ]; then
  :
elif [[ "$WORK" != /* ]]; then
  WORK="$REPO_ROOT/$WORK"
fi
POLL_SEC="${VERIFY_POLL_SEC:-30}"
MAX_ELAPSED="${VERIFY_MAX_ELAPSED_SEC:-}"
OCI_CFG="${OCI_CFG:-$HOME/.oci/config}"

log() { printf '[boot-watch] %s\n' "$*"; }
die() { printf '::error::%s\n' "$1" >&2; exit 1; }

cd "$WORK"
HOSTNAME="$(terraform output -raw app_hostname)"
PUBLIC_IP="$(terraform output -raw instance_public_ip)"
INSTANCE_ID="$(terraform output -raw instance_id)"
SSH_USER="${SSH_USER:-$(terraform output -raw instance_login_user 2>/dev/null || echo ubuntu)}"

if [ -z "${PUBLIC_IP:-}" ] || [ "$PUBLIC_IP" = "null" ]; then
  die "instance_public_ip is empty — assign_public_ip must be true"
fi

CONSOLE_BUF="$(mktemp)"
CONSOLE_LINES=0
cleanup() { rm -f "$CONSOLE_BUF" "$KEY_FILE"; }
KEY_FILE=""
trap cleanup EXIT

SSH_OPTS=()
ssh_ok=false
if [ -n "${SSH_PRIVATE_KEY:-}" ]; then
  KEY_FILE="$(mktemp)"
  umask 077
  printf '%s\n' "$SSH_PRIVATE_KEY" >"$KEY_FILE"
  SSH_OPTS=(
    -i "$KEY_FILE"
    -o BatchMode=yes
    -o ConnectTimeout=20
    -o StrictHostKeyChecking=accept-new
    -o UserKnownHostsFile=/dev/null
    -o LogLevel=ERROR
  )
else
  log "SSH_PRIVATE_KEY unset — logs via OCI serial only (open ssh_ingress_cidrs for SSH)"
fi

remote_logs() {
  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${PUBLIC_IP}" 'sudo bash -s' <<'REMOTE'
set -euo pipefail
echo "=== rekov-boot.log (tail 40) ==="
sudo tail -40 /var/log/rekov-boot.log 2>/dev/null || echo "(no boot log yet)"
echo "=== phases ==="
sudo ls -la /var/log/rekov/phases/ 2>/dev/null || true
if [ -f /var/log/rekov/FAILED ]; then cat /var/log/rekov/FAILED; fi
echo "=== docker ps ==="
sudo docker compose -f /opt/rekov/erpnext/docker-compose.yml --env-file /opt/rekov/erpnext/.env ps 2>/dev/null || true
echo "=== create-site (tail 25) ==="
sudo docker compose -f /opt/rekov/erpnext/docker-compose.yml --env-file /opt/rekov/erpnext/.env logs create-site --tail=25 2>/dev/null || true
REMOTE
}

START=$SECONDS
url="https://${HOSTNAME}/"
use_console=false
if [ -f "$OCI_CFG" ] && command -v oci >/dev/null 2>&1; then
  use_console=true
elif [ -z "${SSH_PRIVATE_KEY:-}" ]; then
  die "Need OCI CLI (~/.oci/config) or SSH_PRIVATE_KEY + ssh_ingress_cidrs for boot watch"
fi

log "Public origin watch host=$HOSTNAME ip=$PUBLIC_IP instance=$INSTANCE_ID"

while true; do
  elapsed=$((SECONDS - START))
  log "──── elapsed=${elapsed}s ────"
  if [ -n "$MAX_ELAPSED" ] && [ "$elapsed" -ge "$MAX_ELAPSED" ]; then
    die "VERIFY_MAX_ELAPSED_SEC=${MAX_ELAPSED} reached"
  fi

  oci_state="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output 2>/dev/null || echo UNKNOWN)"
  log "oci lifecycle-state=$oci_state"
  case "$oci_state" in
    TERMINATED|TERMINATING) die "OCI instance is $oci_state" ;;
  esac

  if [ "$use_console" = true ] && [ "$oci_state" = RUNNING ]; then
    if oci_console_fetch; then
      if scan_console_for_failure >/tmp/rekov_fail.txt; then
        log "VM boot phase failure (serial):"
        cat /tmp/rekov_fail.txt
        die "First-boot phase failed on VM"
      fi
      phases="$(list_boot_phases_from_console || true)"
      [ -n "$phases" ] && log "boot phases (serial): $phases"
      emit_console_delta
    else
      log "serial console capture pending"
    fi
  fi

  if [ -n "${SSH_PRIVATE_KEY:-}" ] && [ "$ssh_ok" = false ]; then
    if ssh "${SSH_OPTS[@]}" "${SSH_USER}@${PUBLIC_IP}" 'echo REKOV_SSH_OK' 2>/dev/null | grep -q REKOV_SSH_OK; then
      ssh_ok=true
      log "SSH connected"
    else
      log "SSH closed or not ready (add your IP or CI range to TF_VAR_ssh_ingress_cidrs) — using serial console"
    fi
  fi

  if [ "$ssh_ok" = true ]; then
    remote_logs || log "remote log fetch failed (transient)"
    if ssh "${SSH_OPTS[@]}" "${SSH_USER}@${PUBLIC_IP}" 'test -f /var/log/rekov/FAILED' 2>/dev/null; then
      die "VM boot FAILED mark set"
    fi
  fi

  origin_http="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -H "Host: ${HOSTNAME}" "http://${PUBLIC_IP}/" || echo curl_fail)"
  log "origin direct http://${PUBLIC_IP}/ Host:${HOSTNAME} -> $origin_http"

  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 25 -L "$url" || echo curl_fail)"
  log "cloudflare GET $url -> $code"
  case "$code" in
    200|301|302|303|307|308)
      log "OK: public HTTPS ready (HTTP $code) after ${elapsed}s"
      exit 0
      ;;
    523|521|522)
      log "Cloudflare $code — origin still booting or SSL mode (use Full + nginx on 443); waiting"
      ;;
    502|503)
      log "edge $code — nginx up, ERPNext/create-site still starting; waiting"
      ;;
    *) ;;
  esac

  sleep "$POLL_SEC"
done
