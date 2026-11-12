#!/usr/bin/env bash
set -Eeuo pipefail

# Safe by default: without the exact confirmation this only prints the plan.
# With confirmation it restores the OCI control boot volume in-place and asks
# Contabo to roll the tenant instance back to its selected snapshot.
: "${OCI_INSTANCE_ID:?Set OCI_INSTANCE_ID}"
: "${OCI_BOOT_VOLUME_BACKUP_ID:?Set OCI_BOOT_VOLUME_BACKUP_ID}"
: "${CONTABO_INSTANCE_ID:?Set CONTABO_INSTANCE_ID}"
: "${CONTABO_SNAPSHOT_ID:?Set CONTABO_SNAPSHOT_ID}"
: "${TF_VAR_tenancy_ocid:?Set TF_VAR_tenancy_ocid}"
: "${TF_VAR_compartment_ocid:?Set TF_VAR_compartment_ocid}"
: "${TF_VAR_user_ocid:?Set TF_VAR_user_ocid}"
: "${TF_VAR_fingerprint:?Set TF_VAR_fingerprint}"
: "${TF_VAR_oci_region:?Set TF_VAR_oci_region}"
: "${TF_VAR_private_key:?Set TF_VAR_private_key}"
: "${CONTABO_CLIENT_ID:?Set CONTABO_CLIENT_ID}"
: "${CONTABO_CLIENT_SECRET:?Set CONTABO_CLIENT_SECRET}"
: "${CONTABO_API_USER:?Set CONTABO_API_USER}"
: "${CONTABO_API_PASSWORD:?Set CONTABO_API_PASSWORD}"

command -v oci >/dev/null || { echo 'OCI CLI is required.' >&2; exit 1; }
command -v jq >/dev/null || { echo 'jq is required.' >&2; exit 1; }

cat <<PLAN
Rollback plan:
  OCI instance:     $OCI_INSTANCE_ID
  OCI backup:       $OCI_BOOT_VOLUME_BACKUP_ID
  Contabo instance: $CONTABO_INSTANCE_ID
  Contabo snapshot: $CONTABO_SNAPSHOT_ID
  Actions: stop OCI -> create/attach restored boot volume -> start OCI -> rollback Contabo snapshot
PLAN

if [[ "${ROLLBACK_CONFIRMATION:-}" != "RESTORE_REKOV_RECOVERY_POINT" ]]; then
  echo 'Plan only. Set ROLLBACK_CONFIRMATION=RESTORE_REKOV_RECOVERY_POINT to execute.'
  exit 0
fi

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

ad="$(oci iam availability-domain list --config-file "$oci_config" \
  --compartment-id "$TF_VAR_tenancy_ocid" --query 'data[0].name' --raw-output)"
attachment_id="$(oci compute boot-volume-attachment list --config-file "$oci_config" \
  --availability-domain "$ad" --compartment-id "$TF_VAR_compartment_ocid" \
  --instance-id "$OCI_INSTANCE_ID" --query 'data[0].id' --raw-output)"
[[ -n "$attachment_id" && "$attachment_id" != "null" ]] || {
  echo 'Could not resolve the current OCI boot-volume attachment.' >&2
  exit 1
}

restored_boot_volume_id="$(oci bv boot-volume create --config-file "$oci_config" \
  --compartment-id "$TF_VAR_compartment_ocid" --availability-domain "$ad" \
  --source-boot-volume-backup-id "$OCI_BOOT_VOLUME_BACKUP_ID" \
  --display-name "rekov-restored-control-$(date -u +%Y%m%dT%H%M%SZ)" \
  --wait-for-state AVAILABLE --max-wait-seconds 1800 --query 'data.id' --raw-output)"
oci compute instance action --config-file "$oci_config" \
  --instance-id "$OCI_INSTANCE_ID" --action STOP --wait-for-state STOPPED
oci compute boot-volume-attachment detach --config-file "$oci_config" \
  --boot-volume-attachment-id "$attachment_id" --wait-for-state DETACHED
oci compute boot-volume-attachment attach --config-file "$oci_config" \
  --instance-id "$OCI_INSTANCE_ID" --boot-volume-id "$restored_boot_volume_id" \
  --wait-for-state ATTACHED
oci compute instance action --config-file "$oci_config" \
  --instance-id "$OCI_INSTANCE_ID" --action START --wait-for-state RUNNING

contabo_token="$(curl -fsS https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token \
  -d "client_id=$CONTABO_CLIENT_ID" -d "client_secret=$CONTABO_CLIENT_SECRET" \
  --data-urlencode "username=$CONTABO_API_USER" \
  --data-urlencode "password=$CONTABO_API_PASSWORD" -d 'grant_type=password' \
  | jq -er '.access_token')"
curl -fsS -X POST \
  "https://api.contabo.com/v1/compute/instances/$CONTABO_INSTANCE_ID/snapshots/$CONTABO_SNAPSHOT_ID/rollback" \
  -H "Authorization: Bearer $contabo_token" \
  -H "Content-Type: application/json" \
  -H "x-request-id: $(cat /proc/sys/kernel/random/uuid)" \
  -d '{}' >/dev/null

printf 'Rollback requests completed. Restored OCI boot volume: %s\n' "$restored_boot_volume_id"
