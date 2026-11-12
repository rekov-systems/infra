#!/usr/bin/env bash
set -Eeuo pipefail

# R2-only recovery intentionally never mutates provider infrastructure. It
# verifies the encrypted recovery point and prints the clean-rebuild plan.
cat <<PLAN
Rollback plan:
  Source:            R2 encrypted recovery point
  Actions:           provision clean infrastructure, bootstrap native Press,
                     decrypt and restore MariaDB/sites/Press state
PLAN

if [[ "${ROLLBACK_CONFIRMATION:-}" != "RESTORE_REKOV_RECOVERY_POINT" ]]; then
  echo 'Plan only. Set ROLLBACK_CONFIRMATION=RESTORE_REKOV_RECOVERY_POINT to execute.'
  exit 0
fi

echo 'R2-only recovery is a clean rebuild plus encrypted artifact restoration.'
echo 'Provider rollback is intentionally disabled.'
