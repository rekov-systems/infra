# shellcheck shell=bash
# OCI serial console capture for boot-watch (source from verify / watch-public-boot).
# Expects: INSTANCE_ID, CONSOLE_BUF, CONSOLE_LINES, log()

oci_console_fetch() {
  local id state i
  id="$(oci compute console-history capture --instance-id "$INSTANCE_ID" --query 'data.id' --raw-output 2>/dev/null)" || return 1
  state=REQUESTED
  for i in $(seq 1 90); do
    state="$(oci compute console-history get --instance-console-history-id "$id" --query 'data."lifecycle-state"' --raw-output 2>/dev/null || echo FAILED)"
    case "$state" in
      SUCCEEDED) break ;;
      FAILED) oci compute console-history delete --instance-console-history-id "$id" --force >/dev/null 2>&1 || true; return 1 ;;
    esac
    sleep 2
  done
  if [ "$state" != SUCCEEDED ]; then
    oci compute console-history delete --instance-console-history-id "$id" --force >/dev/null 2>&1 || true
    return 1
  fi
  oci compute console-history get-content --instance-console-history-id "$id" --file "$CONSOLE_BUF" >/dev/null 2>&1 || true
  oci compute console-history delete --instance-console-history-id "$id" --force >/dev/null 2>&1 || true
  return 0
}

emit_console_delta() {
  local total new line
  total="$(wc -l <"$CONSOLE_BUF" 2>/dev/null || echo 0)"
  new=$((total - CONSOLE_LINES))
  if [ "$new" -le 0 ]; then
    log "serial console: no new lines (total=$total)"
    return 0
  fi
  log "serial console: +${new} lines (REKOV / docker / phase / error)"
  tail -n "$new" "$CONSOLE_BUF" | while IFS= read -r line; do
    case "$line" in
      *REKOV:*|*PHASE*|*docker*|*Docker*|*cloud-init*|*error*|*ERROR*|*fail*|*FAIL*|*compose*|*create-site*|*pull*|*erpnext*|*nginx*)
        printf '[serial] %s\n' "$line"
        ;;
    esac
  done
  CONSOLE_LINES=$total
}

scan_console_for_failure() {
  if grep -qE 'REKOV: PHASE_FAIL |=== PHASE FAILED:' "$CONSOLE_BUF" 2>/dev/null; then
    grep -E 'REKOV: PHASE_FAIL |=== PHASE FAILED:' "$CONSOLE_BUF" | tail -3
    return 0
  fi
  return 1
}

list_boot_phases_from_console() {
  # grep exit 1 with no matches must not abort callers using set -euo pipefail
  grep -oE 'REKOV: PHASE_OK [a-z0-9_]+' "$CONSOLE_BUF" 2>/dev/null | sed 's/REKOV: PHASE_OK //' | sort -u | tr '\n' ' ' || true
}
