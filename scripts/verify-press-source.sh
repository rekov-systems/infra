#!/usr/bin/env bash
# Verify the pinned upstream source before a deployment can reach OCI.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bootstrap="$repo_root/scripts/bootstrap-press-control.sh"
press_revision="$(sed -nE 's/^press_revision="([0-9a-f]{40})"$/\1/p' "$bootstrap")"
frappe_revision="$(sed -nE 's/^frappe_revision="([0-9a-f]{40})"$/\1/p' "$bootstrap")"
[[ "$press_revision" =~ ^[0-9a-f]{40}$ && "$frappe_revision" =~ ^[0-9a-f]{40}$ ]] || {
  echo 'Press and Frappe revisions must be full immutable Git SHAs.' >&2
  exit 1
}

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
git init --quiet "$workdir/frappe"
git -C "$workdir/frappe" remote add origin https://github.com/frappe/frappe.git
git -C "$workdir/frappe" fetch --quiet --depth=1 origin "$frappe_revision"
git -C "$workdir/frappe" checkout --quiet --detach "$frappe_revision"
git init --quiet "$workdir/press"
git -C "$workdir/press" remote add origin https://github.com/frappe/press.git
git -C "$workdir/press" fetch --quiet --depth=1 origin "$press_revision"
git -C "$workdir/press" checkout --quiet --detach "$press_revision"

grep -q '^init_telemetry[[:space:]]*=' "$workdir/frappe/frappe/utils/telemetry/__init__.py" || {
  echo 'Pinned Frappe source lacks init_telemetry required by Press.' >&2
  exit 1
}

selfhosted_api="$workdir/press/press/api/selfhosted.py"
for symbol in create_and_verify_selfhosted verify setup; do
  grep -q "^def ${symbol}(" "$selfhosted_api" || {
    echo "Pinned Press source lacks native self-hosted API: ${symbol}." >&2
    exit 1
  }
done
grep -q '^[[:space:]]*def _setup_server(' "$workdir/press/press/press/doctype/proxy_server/proxy_server.py" || {
  echo 'Pinned Press source lacks native proxy setup implementation.' >&2
  exit 1
}
grep -R -q '^[[:space:]]*def setup_server(' "$workdir/press/press/press/doctype" || {
  echo 'Pinned Press source lacks native server setup API.' >&2
  exit 1
}

# Match the only Python-3.14 syntax compatibility transform performed by the
# bootstrap, then ensure the transformed upstream module actually compiles.
cache_utils="$workdir/press/press/press/doctype/deploy_candidate/cache_utils.py"
python3.14 - "$cache_utils" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text()
old = '''CommandOutput = TypedDict(
\t"CommandOutput",
\tcwd=str,
\timage_tag=str,
\treturncode=int,
\toutput=str,
)'''
new = '''CommandOutput = TypedDict(
\t"CommandOutput",
\t{
\t\t"cwd": str,
\t\t"image_tag": str,
\t\t"returncode": int,
\t\t"output": str,
\t},
)'''
if old not in text:
    raise SystemExit("Unexpected TypedDict source; update bootstrap and verifier together.")
path.write_text(text.replace(old, new, 1))
PY
python3.14 -m py_compile "$cache_utils"

echo "Verified Press $press_revision with Frappe $frappe_revision."
