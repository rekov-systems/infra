#!/usr/bin/env bash
set -euo pipefail

source_dir="${1:?Usage: package-desk-runtime.sh DESK_BUILD_DIR DEST_DIR}"
dest_dir="${2:?Usage: package-desk-runtime.sh DESK_BUILD_DIR DEST_DIR}"
dashboard="$source_dir/packages/dashboard"
standalone="$dashboard/.next/standalone"

[[ -s "$standalone/packages/dashboard/server.js" ]] || {
  echo "Next standalone server was not produced at the expected path" >&2
  exit 1
}
mkdir -p "$dest_dir"
cp -a "$standalone/." "$dest_dir/"
mkdir -p "$dest_dir/packages/dashboard/.next/static"
cp -a "$dashboard/.next/static/." "$dest_dir/packages/dashboard/.next/static/"
if [[ -d "$dashboard/public" ]]; then
  mkdir -p "$dest_dir/packages/dashboard/public"
  cp -a "$dashboard/public/." "$dest_dir/packages/dashboard/public/"
fi
[[ -s "$dest_dir/packages/dashboard/server.js" ]] || exit 1
echo "Packaged Desk Next runtime at $dest_dir"
