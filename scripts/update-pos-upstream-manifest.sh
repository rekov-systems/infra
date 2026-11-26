#!/usr/bin/env bash
set -euo pipefail

sha="${1:?Usage: update-pos-upstream-manifest.sh UPSTREAM_COMMIT_SHA}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "Expected a full 40-character upstream commit SHA" >&2; exit 2; }
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python3 - "$repo_root" "$sha" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1])
sha = sys.argv[2]
patch = root / "overlays/pos/desk-rms.patch"
manifest = root / "apps/control/pos-upstream.json"
result = subprocess.run(
    ["git", "apply", "--numstat", str(patch)],
    check=True,
    capture_output=True,
    text=True,
)
paths = set()
for line in result.stdout.splitlines():
    columns = line.split("\t")
    if len(columns) == 3 and columns[2].startswith("apps/pos/"):
        paths.add(columns[2][len("apps/pos/"):])
manifest.write_text(json.dumps({
    "repository": "mateopiza/ai-point-of-sale",
    "branch": "main",
    "base_sha": sha,
    "overlay_paths": sorted(paths),
}, ensure_ascii=False, indent=2) + "\n")
PY
