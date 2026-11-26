#!/usr/bin/env bash
set -euo pipefail

source_dir="${1:?Usage: prepare-desk-overlay.sh SOURCE_DIR DEST_DIR}"
dest_dir="${2:?Usage: prepare-desk-overlay.sh SOURCE_DIR DEST_DIR}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
manifest="$repo_root/apps/control/desk-upstream.json"
patch_file="$repo_root/overlays/desk/desk-rms.patch"

[[ -d "$source_dir/.git" ]] || { echo "Desk source checkout is missing its Git metadata" >&2; exit 1; }
[[ -s "$patch_file" ]] || { echo "Missing Desk integration overlay" >&2; exit 1; }
expected="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["base_sha"])' "$manifest")"
actual="$(git -C "$source_dir" rev-parse HEAD)"
[[ "$actual" == "$expected" ]] || {
  echo "Desk checkout $actual differs from pinned source $expected; review upstream changes first." >&2
  exit 1
}

mkdir -p "$dest_dir"
cp -a "$source_dir/." "$dest_dir/"
git -C "$dest_dir" apply --check "$patch_file"
git -C "$dest_dir" apply "$patch_file"
echo "Prepared pinned Desk source with the RMS login overlay at $dest_dir"
