#!/usr/bin/env bash
set -Eeuo pipefail
cd /opt/rms/supabase
compose=(docker compose -f docker-compose.yml -f docker-compose.rms.yml)
publishable_key="$(sed -n 's/^SUPABASE_PUBLISHABLE_KEY=//p' /opt/rms/supabase/.env | tail -n 1)"
: "${publishable_key:?SUPABASE_PUBLISHABLE_KEY is missing}"
for service in nginx; do
  if systemctl is-active --quiet "$service"; then
    systemctl stop "$service"
    systemctl disable "$service" || true
  fi
done
trap 'status=$?; docker compose -f docker-compose.yml -f docker-compose.rms.yml stop rms-caddy >/dev/null 2>&1 || true; systemctl enable --now nginx >/dev/null 2>&1 || true; exit "$status"' ERR
# Compose does not detect changes to a bind-mounted Caddyfile. Recreate the
# existing service so it loads the Desk hostnames staged by this deployment.
"${compose[@]}" stop rms-caddy >/dev/null 2>&1 || true
"${compose[@]}" up -d --force-recreate --wait rms-caddy
if ! curl --retry 30 --retry-delay 3 --retry-connrefused --retry-all-errors -fsS \
  -H "apikey: $publishable_key" \
  https://api.desk.rekov.co/auth/v1/health >/dev/null; then
  docker logs --tail=100 rms-caddy >&2 || true
  exit 1
fi
trap - ERR
