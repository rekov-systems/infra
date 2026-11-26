#!/usr/bin/env bash
set -Eeuo pipefail
root=/opt/rms
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi
mkdir -p "$root/pos"
tar -xzf /tmp/rms-pos-dist.tgz -C "$root/pos"
if [[ ! -s "$root/pos/control/index.html" ]]; then
  echo "Control panel bundle is missing from the POS artifact" >&2
  find "$root/pos" -maxdepth 2 -type f | head -50 >&2
  exit 1
fi
install -m 0644 /tmp/nginx-pos.conf "$root/nginx-pos.conf"
install -m 0644 /tmp/oci-compose.yml "$root/docker-compose.yml"
install -m 0644 /tmp/Caddyfile.oci "$root/Caddyfile"
install -d -m 0750 "$root/caddy"
install -m 0644 /tmp/caddy-cloudflare.Dockerfile "$root/caddy/Dockerfile"
if [[ -f /tmp/oci.env ]]; then
  install -m 0600 /tmp/oci.env "$root/.env"
fi
install -d -m 0750 "$root/caddy-data" "$root/caddy-config"
docker compose -f "$root/docker-compose.yml" up -d --wait --force-recreate pos-web
echo "Checking nginx health endpoint"
curl --retry 20 --retry-delay 1 --retry-connrefused -fsS http://127.0.0.1:8080/health
echo "Checking POS root document"
curl --retry 20 --retry-delay 1 --retry-connrefused -fsS http://127.0.0.1:8080/ -o /tmp/rms-pos-index.html
grep -q '<div id="root">' /tmp/rms-pos-index.html
echo "Checking the control panel document on the isolated hostname"
curl --retry 10 --retry-delay 1 --retry-connrefused -fsS \
  -H 'Host: control.desk.rekov.co' http://127.0.0.1:8080/ -o /tmp/rms-control-index.html
grep -q '<div id="app">' /tmp/rms-control-index.html
echo "Checking the control panel application bundle"
curl --retry 10 --retry-delay 1 --retry-connrefused -fsS \
  -H 'Host: control.desk.rekov.co' http://127.0.0.1:8080/app.js -o /tmp/rms-control-app.js
grep -q 'PANEL DE PLATAFORMA' /tmp/rms-control-app.js

# Switch the public web server only after the new POS is healthy on localhost.
for service in nginx; do
  if systemctl is-active --quiet "$service"; then
    systemctl stop "$service"
    systemctl disable "$service" || true
  fi
done
restore_web() {
  status=$?
  docker logs --tail=100 rms-caddy >&2 || true
  docker compose -f "$root/docker-compose.yml" stop rms-caddy >/dev/null 2>&1 || true
  systemctl enable --now nginx >/dev/null 2>&1 || true
  exit "$status"
}
trap restore_web ERR
docker compose -f "$root/docker-compose.yml" up -d --wait --force-recreate rms-caddy
curl --retry 30 --retry-delay 2 --retry-connrefused --retry-all-errors -fsS https://desk.rekov.co/health
trap - ERR
