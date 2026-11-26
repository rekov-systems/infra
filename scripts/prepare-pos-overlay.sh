#!/usr/bin/env bash
set -euo pipefail

source_dir="${1:?Usage: prepare-pos-overlay.sh SOURCE_DIR DEST_DIR}"
dest_dir="${2:?Usage: prepare-pos-overlay.sh SOURCE_DIR DEST_DIR}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
patch_file="$repo_root/overlays/pos/desk-rms.patch"

[[ -d "$source_dir" ]] || { echo "Missing upstream POS directory: $source_dir" >&2; exit 1; }
[[ -s "$patch_file" ]] || { echo "Missing Desk RMS overlay: $patch_file" >&2; exit 1; }
rm -rf "$dest_dir"
mkdir -p "$dest_dir"
cp -a "$source_dir/." "$dest_dir/"
git -C "$dest_dir" init -q
git -C "$dest_dir" apply --check -p3 "$patch_file"
git -C "$dest_dir" apply -p3 "$patch_file"
rm -rf "$dest_dir/.git"
echo "Prepared upstream POS with Rekov Desk overlay at $dest_dir"
