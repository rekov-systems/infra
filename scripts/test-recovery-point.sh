#!/usr/bin/env bash
set -Eeuo pipefail

# Offline contract test for the recovery verifier. It intentionally uses fake
# provider IDs and disposable artifacts; it never contacts either provider.
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
point="$(mktemp -d)"
trap 'rm -rf "$point"' EXIT

printf 'encrypted control database fixture\n' >"$point/control-mariadb.sql.enc"
printf 'encrypted tenant database fixture\n' >"$point/tenant-mariadb.sql.enc"
printf 'encrypted control state fixture\n' >"$point/control-state.tar.gz.enc"
printf 'encrypted tenant state fixture\n' >"$point/tenant-state.tar.gz.enc"
printf '{}\n' >"$point/press-status.json"
printf '{}\n' >"$point/terraform-outputs.json"

{
  printf 'created_at=2026-01-01T00:00:00Z\n'
  printf 'git_sha=0123456789012345678901234567890123456789\n'
  printf 'git_ref=fixture\n'
  printf 'oci_boot_volume_backup_id=ocid1.bootvolumebackup.fixture\n'
  printf 'contabo_snapshot_id=fixture-snapshot\n'
  printf '\nchecksums=\n'
  (cd "$point" && sha256sum -- *.enc *.json | sort)
} >"$point/manifest.txt"

RECOVERY_POINT="$point" \
  OCI_BOOT_VOLUME_BACKUP_ID=ocid1.bootvolumebackup.fixture \
  CONTABO_SNAPSHOT_ID=fixture-snapshot \
  "$root/scripts/verify-recovery-point.sh"
