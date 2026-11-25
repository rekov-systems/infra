#!/usr/bin/env bash
set -Eeuo pipefail
: "${SUPABASE_DB_PASSWORD:?Set SUPABASE_DB_PASSWORD}"
: "${SUPABASE_DASHBOARD_PASSWORD:?Set SUPABASE_DASHBOARD_PASSWORD}"
: "${RMS_PLATFORM_ADMIN_EMAIL:?Set RMS_PLATFORM_ADMIN_EMAIL}"
: "${RMS_PLATFORM_ADMIN_PASSWORD:?Set RMS_PLATFORM_ADMIN_PASSWORD}"

root=/opt/rms
src="$root/supabase-source"
stack="$root/supabase"
mkdir -p "$root"
chmod 750 "$root"

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi
docker compose version >/dev/null

if [[ ! -d "$src/.git" ]]; then
  git clone --filter=blob:none --no-checkout --depth=1 --branch self-hosted/v0.8.5 \
    https://github.com/supabase/supabase.git "$src"
  git -C "$src" sparse-checkout init --cone
  git -C "$src" sparse-checkout set docker
  git -C "$src" checkout --quiet
fi

mkdir -p "$stack"
if [[ ! -f "$stack/.env" ]]; then
  cp -a "$src/docker/." "$stack/"
  cp "$stack/.env.example" "$stack/.env"
  (cd "$stack" && sh utils/generate-keys.sh --update-env)
  (cd "$stack" && sh utils/add-new-auth-keys.sh --update-env)
fi

python3 - "$stack/.env" "$SUPABASE_DB_PASSWORD" "$SUPABASE_DASHBOARD_PASSWORD" "${DESK_AI_WORKER_URL:-}" "$RMS_PLATFORM_ADMIN_EMAIL" "$RMS_PLATFORM_ADMIN_PASSWORD" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
values = {
    "POSTGRES_PASSWORD": sys.argv[2],
    "DASHBOARD_USERNAME": "supabase",
    "DASHBOARD_PASSWORD": sys.argv[3],
    "SUPABASE_PUBLIC_URL": "https://api.pos.rekov.co",
    "API_EXTERNAL_URL": "https://api.pos.rekov.co/auth/v1",
    "SITE_URL": "https://pos.rekov.co",
    "ADDITIONAL_REDIRECT_URLS": "https://pos.rekov.co/**",
    "DISABLE_SIGNUP": "true",
    "API_GW_HTTP_PORT": "127.0.0.1:8000",
    "FUNCTIONS_VERIFY_JWT": "false",
    "DESK_AI_WORKER_URL": sys.argv[4],
    "RMS_PLATFORM_ADMIN_EMAIL": sys.argv[5],
    "RMS_PLATFORM_ADMIN_PASSWORD": sys.argv[6],
    "STUDIO_DEFAULT_ORGANIZATION": "Rekov",
    "STUDIO_DEFAULT_PROJECT": "Retail Management System",
}
lines = path.read_text().splitlines()
for key, value in values.items():
    replacement = f"{key}={value}"
    for i, line in enumerate(lines):
        if line.startswith(f"{key}="):
            lines[i] = replacement
            break
    else:
        lines.append(replacement)
path.write_text("\n".join(lines) + "\n")
path.chmod(0o600)
PY

install -m 0644 /tmp/rms-supabase-compose.yml "$stack/docker-compose.rms.yml"
install -m 0644 /tmp/rms-Caddyfile "$root/Caddyfile"
install -d -m 0750 "$root/caddy-data" "$root/caddy-config"
cd "$stack"
docker compose -f docker-compose.yml -f docker-compose.rms.yml pull
mapfile -t services < <(docker compose -f docker-compose.yml -f docker-compose.rms.yml config --services | grep -v '^rms-caddy$')
docker compose -f docker-compose.yml -f docker-compose.rms.yml up -d --wait "${services[@]}"
if [[ -d /tmp/rms-functions ]]; then
  functions="$stack/volumes/functions"
  find "$functions" -mindepth 1 -maxdepth 1 -type d ! -name main -exec rm -rf {} +
  for name in create-user rappi-order-action rappi-sync-menu rappi-test-connection rappi-webhook; do
    [[ -d "/tmp/rms-functions/$name" ]] && cp -a "/tmp/rms-functions/$name" "$functions/"
  done
  [[ -d /tmp/rms-functions/_shared ]] && cp -a /tmp/rms-functions/_shared "$functions/"
  for name in ai-order-agent process-invoice embed-knowledge-doc rms-admin; do
    if [[ -d "/tmp/rms-custom-functions/$name" ]]; then
      rm -rf "$functions/$name"
      cp -a "/tmp/rms-custom-functions/$name" "$functions/"
    fi
  done
  docker compose -f docker-compose.yml -f docker-compose.rms.yml up -d --wait functions
fi
publishable_key="$(sed -n 's/^SUPABASE_PUBLISHABLE_KEY=//p' "$stack/.env" | tail -n 1)"
: "${publishable_key:?SUPABASE_PUBLISHABLE_KEY was not generated}"
curl --retry 30 --retry-delay 2 --retry-connrefused -fsS \
  -H "apikey: $publishable_key" http://127.0.0.1:8000/auth/v1/health >/dev/null
