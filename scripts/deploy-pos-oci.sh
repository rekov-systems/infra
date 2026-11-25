#!/usr/bin/env bash
set -Eeuo pipefail
root=/opt/rms
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi
mkdir -p "$root/pos"
tar -xzf /tmp/rms-pos-dist.tgz -C "$root/pos"
install -m 0644 /tmp/nginx-pos.conf "$root/nginx-pos.conf"
install -m 0644 /tmp/oci-compose.yml "$root/docker-compose.yml"
install -m 0644 /tmp/Caddyfile.oci "$root/Caddyfile"
install -d -m 0750 "$root/caddy"
install -m 0644 /tmp/caddy-cloudflare.Dockerfile "$root/caddy/Dockerfile"
if [[ -f /tmp/oci.env ]]; then
  install -m 0600 /tmp/oci.env "$root/.env"
fi
install -d -m 0750 "$root/caddy-data" "$root/caddy-config"
docker compose -f "$root/docker-compose.yml" up -d --wait pos-web
curl --retry 20 --retry-delay 1 --retry-connrefused -fsS http://127.0.0.1:8080/health
curl --retry 20 --retry-delay 1 --retry-connrefused -fsS http://127.0.0.1:8080/ | grep -q '<div id="root">'

# Switch the public web server only after the new POS is healthy on localhost.
for service in nginx; do
  if systemctl is-active --quiet "$service"; then
    systemctl stop "$service"
    systemctl disable "$service" || true
  fi
done
trap 'status=$?; docker compose -f "$root/docker-compose.yml" stop rms-caddy >/dev/null 2>&1 || true; systemctl enable --now nginx >/dev/null 2>&1 || true; exit "$status"' ERR
docker compose -f "$root/docker-compose.yml" up -d --wait
curl --retry 30 --retry-delay 2 --retry-connrefused -fsS https://pos.rekov.co/health
trap - ERR
