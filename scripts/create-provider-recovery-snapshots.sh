#!/usr/bin/env bash
set -Eeuo pipefail

# Creates provider-level recovery points without adding them to normal
# Terraform state. This script never deletes snapshots.
: "${OCI_INSTANCE_ID:?Set OCI_INSTANCE_ID}"
: "${TF_VAR_tenancy_ocid:?Set TF_VAR_tenancy_ocid}"
: "${TF_VAR_compartment_ocid:?Set TF_VAR_compartment_ocid}"
: "${TF_VAR_user_ocid:?Set TF_VAR_user_ocid}"
: "${TF_VAR_fingerprint:?Set TF_VAR_fingerprint}"
: "${TF_VAR_oci_region:?Set TF_VAR_oci_region}"
: "${TF_VAR_private_key:?Set TF_VAR_private_key}"
: "${CONTABO_INSTANCE_ID:?Set CONTABO_INSTANCE_ID}"
: "${CONTABO_CLIENT_ID:?Set CONTABO_CLIENT_ID}"
: "${CONTABO_CLIENT_SECRET:?Set CONTABO_CLIENT_SECRET}"
: "${CONTABO_API_USER:?Set CONTABO_API_USER}"
: "${CONTABO_API_PASSWORD:?Set CONTABO_API_PASSWORD}"

command -v oci >/dev/null || { echo 'OCI CLI is required.' >&2; exit 1; }
command -v jq >/dev/null || { echo 'jq is required.' >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
oci_config="$tmp/config"
oci_key="$tmp/oci_key.pem"
printf '%s\n' "$TF_VAR_private_key" >"$oci_key"
chmod 600 "$oci_key"
{
  printf '[DEFAULT]\n'
  printf 'tenancy=%s\n' "$TF_VAR_tenancy_ocid"
  printf 'user=%s\n' "$TF_VAR_user_ocid"
  printf 'fingerprint=%s\n' "$TF_VAR_fingerprint"
  printf 'key_file=%s\n' "$oci_key"
  printf 'region=%s\n' "$TF_VAR_oci_region"
} >"$oci_config"
chmod 600 "$oci_config"

ad="$(oci iam availability-domain list \
  --config-file "$oci_config" \
  --compartment-id "$TF_VAR_tenancy_ocid" \
  --query 'data[0].name' --raw-output)"
boot_volume_id="$(oci compute boot-volume-attachment list \
  --config-file "$oci_config" \
  --availability-domain "$ad" \
  --compartment-id "$TF_VAR_compartment_ocid" \
  --instance-id "$OCI_INSTANCE_ID" \
  --query 'data[0]."boot-volume-id"' --raw-output)"
[[ "$boot_volume_id" != "null" && -n "$boot_volume_id" ]] || {
  echo 'Could not resolve the OCI control boot volume.' >&2
  exit 1
}

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
oci_backup_id="$(oci bv boot-volume-backup create \
  --config-file "$oci_config" \
  --boot-volume-id "$boot_volume_id" \
  --display-name "rekov-control-$stamp" \
  --wait-for-state AVAILABLE \
  --max-wait-seconds 1800 \
  --query 'data.id' --raw-output)"
[[ -n "$oci_backup_id" && "$oci_backup_id" != "null" ]] || {
  echo 'OCI boot-volume backup did not return an ID.' >&2
  exit 1
}

contabo_token="$(curl -fsS https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token \
  -d "client_id=$CONTABO_CLIENT_ID" \
  -d "client_secret=$CONTABO_CLIENT_SECRET" \
  --data-urlencode "username=$CONTABO_API_USER" \
  --data-urlencode "password=$CONTABO_API_PASSWORD" \
  -d 'grant_type=password' | jq -er '.access_token')"
request_id="$(cat /proc/sys/kernel/random/uuid)"
contabo_snapshot_id="$(curl -fsS -X POST \
  "https://api.contabo.com/v1/compute/instances/$CONTABO_INSTANCE_ID/snapshots" \
  -H "Authorization: Bearer $contabo_token" \
  -H "Content-Type: application/json" \
  -H "x-request-id: $request_id" \
  -d "{\"name\":\"rekov-tenant-$stamp\",\"description\":\"Rekov recovery point $stamp\"}" \
  | jq -er '.data[0].snapshotId')"
[[ -n "$contabo_snapshot_id" && "$contabo_snapshot_id" != "null" ]] || {
  echo 'Contabo snapshot did not return an ID.' >&2
  exit 1
}

if [[ -n "${GITHUB_ENV:-}" ]]; then
  printf 'OCI_BOOT_VOLUME_BACKUP_ID=%s\nCONTABO_SNAPSHOT_ID=%s\n' \
    "$oci_backup_id" "$contabo_snapshot_id" >>"$GITHUB_ENV"
fi
printf 'OCI boot-volume backup: %s\n' "$oci_backup_id"
printf 'Contabo instance snapshot: %s\n' "$contabo_snapshot_id"
