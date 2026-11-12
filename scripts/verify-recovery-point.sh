#!/usr/bin/env bash
set -Eeuo pipefail

: "${RECOVERY_POINT:?Set RECOVERY_POINT to a recovery directory}"
: "${OCI_BOOT_VOLUME_BACKUP_ID:?Set OCI_BOOT_VOLUME_BACKUP_ID to the retained OCI backup OCID}"
: "${CONTABO_SNAPSHOT_ID:?Set CONTABO_SNAPSHOT_ID to the retained Contabo snapshot ID}"

manifest="$RECOVERY_POINT/manifest.txt"
[[ -r "$manifest" ]] || { echo "Missing $manifest" >&2; exit 1; }
grep -q '^git_sha=[0-9a-f]\{40\}$' "$manifest" || { echo 'Manifest has no Git SHA.' >&2; exit 1; }
grep -q '^created_at=' "$manifest" || { echo 'Manifest has no creation timestamp.' >&2; exit 1; }
grep -q "^oci_boot_volume_backup_id=$OCI_BOOT_VOLUME_BACKUP_ID$" "$manifest" || {
  echo 'Manifest does not record the expected OCI boot-volume backup.' >&2
  exit 1
}
grep -q "^contabo_snapshot_id=$CONTABO_SNAPSHOT_ID$" "$manifest" || {
  echo 'Manifest does not record the expected Contabo snapshot.' >&2
  exit 1
}

for required in control-mariadb.sql.enc tenant-mariadb.sql.enc control-state.tar.gz.enc tenant-state.tar.gz.enc; do
  [[ -s "$RECOVERY_POINT/$required" ]] || {
    echo "Missing or empty recovery artifact: $required" >&2
    exit 1
  }
done

checksum_lines="$RECOVERY_POINT/.checksums"
awk '/^[0-9a-f]{64}  / { print }' "$manifest" >"$checksum_lines"
[[ -s "$checksum_lines" ]] || { echo 'Manifest has no checksums.' >&2; exit 1; }
(cd "$RECOVERY_POINT" && sha256sum -c .checksums)
rm -f "$checksum_lines"

printf 'Recovery point is complete and checksummed.\n'
printf 'OCI boot-volume backup: %s\n' "$OCI_BOOT_VOLUME_BACKUP_ID"
printf 'Contabo instance snapshot: %s\n' "$CONTABO_SNAPSHOT_ID"
