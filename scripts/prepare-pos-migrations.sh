#!/usr/bin/env bash
set -Eeuo pipefail
source_dir="${1:?Usage: prepare-pos-migrations.sh SOURCE_DIR DEST_DIR}"
dest_dir="${2:?Usage: prepare-pos-migrations.sh SOURCE_DIR DEST_DIR}"
rm -rf "$dest_dir"
mkdir -p "$dest_dir"
python3 - "$source_dir" "$dest_dir" <<'PY'
from pathlib import Path
import sys

source, dest = map(Path, sys.argv[1:])
skip = {
    "20260508120000_seed_panaderia_tenant.sql",
    "20260508130000_seed_panaderia_demo_users.sql",
}
marker = "DO $$\nDECLARE\n  v_tenant_id uuid;\n  u_id uuid;\n  demo_pwd text := crypt('Demo2026!'"
for path in sorted(source.glob("*.sql")):
    if path.name in skip:
        continue
    sql = path.read_text()
    if "CambiarEsta2026!" in sql or "crypt('Demo2026!'" in sql:
        if path.name != "20260511081156_stabilize_pos_qr_modifiers.sql" or sql.count(marker) != 1:
            raise SystemExit(f"Refusing to deploy unreviewed seeded credentials in {path.name}")
        sql = sql.split(marker, 1)[0].rstrip() + "\n"
    (dest / path.name).write_text(sql)
PY
