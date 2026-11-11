#!/usr/bin/env bash
set -Eeuo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
required=(
  R2_STORAGE_ACCESS_KEY_ID R2_STORAGE_SECRET_ACCESS_KEY R2_STORAGE_BUCKET
  R2_STORAGE_ENDPOINT R2_STORAGE_REGION R2_STORAGE_STATE_KEY
  SSH_PRIVATE_KEY
  PRESS_CONTROL_HOSTNAME PRESS_ROOT_DOMAIN PRESS_ADMIN_PASSWORD PRESS_DB_ROOT_PASSWORD
  CONTABO_CLIENT_ID CONTABO_CLIENT_SECRET CONTABO_API_USER CONTABO_API_PASSWORD
  CONTABO_PERIOD CONTABO_PRODUCT_ID CONTABO_REGION
  TF_VAR_cloudflare_api_token TF_VAR_cloudflare_zone_id
  TF_VAR_compartment_ocid TF_VAR_fingerprint TF_VAR_oci_region TF_VAR_private_key
  TF_VAR_ssh_public_key TF_VAR_tenancy_ocid TF_VAR_user_ocid
)
for name in "${required[@]}"; do
  [[ -n "${!name:-}" ]] || { echo "Missing $name" >&2; exit 2; }
done

export AWS_ACCESS_KEY_ID="$R2_STORAGE_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_STORAGE_SECRET_ACCESS_KEY"
export AWS_REGION="$R2_STORAGE_REGION"
export TF_VAR_contabo_client_id="$CONTABO_CLIENT_ID"
export TF_VAR_contabo_client_secret="$CONTABO_CLIENT_SECRET"
export TF_VAR_contabo_api_user="$CONTABO_API_USER"
export TF_VAR_contabo_api_password="$CONTABO_API_PASSWORD"
export TF_VAR_contabo_period="$CONTABO_PERIOD"
export TF_VAR_contabo_product_id="$CONTABO_PRODUCT_ID"
export TF_VAR_contabo_region="$CONTABO_REGION"
export TF_VAR_press_control_hostname="$PRESS_CONTROL_HOSTNAME"
export TF_VAR_press_root_domain="$PRESS_ROOT_DOMAIN"

cd "$root/terraform"
terraform init -input=false -reconfigure \
  -backend-config="bucket=$R2_STORAGE_BUCKET" \
  -backend-config="key=$R2_STORAGE_STATE_KEY" \
  -backend-config="region=$R2_STORAGE_REGION" \
  -backend-config="endpoint=$R2_STORAGE_ENDPOINT" \
  -backend-config="skip_credentials_validation=true" \
  -backend-config="skip_metadata_api_check=true" \
  -backend-config="skip_requesting_account_id=true" \
  -backend-config="skip_region_validation=true" \
  -backend-config="skip_s3_checksum=true" \
  -backend-config="use_path_style=true"

reconcile_contabo_state() {
  if ! terraform state list 2>/dev/null | grep -qx 'contabo_instance.erp'; then
    return 0
  fi
  local log
  log="$(mktemp)"
  if terraform apply -refresh-only -auto-approve -input=false >"$log" 2>&1; then
    rm -f "$log"
    return 0
  fi
  if grep -qiE 'not found|404|does not exist|no instance|instance not found' "$log"; then
    echo "Contabo instance ID in state is gone (deleted or unpaid). Dropping stale state; next apply creates a new VPS." >&2
    terraform state rm contabo_instance.erp 2>/dev/null || true
    rm -f "$log"
    return 0
  fi
  cat "$log" >&2
  rm -f "$log"
  return 1
}

reconcile_contabo_state

contabo_usable_in_state() {
  local ip status
  ip="$(terraform output -raw erp_public_ip 2>/dev/null || true)"
  status="$(terraform output -raw erp_contabo_status 2>/dev/null || true)"
  [[ "${ip:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
  [[ "$status" == "running" || "$status" == "installed" ]] || return 1
  return 0
}

wait_contabo_ipv4_in_state() {
  local status
  for _ in $(seq 1 90); do
    terraform apply -refresh-only -auto-approve -input=false >/dev/null
    if contabo_usable_in_state; then
      return 0
    fi
    status="$(terraform output -raw erp_contabo_status 2>/dev/null || true)"
    case "${status:-}" in
      error | uninstalled)
        echo "Contabo ERP status is ${status}; cannot continue." >&2
        return 1
        ;;
      pending_payment | provisioning | installing)
        echo "Contabo ERP still ${status}; waiting for running + IPv4..."
        ;;
    esac
    sleep 10
  done
  echo "Contabo ERP is not running with a public IPv4 in Terraform state yet." >&2
  return 1
}

terraform_apply_until_contabo_dns() {
  terraform apply -auto-approve -input=false
  # Do not pipe `terraform state list` into `grep -q` here.  With `pipefail`
  # enabled, grep legitimately exits as soon as it finds a match and Terraform
  # can then receive SIGPIPE, making a present record look absent.
  if terraform state show 'cloudflare_dns_record.tenants[0]' >/dev/null 2>&1; then
    return 0
  fi
  wait_contabo_ipv4_in_state || return 1
  terraform apply -auto-approve -input=false
  terraform state show 'cloudflare_dns_record.tenants[0]' >/dev/null 2>&1 || {
    echo "Wildcard DNS record was not created after Contabo became ready." >&2
    return 1
  }
}

terraform_apply_until_contabo_dns

control_ip="$(terraform output -raw control_public_ip)"
erp_ip="$(terraform output -raw erp_public_ip)"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
printf '%s\n' "$SSH_PRIVATE_KEY" >"$tmp/id_ed25519"
chmod 600 "$tmp/id_ed25519"
ssh_options=(
  -i "$tmp/id_ed25519"
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=10
  -o ServerAliveInterval=20
  -o ServerAliveCountMax=12
  -o TCPKeepAlive=yes
  -o LogLevel=ERROR
)

# OpenSSH runs the remote command through a shell when it contains shell tokens.
# Always pass exactly one remote command string (never unquoted "ssh host cmd1 cmd2").
remote() {
  local ip="$1"
  local cmd="$2"
  ssh "${ssh_options[@]}" "ubuntu@${ip}" "$cmd"
}

remote_quick() {
  local ip="$1"
  local cmd="$2"
  ssh "${ssh_options[@]}" -o ConnectTimeout=3 "ubuntu@${ip}" "$cmd"
}

remote_timeout() {
  local ip="$1"
  local cmd="$2"
  timeout 5 ssh "${ssh_options[@]}" "ubuntu@${ip}" "$cmd"
}

wait_ssh() {
  local ip="$1"
  local i
  for i in $(seq 1 60); do
    if remote "$ip" "true" 2>/dev/null; then
      return 0
    fi
    sleep 10
  done
  echo "SSH did not become available on $ip" >&2
  return 1
}

if ! contabo_usable_in_state; then
  echo "Refusing bootstrap: Contabo is not running with a usable IPv4." >&2
  exit 1
fi

wait_ssh "$control_ip"
wait_ssh "$erp_ip"

# Press creates its managed `frappe` account with UID/GID 1000. Ubuntu cloud
# images already reserve that identity for the default `ubuntu` account, so
# move only that account out of the way before Press runs its Ansible play.
# Keep the SSH user name and sudo policy unchanged.
if [[ "$(remote "$erp_ip" "id -u ubuntu")" == "1000" ]]; then
  # The current SSH shell belongs to ubuntu, so run the migration in an
  # independent root unit that can terminate the SSH session first.
  remote_timeout "$erp_ip" "sudo systemctl disable rekov-free-frappe-uid-onboot.service >/dev/null 2>&1 || true; sudo rm -f /etc/systemd/system/rekov-free-frappe-uid-onboot.service; sudo systemd-run --collect --no-block --on-active=2s --unit=rekov-free-frappe-uid-migrate-\$(date +%s) /bin/bash -c 'if [[ \"\$(id -u ubuntu)\" == \"1000\" ]]; then new_id=1001; while getent passwd \"\$new_id\" >/dev/null || getent group \"\$new_id\" >/dev/null; do new_id=\$((new_id + 1)); done; pkill -u ubuntu || true; groupmod --gid \"\$new_id\" ubuntu; usermod --uid \"\$new_id\" --gid \"\$new_id\" ubuntu; chown -R ubuntu:ubuntu /home/ubuntu; fi'" || true
  for _ in $(seq 1 30); do
    if remote_quick "$erp_ip" "test \"\$(id -u ubuntu)\" != 1000" 2>/dev/null; then
      break
    fi
    sleep 1
  done
fi
remote "$erp_ip" "test \"\$(id -u ubuntu)\" != 1000"
remote "$erp_ip" "sudo systemctl disable --now rekov-free-frappe-uid-onboot.service >/dev/null 2>&1 || true; sudo rm -f /etc/systemd/system/rekov-free-frappe-uid-onboot.service"

# Press's server setup runs apt update on the tenant node. A previous retry
# may have left an unreachable Deadsnakes PPA behind. The VPS network also
# advertises IPv6 without a usable route, so make APT deterministic before
# Press starts another Ansible play.
remote "$erp_ip" "printf '%s\\n' 'Acquire::ForceIPv4 \"true\";' | sudo tee /etc/apt/apt.conf.d/99-rekov-force-ipv4 >/dev/null; sudo sed -i '/ppa\\.launchpadcontent\\.net\\/deadsnakes\\/ppa/d' /etc/apt/sources.list; sudo find /etc/apt/sources.list.d -maxdepth 1 -type f -print0 | xargs -0 -r grep -Il 'ppa.launchpadcontent.net/deadsnakes/ppa' | xargs -r sudo rm -f || true; iface=\$(ip -o route show default | cut -d' ' -f5); if command -v resolvectl >/dev/null 2>&1 && [ -n \"\$iface\" ]; then sudo resolvectl dns \"\$iface\" 1.1.1.1 8.8.8.8 || true; sudo resolvectl flush-caches || true; fi; if ! getent hosts archive.ubuntu.com >/dev/null 2>&1 || ! getent hosts security.ubuntu.com >/dev/null 2>&1; then printf '%s\\n' 'nameserver 1.1.1.1' 'nameserver 8.8.8.8' | sudo tee /etc/resolv.conf >/dev/null; fi; for _ in \$(seq 1 12); do getent hosts archive.ubuntu.com >/dev/null 2>&1 && getent hosts security.ubuntu.com >/dev/null 2>&1 && break; sleep 2; done; getent hosts archive.ubuntu.com >/dev/null && getent hosts security.ubuntu.com >/dev/null; for _ in \$(seq 1 60); do if ! sudo fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock /var/cache/apt/archives/lock >/dev/null 2>&1; then break; fi; sleep 2; done"
# Validate the exact operation used by Press before creating another Ansible
# play. If it fails, expose the real apt repository/network error instead of
# Press's lossy "unknown reason" task message.
remote "$erp_ip" "sudo apt-get -o Acquire::ForceIPv4=true -o Acquire::Retries=5 update"

# Version 16's first release candidate asks the remote builder to create its
# bench with the exact host interpreter /usr/bin/python3.14. The Ubuntu Noble
# image only ships Python 3.12, so without this package the agent accepts the
# request and its worker leaves the Agent Job Pending with FileNotFoundError.
remote "$erp_ip" "if [ ! -x /usr/bin/python3.14 ]; then sudo DEBIAN_FRONTEND=noninteractive add-apt-repository -y ppa:deadsnakes/ppa; sudo apt-get -o Acquire::ForceIPv4=true -o Acquire::Retries=5 update; sudo DEBIAN_FRONTEND=noninteractive apt-get install -y python3.14 python3.14-dev python3.14-venv; fi; test -x /usr/bin/python3.14; sudo -u frappe /usr/bin/python3.14 --version; sudo supervisorctl restart agent:* >/dev/null"

cat >"$tmp/press.env" <<EOF
PRESS_CONTROL_HOSTNAME=${PRESS_CONTROL_HOSTNAME@Q}
PRESS_ADMIN_PASSWORD=${PRESS_ADMIN_PASSWORD@Q}
PRESS_DB_ROOT_PASSWORD=${PRESS_DB_ROOT_PASSWORD@Q}
PRESS_ROOT_DOMAIN=${PRESS_ROOT_DOMAIN@Q}
PRESS_TENANT_NODE_PUBLIC_IP=${erp_ip@Q}
PRESS_SSH_PUBLIC_KEY=${TF_VAR_ssh_public_key@Q}
PRESS_SSH_PRIVATE_KEY=${SSH_PRIVATE_KEY@Q}
EOF
chmod 600 "$tmp/press.env"

remote "$control_ip" "sudo rm -rf /tmp/rekov && sudo mkdir -p /tmp/rekov && sudo chown ubuntu:ubuntu /tmp/rekov"
scp "${ssh_options[@]}" "$root/scripts/bootstrap-press-control.sh" "$root/scripts/bootstrap-press-platform.sh" "$root/scripts/rekov_press_platform.py" "$tmp/press.env" "ubuntu@${control_ip}:/tmp/rekov/"
remote "$control_ip" "sudo test -s /tmp/rekov/press.env && sudo test -s /tmp/rekov/bootstrap-press-control.sh"
remote "$control_ip" "sudo bash -c 'set -a && source /tmp/rekov/press.env && set +a && exec bash /tmp/rekov/bootstrap-press-control.sh'"
remote "$control_ip" "sudo bash -c 'set -a && source /tmp/rekov/press.env && set +a && exec bash /tmp/rekov/bootstrap-press-platform.sh'"
remote "$control_ip" "sudo rm -rf /tmp/rekov"

# Keep agent callbacks on the control-plane origin while preserving the Press
# hostname for TLS. The public hostname is proxied by Cloudflare; callbacks
# from the tenant must reach Press directly so the server IP authorization is
# preserved and a transient proxy/Redis restart cannot strand Agent Jobs.
remote "$erp_ip" "if ! sudo grep -Eq '^[[:space:]]*${control_ip}[[:space:]]+${PRESS_CONTROL_HOSTNAME}([[:space:]]|$)' /etc/hosts; then echo '${control_ip} ${PRESS_CONTROL_HOSTNAME}' | sudo tee -a /etc/hosts >/dev/null; fi; getent hosts '${PRESS_CONTROL_HOSTNAME}'; sudo supervisorctl restart agent:* >/dev/null"

# The bootstrap submits the first remote build asynchronously. Keep this
# diagnostic read-only so a stuck Pending job exposes both sides of the
# handoff in the same CI run: Press's records and the builder host processes.
remote "$erp_ip" "sudo tail -200 /home/frappe/agent/logs/worker.error.log 2>&1 || true; sudo tail -200 /home/frappe/agent/logs/worker.log 2>&1 || true; sudo ps auxww | grep -Ei '[f]rappe|[a]gent|[b]uilder|[s]upervisor|python3\\.14|buildkit' || true; sudo find /home/frappe/agent/.docker-builds -maxdepth 4 -type f -print 2>/dev/null | sort | tail -80 || true"
remote "$control_ip" "sudo -u frappe bash -lc 'cd /home/frappe/press-bench && bench --site \"${PRESS_CONTROL_HOSTNAME}\" execute \"frappe.get_all(\\\"Agent Job\\\", filters={\\\"reference_doctype\\\": \\\"Deploy Candidate Build\\\", \\\"job_type\\\": \\\"Run Remote Builder\\\"}, fields=[\\\"name\\\", \\\"status\\\", \\\"job_id\\\", \\\"server\\\", \\\"request_path\\\", \\\"modified\\\"], order_by=\\\"creation desc\\\", limit_page_length=3)\"' || true"
remote "$erp_ip" "sudo docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Image}}' 2>/dev/null || true; sudo systemctl --no-pager --type=service --all | grep -Ei 'agent|builder|supervisor|docker' || true; sudo supervisorctl status 2>&1 || true; sudo supervisorctl tail -100 agent:worker-0 stderr 2>&1 || true; sudo supervisorctl tail -100 agent:worker-0 stdout 2>&1 || true; sudo redis-cli -p 25025 LLEN rq:queue:default 2>/dev/null || true; sudo redis-cli -p 25025 LLEN rq:queue:high 2>/dev/null || true; sudo ps auxww | grep -Ei '[f]rappe|[a]gent|[b]uilder|[s]upervisor' || true; sudo find /etc/supervisor /etc/supervisord.conf /home/frappe/agent -maxdepth 3 -type f -print 2>/dev/null | sort | head -100 || true"

# Contabo is deliberately not an ERPNext deployment target anymore.  It is a
# clean, SSH-reachable candidate for Press's "Self Hosted Server" workflow.
# Press verifies it, installs/configures its Agent, and subsequently creates
# every bench, database and tenant through Press jobs.  Keeping a Docker
# Compose bootstrap here would create a second, unmanaged control plane.
remote "$erp_ip" "sudo test -n \"\$(id -un ubuntu)\" && sudo -u ubuntu sudo -n true"

echo "Press: https://${PRESS_CONTROL_HOSTNAME}"
echo "Tenant node candidate: ${erp_ip}"
echo "Tenant DNS zone: *.${PRESS_ROOT_DOMAIN}"
