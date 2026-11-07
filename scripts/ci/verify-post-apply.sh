#!/usr/bin/env bash
# Post-apply: watch VM boot (OCI console), tunnel, then HTTPS — one linear loop, visible logs, fail only on real errors.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORK="${WORK:-terraform}"
if [ "$WORK" = . ] || [ "$WORK" = ./ ]; then
  : # caller already in terraform dir (e.g. GHA defaults.working-directory)
elif [[ "$WORK" != /* ]]; then
  WORK="$REPO_ROOT/$WORK"
fi
OCI_CFG="${OCI_CFG:-$HOME/.oci/config}"
POLL_SEC="${VERIFY_POLL_SEC:-30}"
# Optional hard stop (seconds). Unset = wait until success or explicit failure (GHA job timeout still applies).
MAX_ELAPSED="${VERIFY_MAX_ELAPSED_SEC:-}"

log() { printf '[boot-watch] %s\n' "$*"; }
err() { printf '::error::%s\n' "$*" >&2; }
die() {
  err "$1"
  [ -n "${2:-}" ] && printf '%s\n' "$2" >&2
  exit 1
}

hint_serial() {
  cat <<'EOF'
On the VM (serial console), run:
  sudo tail -200 /var/log/rekov-boot.log
  sudo ls -la /var/log/rekov/phases/
  cat /var/log/rekov/FAILED 2>/dev/null || true
  sudo cloud-init status --long
  sudo tail -150 /var/log/cloud-init-output.log
  systemctl status cloudflared --no-pager
  sudo docker compose -f /opt/rekov/erpnext/docker-compose.yml --env-file /opt/rekov/erpnext/.env ps
  sudo docker compose -f /opt/rekov/erpnext/docker-compose.yml --env-file /opt/rekov/erpnext/.env logs create-site --tail=80
  sudo docker compose -f /opt/rekov/erpnext/docker-compose.yml --env-file /opt/rekov/erpnext/.env logs frontend --tail=80
  curl -sSI -H "Host: YOUR_SITE" http://127.0.0.1:8080/ | head -15
EOF
}

cd "$WORK"

if [ "$(terraform output -raw use_cloudflare_tunnel 2>/dev/null || echo false)" != "true" ]; then
  log "Public origin mode — boot watch (OCI serial + HTTP)"
  exec bash "$(dirname "$0")/watch-public-boot.sh"
fi

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN required}"
: "${TF_VAR_cloudflare_account_id:?TF_VAR_cloudflare_account_id required}"
log "Tunnel mode — continuing with tunnel watch"

log "Terraform outputs"
INSTANCE_ID="$(terraform output -raw instance_id)"
TUNNEL_ID="$(terraform output -raw cloudflare_tunnel_id)"
HOSTNAME="$(terraform output -raw app_hostname)"
log "instance_id=$INSTANCE_ID tunnel_id=$TUNNEL_ID hostname=$HOSTNAME"

if [ ! -f "$OCI_CFG" ]; then
  die "Missing OCI config at $OCI_CFG" ""
fi

# shellcheck source=lib-oci-console.sh
source "$SCRIPT_DIR/lib-oci-console.sh"

CONSOLE_BUF="$(mktemp)"
CONSOLE_LINES=0
trap 'rm -f "$CONSOLE_BUF"' EXIT

START=$SECONDS
oci_state=""
connectors=0
url="https://${HOSTNAME}/"
last_http=""

log "Linear watch: OCI lifecycle + serial console + Cloudflare connectors + HTTPS (poll ${POLL_SEC}s; waiting is not failure)"

while true; do
  elapsed=$((SECONDS - START))
  log "──── elapsed=${elapsed}s ────"

  if [ -n "$MAX_ELAPSED" ] && [ "$elapsed" -ge "$MAX_ELAPSED" ]; then
    die "VERIFY_MAX_ELAPSED_SEC=${MAX_ELAPSED} reached (last http=${last_http:-none}, connectors=$connectors, oci=$oci_state)" "$(hint_serial)"
  fi

  oci_state="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output 2>/dev/null || echo UNKNOWN)"
  log "oci lifecycle-state=$oci_state"
  case "$oci_state" in
    TERMINATED|TERMINATING)
      die "OCI instance is $oci_state" "$(hint_serial)"
      ;;
  esac

  if [ "$oci_state" = RUNNING ]; then
    if oci_console_fetch; then
      if scan_console_for_failure >/tmp/rekov_fail.txt; then
        log "VM reported boot phase failure:"
        cat /tmp/rekov_fail.txt
        die "First-boot phase failed on the VM (see serial lines above and /var/log/rekov-boot.log)" "$(hint_serial)"
      fi
      phases="$(list_boot_phases_from_console || true)"
      [ -n "$phases" ] && log "boot phases seen (serial): $phases"
      emit_console_delta
    else
      log "serial console capture not ready yet (instance still booting?)"
    fi
  fi

  resp="$(curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/accounts/${TF_VAR_cloudflare_account_id}/cfd_tunnel/${TUNNEL_ID}/connections" 2>/dev/null)" || {
    log "Cloudflare tunnel API call failed (transient?)"
    resp=""
  }
  if [ -n "$resp" ]; then
    connectors="$(printf '%s' "$resp" | jq -r '.result | length' 2>/dev/null || echo 0)"
    log "cloudflare active_connections=$connectors"
    if [ "${connectors:-0}" -ge 1 ]; then
      last_http="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 25 -L "$url" || echo curl_fail)"
      log "GET $url -> $last_http"
      case "$last_http" in
        200|301|302|303|307|308)
          log "OK: public HTTPS ready (HTTP $last_http) after ${elapsed}s"
          exit 0
          ;;
        502|503)
          log "tunnel up; origin still starting (ERPNext create-site / frontend) — still watching"
          ;;
        530|521|522|523|1033)
          log "edge/tunnel HTTP $last_http — still watching VM boot logs"
          ;;
        curl_fail)
          log "curl to public URL failed (transient)"
          ;;
        *)
          log "HTTP $last_http — still watching"
          ;;
      esac
    else
      log "no tunnel connector yet — still watching serial console / cloud-init on VM"
    fi
  fi

  sleep "$POLL_SEC"
done
