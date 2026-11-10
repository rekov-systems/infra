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
  if terraform state list 2>/dev/null | grep -q 'cloudflare_dns_record.tenants'; then
    return 0
  fi
  wait_contabo_ipv4_in_state || return 1
  terraform apply -auto-approve -input=false
  terraform state list 2>/dev/null | grep -q 'cloudflare_dns_record.tenants' || {
    echo "Wildcard DNS record was not created after Contabo became ready." >&2
    return 1
  }
}

terraform_apply_until_contabo_dns

control_ip="$(terraform output -raw control_public_ip)"
erp_ip="$(terraform output -raw erp_public_ip)"
erp_host="erp.${PRESS_ROOT_DOMAIN}"

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

cat >"$tmp/press.env" <<EOF
PRESS_CONTROL_HOSTNAME=${PRESS_CONTROL_HOSTNAME@Q}
PRESS_ADMIN_PASSWORD=${PRESS_ADMIN_PASSWORD@Q}
PRESS_DB_ROOT_PASSWORD=${PRESS_DB_ROOT_PASSWORD@Q}
EOF
chmod 600 "$tmp/press.env"

remote "$control_ip" "sudo rm -rf /tmp/rekov && sudo mkdir -p /tmp/rekov && sudo chown ubuntu:ubuntu /tmp/rekov"
scp "${ssh_options[@]}" "$root/scripts/bootstrap-press-control.sh" "$tmp/press.env" "ubuntu@${control_ip}:/tmp/rekov/"
remote "$control_ip" "sudo test -s /tmp/rekov/press.env && sudo test -s /tmp/rekov/bootstrap-press-control.sh"
remote "$control_ip" "sudo bash -c 'set -a && source /tmp/rekov/press.env && set +a && exec bash /tmp/rekov/bootstrap-press-control.sh'"
remote "$control_ip" "sudo rm -rf /tmp/rekov"

mkdir -p "$tmp/erpnext"
cp "$root/erpnext/docker-compose.yml" "$tmp/erpnext/"
cat >"$tmp/erpnext/.env" <<EOF
FRAPPE_SITE_NAME=${erp_host@Q}
ADMIN_PASSWORD=${PRESS_ADMIN_PASSWORD@Q}
MYSQL_ROOT_PASSWORD=${PRESS_DB_ROOT_PASSWORD@Q}
ERPNEXT_IMAGE=frappe/erpnext:v16.54.0
EOF

remote "$erp_ip" "sudo rm -rf /tmp/rekov && sudo mkdir -p /tmp/rekov && sudo chown ubuntu:ubuntu /tmp/rekov"
scp "${ssh_options[@]}" -r "$tmp/erpnext" "$root/scripts/bootstrap-erp.sh" "ubuntu@${erp_ip}:/tmp/rekov/"
quoted_erp_host="$(printf '%q' "$erp_host")"
remote "$erp_ip" "sudo test -s /tmp/rekov/bootstrap-erp.sh"
remote "$erp_ip" "sudo bash /tmp/rekov/bootstrap-erp.sh ${quoted_erp_host} && sudo rm -rf /tmp/rekov"

echo "Press: https://${PRESS_CONTROL_HOSTNAME}"
echo "ERP: https://${erp_host}"
