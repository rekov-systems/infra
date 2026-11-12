#!/usr/bin/env bash
set -Eeuo pipefail

# Thin infrastructure wrapper. Press owns server verification, Agent
# installation, database/application setup, builders, proxies, benches and
# tenants through its native self-hosted APIs.
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
required=(
  R2_STORAGE_ACCESS_KEY_ID R2_STORAGE_SECRET_ACCESS_KEY R2_STORAGE_BUCKET
  R2_STORAGE_ENDPOINT R2_STORAGE_REGION R2_STORAGE_STATE_KEY SSH_PRIVATE_KEY
  PRESS_CONTROL_HOSTNAME PRESS_ROOT_DOMAIN PRESS_ADMIN_PASSWORD PRESS_DB_ROOT_PASSWORD
  CONTABO_CLIENT_ID CONTABO_CLIENT_SECRET CONTABO_API_USER CONTABO_API_PASSWORD
  CONTABO_PERIOD CONTABO_PRODUCT_ID CONTABO_REGION TF_VAR_cloudflare_api_token
  TF_VAR_cloudflare_zone_id TF_VAR_compartment_ocid TF_VAR_fingerprint TF_VAR_oci_region
  TF_VAR_private_key TF_VAR_ssh_public_key TF_VAR_tenancy_ocid TF_VAR_user_ocid
)
for name in "${required[@]}"; do
  [[ -n "${!name:-}" ]] || { echo "Missing $name" >&2; exit 2; }
done
[[ "${REKOV_NATIVE_ONLY:-1}" == "1" ]] || { echo 'Legacy deploy mode was removed.' >&2; exit 2; }
[[ "${REKOV_RECOVERY_RUN_ID:-}" =~ ^[0-9]+$ ]] || { echo 'A successful REKOV_RECOVERY_RUN_ID is required.' >&2; exit 2; }

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
command -v aws >/dev/null || { echo 'aws CLI is required.' >&2; exit 2; }
command -v jq >/dev/null || { echo 'jq is required.' >&2; exit 2; }

recovery_point="$(mktemp -d)"
tmp="$(mktemp -d)"
trap 'rm -rf "$recovery_point" "$tmp"' EXIT
AWS_EC2_METADATA_DISABLED=true aws s3 sync \
  "s3://$R2_STORAGE_BUCKET/recovery/$REKOV_RECOVERY_RUN_ID/" "$recovery_point/" \
  --endpoint-url "$R2_STORAGE_ENDPOINT" --only-show-errors
RECOVERY_POINT="$recovery_point" "$root/scripts/verify-recovery-point.sh"

cd "$root/terraform"
terraform init -input=false -reconfigure \
  -backend-config="bucket=$R2_STORAGE_BUCKET" -backend-config="key=$R2_STORAGE_STATE_KEY" \
  -backend-config="region=$R2_STORAGE_REGION" -backend-config="endpoint=$R2_STORAGE_ENDPOINT" \
  -backend-config="skip_credentials_validation=true" -backend-config="skip_metadata_api_check=true" \
  -backend-config="skip_requesting_account_id=true" -backend-config="skip_region_validation=true" \
  -backend-config="skip_s3_checksum=true" -backend-config="use_path_style=true"

refresh_log="$(mktemp)"
if ! terraform apply -refresh-only -auto-approve -input=false >"$refresh_log" 2>&1; then
  cat "$refresh_log" >&2
  rm -f "$refresh_log"
  echo 'Terraform refresh failed; refusing automatic replacement of infrastructure.' >&2
  exit 1
fi
rm -f "$refresh_log"
recovery_oci_instance_id="$(jq -er '.control_instance_id.value // empty' "$recovery_point/terraform-outputs.json")"
recovery_contabo_instance_id="$(jq -er '.erp_contabo_id.value // empty' "$recovery_point/terraform-outputs.json")"
current_oci_instance_id="$(terraform state pull | jq -er '.resources[] | select(.type == "oci_core_instance" and .name == "control") | .instances[0].attributes.id')"
current_contabo_instance_id="$(terraform output -raw erp_contabo_id)"
[[ "$recovery_oci_instance_id" == "$current_oci_instance_id" ]] || { echo 'Recovery OCI target differs from Terraform.' >&2; exit 1; }
[[ "$recovery_contabo_instance_id" == "$current_contabo_instance_id" ]] || { echo 'Recovery Contabo target differs from Terraform.' >&2; exit 1; }

terraform apply -auto-approve -input=false
control_ip="$(terraform output -raw control_public_ip)"
erp_ip="$(terraform output -raw erp_public_ip)"
printf '%s\n' "$SSH_PRIVATE_KEY" >"$tmp/id_ed25519"
chmod 600 "$tmp/id_ed25519"
ssh_options=(-i "$tmp/id_ed25519" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o ServerAliveInterval=20 -o ServerAliveCountMax=12 -o LogLevel=ERROR)
remote() { ssh "${ssh_options[@]}" "ubuntu@$1" "$2"; }
wait_ssh() {
  for _ in $(seq 1 90); do
    remote "$1" true >/dev/null 2>&1 && return 0
    sleep 10
  done
  echo "SSH did not become available on $1" >&2
  return 1
}
wait_ssh "$control_ip"
wait_ssh "$erp_ip"

cat >"$tmp/press.env" <<EOF
PRESS_CONTROL_HOSTNAME=${PRESS_CONTROL_HOSTNAME@Q}
PRESS_ADMIN_PASSWORD=${PRESS_ADMIN_PASSWORD@Q}
PRESS_DB_ROOT_PASSWORD=${PRESS_DB_ROOT_PASSWORD@Q}
PRESS_ROOT_DOMAIN=${PRESS_ROOT_DOMAIN@Q}
PRESS_CLOUDFLARE_API_TOKEN=${TF_VAR_cloudflare_api_token@Q}
PRESS_TENANT_NODE_PUBLIC_IP=${erp_ip@Q}
PRESS_SSH_PUBLIC_KEY=${TF_VAR_ssh_public_key@Q}
PRESS_SSH_PRIVATE_KEY=${SSH_PRIVATE_KEY@Q}
EOF
chmod 600 "$tmp/press.env"
remote "$control_ip" 'sudo rm -rf /tmp/rekov && sudo mkdir -p /tmp/rekov && sudo chown ubuntu:ubuntu /tmp/rekov'
scp "${ssh_options[@]}" "$root/scripts/bootstrap-press-control.sh" "$tmp/press.env" "ubuntu@$control_ip:/tmp/rekov/"
remote "$control_ip" "sudo test -s /tmp/rekov/press.env && sudo test -s /tmp/rekov/bootstrap-press-control.sh"
remote "$control_ip" "sudo bash -c 'set -a && source /tmp/rekov/press.env && set +a && exec bash /tmp/rekov/bootstrap-press-control.sh'"
remote "$control_ip" 'sudo rm -rf /tmp/rekov'

echo "Press control plane installed at https://${PRESS_CONTROL_HOSTNAME}."
echo "Tenant node is available for native Press Self Hosted Server setup: ${erp_ip}."
echo "Next native actions: add Proxy Server, Database Server, Self Hosted Server, Build Server and Release Group in Press."
