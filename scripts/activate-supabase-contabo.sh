#!/usr/bin/env bash
set -Eeuo pipefail
cd /opt/rms/supabase
compose=(docker compose -f docker-compose.yml -f docker-compose.rms.yml)
for service in nginx; do
  if systemctl is-active --quiet "$service"; then
    systemctl stop "$service"
    systemctl disable "$service" || true
  fi
done
trap 'status=$?; docker compose -f docker-compose.yml -f docker-compose.rms.yml stop rms-caddy >/dev/null 2>&1 || true; systemctl enable --now nginx >/dev/null 2>&1 || true; exit "$status"' ERR
"${compose[@]}" up -d --wait rms-caddy
curl --retry 30 --retry-delay 3 --retry-connrefused -fsS \
  https://api.pos.rekov.co/auth/v1/health >/dev/null
trap - ERR
