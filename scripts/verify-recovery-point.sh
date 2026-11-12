#!/usr/bin/env bash
set -Eeuo pipefail

: "${RECOVERY_POINT:?Set RECOVERY_POINT to a recovery directory}"

manifest="$RECOVERY_POINT/manifest.txt"
[[ -r "$manifest" ]] || { echo "Missing $manifest" >&2; exit 1; }
grep -q '^git_sha=[0-9a-f]\{40\}$' "$manifest" || { echo 'Manifest has no Git SHA.' >&2; exit 1; }
grep -q '^created_at=' "$manifest" || { echo 'Manifest has no creation timestamp.' >&2; exit 1; }
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
printf 'R2-only recovery: provider snapshots are intentionally not used.\n'
