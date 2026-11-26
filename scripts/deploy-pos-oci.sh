#!/usr/bin/env bash
set -Eeuo pipefail
root=/opt/rms
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi
mkdir -p "$root/pos"
mkdir -p "$root/desk-runtime"
tar -xzf /tmp/rms-pos-dist.tgz -C "$root/pos"
tar -xzf /tmp/desk-runtime.tgz -C "$root/desk-runtime"
if [[ ! -s "$root/desk-runtime/packages/dashboard/server.js" ]]; then
  echo "Desk standalone server is missing from the deployment artifact" >&2
  exit 1
fi
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
docker compose -f "$root/docker-compose.yml" up -d --wait --force-recreate desk-web pos-web
echo "Checking nginx health endpoint"
if ! curl --retry 20 --retry-delay 1 --retry-connrefused --retry-all-errors \
  --max-time 10 -fsS http://127.0.0.1:8080/health; then
  echo "The OCI web container is running but its published health port is not responding" >&2
  docker ps -a --filter name=rms-pos-web --filter name=desk-web >&2 || true
  docker logs --tail=100 rms-pos-web >&2 || true
  docker logs --tail=100 desk-web >&2 || true
  ss -ltnp >&2 || true
  exit 1
fi
echo "Checking POS root document"
curl --retry 20 --retry-delay 1 --retry-connrefused -fsS \
  -H 'Host: desk.rekov.co' http://127.0.0.1:8080/ -o /tmp/desk-index.html
grep -qi 'desk' /tmp/desk-index.html
echo "Checking Desk login document"
curl --retry 10 --retry-delay 1 --retry-connrefused -fsS \
  -H 'Host: desk.rekov.co' http://127.0.0.1:8080/login -o /tmp/desk-login.html
grep -qi 'iniciar sesión' /tmp/desk-login.html
echo "Checking RMS interior document"
curl --retry 10 --retry-delay 1 --retry-connrefused -fsS \
  -H 'Host: desk.rekov.co' http://127.0.0.1:8080/rms/ -o /tmp/rms-index.html
grep -q '<div id="root">' /tmp/rms-index.html
echo "Checking the control panel document on the isolated hostname"
curl --retry 10 --retry-delay 1 --retry-connrefused -fsS \
  -H 'Host: control.desk.rekov.co' http://127.0.0.1:8080/ -o /tmp/rms-control-index.html
grep -q '<div id="app">' /tmp/rms-control-index.html
echo "Checking the control panel application bundle"
curl --retry 10 --retry-delay 1 --retry-connrefused -fsS \
  -H 'Host: control.desk.rekov.co' http://127.0.0.1:8080/app.js -o /tmp/rms-control-app.js
grep -q 'PANEL DE PLATAFORMA' /tmp/rms-control-app.js

# Switch the public web server only after Desk and the RMS are healthy locally.
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
curl --retry 30 --retry-delay 2 --retry-connrefused --retry-all-errors -fsS \
  --resolve desk.rekov.co:443:127.0.0.1 https://desk.rekov.co/health
curl --retry 10 --retry-delay 2 --retry-connrefused --retry-all-errors -fsS \
  --resolve desk.rekov.co:443:127.0.0.1 https://desk.rekov.co/ -o /tmp/desk-public-index.html
grep -qi 'desk' /tmp/desk-public-index.html
curl --retry 10 --retry-delay 2 --retry-connrefused --retry-all-errors -fsS \
  --resolve desk.rekov.co:443:127.0.0.1 https://desk.rekov.co/login -o /tmp/desk-login.html
grep -qi 'iniciar sesión' /tmp/desk-login.html
curl --retry 10 --retry-delay 2 --retry-connrefused --retry-all-errors -fsS \
  --resolve desk.rekov.co:443:127.0.0.1 https://desk.rekov.co/rms/ -o /tmp/rms-app.html
grep -q '<div id="root">' /tmp/rms-app.html
trap - ERR
