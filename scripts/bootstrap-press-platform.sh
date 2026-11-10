#!/usr/bin/env bash
# Run as root on the Press control VM after bootstrap-press-control.sh.
set -Eeuo pipefail

: "${PRESS_CONTROL_HOSTNAME:?Set PRESS_CONTROL_HOSTNAME}"
: "${PRESS_ROOT_DOMAIN:?Set PRESS_ROOT_DOMAIN}"
: "${PRESS_TENANT_NODE_PUBLIC_IP:?Set PRESS_TENANT_NODE_PUBLIC_IP}"
: "${PRESS_SSH_PUBLIC_KEY:?Set PRESS_SSH_PUBLIC_KEY}"

bench_root=/home/frappe/press-bench
source_file=/tmp/rekov/rekov_press_platform.py
target_file="$bench_root/rekov_press_platform.py"

[[ -f "$source_file" ]] || { echo "Missing $source_file" >&2; exit 1; }
[[ -d "$bench_root" ]] || { echo "Missing Press bench: $bench_root" >&2; exit 1; }

install -o frappe -g frappe -m 0640 "$source_file" "$target_file"
runuser -u frappe -- env \
  PRESS_ROOT_DOMAIN="$PRESS_ROOT_DOMAIN" \
  PRESS_TENANT_NODE_PUBLIC_IP="$PRESS_TENANT_NODE_PUBLIC_IP" \
  PRESS_SSH_PUBLIC_KEY="$PRESS_SSH_PUBLIC_KEY" \
  PATH="/home/frappe/.local/bin:$PATH" \
  PYTHONPATH="$bench_root" \
  bash -lc "cd '$bench_root' && bench --site '$PRESS_CONTROL_HOSTNAME' execute rekov_press_platform.bootstrap"
