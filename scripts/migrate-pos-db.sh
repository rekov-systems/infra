#!/usr/bin/env bash
set -Eeuo pipefail
: "${MIGRATIONS_DIR:?Set MIGRATIONS_DIR}"
cd /opt/rms/supabase
compose=(docker compose -f docker-compose.yml -f docker-compose.rms.yml)
db() { "${compose[@]}" exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
db -c 'CREATE SCHEMA IF NOT EXISTS rms_migrations; CREATE TABLE IF NOT EXISTS rms_migrations.applied (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());'
for file in "$MIGRATIONS_DIR"/*.sql; do
  [[ -f "$file" ]] || continue
  version="$(basename "$file" .sql)"
  applied="$(db -Atc "SELECT 1 FROM rms_migrations.applied WHERE version = '$version'")"
  [[ "$applied" == 1 ]] && continue
  {
    printf 'BEGIN;\n'
    cat "$file"
    printf '\nINSERT INTO rms_migrations.applied(version) VALUES (\047%s\047);\nCOMMIT;\n' "$version"
  } | db
done
