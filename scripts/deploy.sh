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
terraform apply -auto-approve -input=false
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

wait_ssh() {
  local ip="$1"
  local i
  for i in $(seq 1 60); do
    if ssh "${ssh_options[@]}" "ubuntu@${ip}" true 2>/dev/null; then
      return 0
    fi
    sleep 10
  done
  echo "SSH did not become available on $ip" >&2
  return 1
}

wait_ssh "$control_ip"
wait_ssh "$erp_ip"

cat >"$tmp/press.env" <<EOF
PRESS_CONTROL_HOSTNAME=$PRESS_CONTROL_HOSTNAME
PRESS_ADMIN_PASSWORD=$PRESS_ADMIN_PASSWORD
PRESS_DB_ROOT_PASSWORD=$PRESS_DB_ROOT_PASSWORD
EOF
chmod 600 "$tmp/press.env"
ssh "${ssh_options[@]}" "ubuntu@${control_ip}" 'sudo rm -rf /tmp/rekov && sudo mkdir -p /tmp/rekov && sudo chown ubuntu:ubuntu /tmp/rekov'
scp "${ssh_options[@]}" "$root/scripts/bootstrap-press-control.sh" "$tmp/press.env" "ubuntu@${control_ip}:/tmp/rekov/"
ssh "${ssh_options[@]}" "ubuntu@${control_ip}" 'sudo bash -c "set -a; source /tmp/rekov/press.env; set +a; bash /tmp/rekov/bootstrap-press-control.sh" && sudo rm -rf /tmp/rekov'

mkdir -p "$tmp/erpnext"
cp "$root/erpnext/docker-compose.yml" "$tmp/erpnext/"
cat >"$tmp/erpnext/.env" <<EOF
FRAPPE_SITE_NAME=$erp_host
ADMIN_PASSWORD=$PRESS_ADMIN_PASSWORD
MYSQL_ROOT_PASSWORD=$PRESS_DB_ROOT_PASSWORD
ERPNEXT_IMAGE=frappe/erpnext:v16.54.0
EOF
ssh "${ssh_options[@]}" "ubuntu@${erp_ip}" 'sudo rm -rf /tmp/rekov && sudo mkdir -p /tmp/rekov && sudo chown ubuntu:ubuntu /tmp/rekov'
scp "${ssh_options[@]}" -r "$tmp/erpnext" "$root/scripts/bootstrap-erp.sh" "ubuntu@${erp_ip}:/tmp/rekov/"
ssh "${ssh_options[@]}" "ubuntu@${erp_ip}" "sudo bash /tmp/rekov/bootstrap-erp.sh '$erp_host' && sudo rm -rf /tmp/rekov"

echo "Press: https://${PRESS_CONTROL_HOSTNAME}"
echo "ERP: https://${erp_host}"
