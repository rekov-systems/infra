#!/usr/bin/env bash
# Run as root on the OCI control VM.
# Required: PRESS_CONTROL_HOSTNAME, PRESS_ADMIN_PASSWORD, PRESS_DB_ROOT_PASSWORD,
# PRESS_SSH_PRIVATE_KEY.
set -Eeuo pipefail

trap 'status=$?; echo "Press bootstrap failed at line ${BASH_LINENO[0]}: ${BASH_COMMAND} (exit ${status})" >&2; exit "$status"' ERR

: "${PRESS_CONTROL_HOSTNAME:?Set PRESS_CONTROL_HOSTNAME}"
: "${PRESS_ADMIN_PASSWORD:?Set PRESS_ADMIN_PASSWORD}"
: "${PRESS_DB_ROOT_PASSWORD:?Set PRESS_DB_ROOT_PASSWORD}"
: "${PRESS_SSH_PRIVATE_KEY:?Set PRESS_SSH_PRIVATE_KEY}"
: "${PRESS_TENANT_NODE_PUBLIC_IP:?Set PRESS_TENANT_NODE_PUBLIC_IP}"
: "${PRESS_ROOT_DOMAIN:?Set PRESS_ROOT_DOMAIN}"
: "${PRESS_CLOUDFLARE_API_TOKEN:?Set PRESS_CLOUDFLARE_API_TOKEN}"

# These two revisions are a compatibility unit. Do not replace either with a
# moving branch: the deployment must be reproducible and use Press's native
# self-hosted APIs without local patches.
press_revision="2339ede7c30e976dd3a76661dc128bfd5519f84e"
frappe_revision="2e9ecdc03fa5b5b8d1ba05224a1aff7dad832bd0"
bench_root="/home/frappe/press-bench"
bench_python="/usr/bin/python3.11"

bench_env_python_ok() {
  local venv_py="$bench_root/env/bin/python"
  [[ -x "$venv_py" ]] || return 1
  "$venv_py" -c 'import sys; sys.exit(0 if sys.version_info[:2] == (3, 11) else 1)' 2>/dev/null
}

as_frappe() {
  if command -v runuser >/dev/null 2>&1; then
    runuser -u frappe -w /home/frappe -- "$@"
  else
    sudo -u frappe -H -- "$@"
  fi
}

export DEBIAN_FRONTEND=noninteractive
# The control VM may retain a stale source from an earlier retry. Also avoid
# IPv6 repository timeouts on the OCI network.
printf '%s\n' 'Acquire::ForceIPv4 "true";' >/etc/apt/apt.conf.d/99-rekov-force-ipv4
apt-get update
add-apt-repository -y ppa:deadsnakes/ppa
apt-get update
apt-get install -y ansible build-essential ca-certificates certbot python3-certbot-dns-cloudflare cron curl fail2ban git golang-go libffi-dev libcups2-dev \
  libmariadb-dev libssl-dev mariadb-server nginx pkg-config redis-server sudo \
  python3-dev python3-pip python3-venv python3.11 python3.11-dev python3.11-venv software-properties-common xvfb
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs
corepack enable || true
command -v "$bench_python" >/dev/null || {
  echo 'Python 3.11 is required by the supported Press/Frappe runtime.' >&2
  exit 1
}

id frappe >/dev/null 2>&1 || useradd --create-home --shell /bin/bash frappe
install -d -o frappe -g frappe /home/frappe
install -d -o frappe -g frappe -m 0700 /home/frappe/.ssh
printf '%s\n' "$PRESS_SSH_PRIVATE_KEY" > /home/frappe/.ssh/id_ed25519
chown frappe:frappe /home/frappe/.ssh/id_ed25519
chmod 0600 /home/frappe/.ssh/id_ed25519
# Press runs Ansible as frappe. Seed the host key explicitly so the first
# managed-server connection is non-interactive and does not fail on the
# control plane's default StrictHostKeyChecking policy.
ssh-keygen -R "$PRESS_TENANT_NODE_PUBLIC_IP" -f /home/frappe/.ssh/known_hosts >/dev/null 2>&1 || true
known_hosts_tmp=$(mktemp)
trap 'rm -f "$known_hosts_tmp"' EXIT
for attempt in $(seq 1 12); do
  if ssh-keyscan -T 10 -H "$PRESS_TENANT_NODE_PUBLIC_IP" >"$known_hosts_tmp" 2>/dev/null \
    && grep -q 'ssh-' "$known_hosts_tmp"; then
    install -o frappe -g frappe -m 0600 "$known_hosts_tmp" /home/frappe/.ssh/known_hosts
    break
  fi
  sleep 2
done
[[ -s /home/frappe/.ssh/known_hosts ]] || {
  echo "Could not obtain the SSH host key for ${PRESS_TENANT_NODE_PUBLIC_IP}." >&2
  exit 1
}
chown frappe:frappe /home/frappe/.ssh/known_hosts
chmod 0600 /home/frappe/.ssh/known_hosts
if [[ -d "$bench_root/apps/frappe" ]] && bench_env_python_ok; then
  chown -R frappe:frappe "$bench_root"
else
  rm -rf "$bench_root"
fi

systemctl enable --now mariadb redis-server
mariadb_ping() {
  mariadb -u root -e 'SELECT 1' >/dev/null 2>&1 \
    || mariadb -u root -p"${PRESS_DB_ROOT_PASSWORD}" -e 'SELECT 1' >/dev/null 2>&1
}
for _ in $(seq 1 45); do
  mariadb_ping && break
  sleep 1
done
mariadb_ping || { echo 'MariaDB did not start.' >&2; exit 1; }

if mariadb -u root -e 'SELECT 1' >/dev/null 2>&1; then
  mariadb -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '${PRESS_DB_ROOT_PASSWORD}'; FLUSH PRIVILEGES;"
fi

# OCI Ubuntu images reject inbound traffic except SSH unless these rules exist.
cat >/usr/local/sbin/rekov-allow-web-ingress <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
for port in 80 443; do
  iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || \
    iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
done
EOF
chmod 0755 /usr/local/sbin/rekov-allow-web-ingress
cat >/etc/systemd/system/rekov-allow-web-ingress.service <<'EOF'
[Unit]
Description=Allow HTTP and HTTPS ingress to Rekov Nginx
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/rekov-allow-web-ingress
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now rekov-allow-web-ingress.service

as_frappe env PATH="$PATH" CI=1 BENCH_SUPPRESS_ROOT_WARNING=1 bash <<EOF
set -Eeuo pipefail
cd "\$HOME"
python3 -m pip install --user --break-system-packages frappe-bench
export PATH="\$HOME/.local/bin:\$PATH"
export CI=1
export UV_PYTHON="$bench_python"
export UV_PYTHON_PREFERENCE=only-system
if [[ ! -d "$bench_root/apps/frappe" ]]; then
  rm -rf "$bench_root"
elif [[ -x "$bench_root/env/bin/python" ]] && ! "$bench_root/env/bin/python" -c 'import sys; sys.exit(0 if sys.version_info[:2] == (3, 11) else 1)' 2>/dev/null; then
  rm -rf "$bench_root"
fi
if [[ ! -d "$bench_root/apps/frappe" ]]; then
  if ! bench init --frappe-branch version-15 --python "$bench_python" "$bench_root" <<< 'n'; then
    rm -rf "$bench_root"
    echo 'bench init failed.' >&2
    exit 1
  fi
fi
"$bench_root/env/bin/python" -c 'import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 11) else 1)' || {
  echo "Bench created an unsupported Python runtime; expected 3.11." >&2
  exit 1
}
cd "$bench_root"
git config --global --add safe.directory "$bench_root"
git config --global --add safe.directory "$bench_root/apps/frappe"
git config --global --add safe.directory "$bench_root/apps/press"
# version-15 is a moving target. Pin Frappe before installing Press so
# every run uses the same API surface as the pinned Press revision.
if git -C apps/frappe remote get-url origin >/dev/null 2>&1; then
  git -C apps/frappe remote set-url origin https://github.com/frappe/frappe.git
else
  git -C apps/frappe remote add origin https://github.com/frappe/frappe.git
fi
git -C apps/frappe fetch --depth=1 origin "$frappe_revision"
git -C apps/frappe checkout --detach "$frappe_revision"
if [[ ! -d apps/press/.git ]]; then
  git clone https://github.com/frappe/press.git apps/press
fi
# The VM may contain files modified by the removed custom bootstrap. The
# application checkouts are disposable source trees; sites, databases and
# Bench state live outside them. Clear only these trees before selecting the
# immutable native Press revision.
git -C apps/frappe reset --hard HEAD >/dev/null 2>&1 || true
git -C apps/frappe clean -fd >/dev/null 2>&1 || true
git -C apps/press reset --hard HEAD >/dev/null 2>&1 || true
git -C apps/press clean -fd >/dev/null 2>&1 || true
if git -C apps/press remote get-url origin >/dev/null 2>&1; then
  git -C apps/press remote set-url origin https://github.com/frappe/press.git
else
  git -C apps/press remote add origin https://github.com/frappe/press.git
fi
git -C apps/press fetch --depth=1 origin "$press_revision"
git -C apps/press checkout --detach "$press_revision"
grep -qxF press apps.txt 2>/dev/null || echo press >>apps.txt
bench setup requirements
if ! systemctl is-active --quiet redis-server; then
  echo 'The system Redis service is not running.' >&2
  exit 1
fi
# This control plane deliberately uses Ubuntu's managed Redis, not the
# development Redis processes (ports 11000/13000) generated by bench init.
bench set-config -g redis_cache 'redis://127.0.0.1:6379'
bench set-config -g redis_queue 'redis://127.0.0.1:6379'
bench set-config -g redis_socketio 'redis://127.0.0.1:6379'
# These are Bench common-config commands, not Frappe set-config commands.
# Press must use native systemd units, never Supervisor.
bench config restart_systemd_on_update on
bench config restart_supervisor_on_update off
install_marker=".rekov-press-control-complete"
if [[ -f "sites/$PRESS_CONTROL_HOSTNAME/site_config.json" && ! -f "\$install_marker" ]]; then
  # An interrupted install leaves DocTypes and database rows which cannot be
  # repaired safely with install-app --force. This path is only for the
  # initial, explicitly disposable control-plane bootstrap.
  bench drop-site "$PRESS_CONTROL_HOSTNAME" \\
    --force --no-backup \\
    --db-root-username root \\
    --db-root-password "$PRESS_DB_ROOT_PASSWORD"
fi
if [[ ! -f "sites/$PRESS_CONTROL_HOSTNAME/site_config.json" ]]; then
  bench new-site "$PRESS_CONTROL_HOSTNAME" \\
    --force \\
    --mariadb-root-username root \\
    --mariadb-root-password "$PRESS_DB_ROOT_PASSWORD" \\
    --admin-password "$PRESS_ADMIN_PASSWORD"
fi
installed_apps_file=".rekov-installed-apps"
installed_apps_error_file=".rekov-installed-apps.err"
if ! bench --site "$PRESS_CONTROL_HOSTNAME" list-apps >"\$installed_apps_file" 2>"\$installed_apps_error_file"; then
  echo 'Could not read the installed Press applications.' >&2
  cat "\$installed_apps_error_file" >&2 || true
  exit 1
fi
# Read the output separately so a Bench failure is never reported as an
# absent app.  A previous run can have completed the web/systemd portion while
# the Press installation command was interrupted. Retrying that idempotent Bench
# operation is safe; dropping the site/database is not.
if ! awk '\$1 == "press" { found = 1 } END { exit !found }' "\$installed_apps_file"; then
  echo 'Installed apps reported by Bench:' >&2
  cat "\$installed_apps_file" >&2
  if [[ -f "\$install_marker" ]]; then
    echo 'Press is missing from an initialized control plane; retrying only install-app (no site or database deletion).' >&2
  fi
  bench --site "$PRESS_CONTROL_HOSTNAME" install-app press
  bench --site "$PRESS_CONTROL_HOSTNAME" list-apps | awk '\$1 == "press" { found = 1 } END { exit !found }' || {
    echo 'Press installation returned without registering the app.' >&2
    exit 1
  }
fi
rm -f "\$installed_apps_file"
rm -f "\$installed_apps_error_file"
# The control site is intentionally preserved across retries.  Keep its
# schema synchronized with the pinned Press source before the platform
# bootstrap touches fields added by newer Press revisions (for example
# App Release.deployable).
bench --site "$PRESS_CONTROL_HOSTNAME" migrate
bench use "$PRESS_CONTROL_HOSTNAME"
bench --site "$PRESS_CONTROL_HOSTNAME" clear-cache
bench --site "$PRESS_CONTROL_HOSTNAME" set-config developer_mode 0
EOF

# Bench's production wrapper has distro-specific provisioning side effects
# (Supervisor and a global pip install). Generate its systemd/nginx artefacts
# directly, then install only the generated units and nginx link ourselves.
as_frappe env PATH="/home/frappe/.local/bin:$PATH" bash -c "
  set -Eeuo pipefail
  cd '$bench_root'
  bench setup systemd --user frappe --yes
  # Ubuntu's nginx configuration does not define Bench's default main log
  # format. Keep Ubuntu's normal global access/error logs instead.
  bench setup nginx --yes --logging none
  bench config restart_systemd_on_update on
  bench config restart_supervisor_on_update off
"

bench_name="$(basename "$bench_root")"
shopt -s nullglob
systemd_units=("$bench_root"/config/systemd/*)
shopt -u nullglob
(( ${#systemd_units[@]} > 0 )) || { echo 'Bench did not generate systemd units.' >&2; exit 1; }
for unit in "${systemd_units[@]}"; do
  ln -sfn "$unit" "/etc/systemd/system/$(basename "$unit")"
done
ln -sfn "$bench_root/config/nginx.conf" "/etc/nginx/conf.d/${bench_name}.conf"
systemctl daemon-reload
# The bench target also starts private Redis instances. This control plane uses
# the already-running Ubuntu Redis at 127.0.0.1:6379, so enable web, workers,
# and the scheduler explicitly. The scheduler is what drains New Bench Queue;
# without it, the deploy can finish while the Bench remains queued forever.
systemctl enable --now \
  "${bench_name}-web.target" \
  "${bench_name}-workers.target" \
  "${bench_name}-frappe-schedule.service"
for unit in "${systemd_units[@]}"; do
  unit_name="$(basename "$unit")"
  # Bench emits template units such as worker@.service. They are definitions,
  # not runnable units; restarting one without an instance is invalid. The
  # concrete web/worker/scheduler units are already restarted by their native
  # Bench targets above.
  case "$unit_name" in
    *@.service) continue ;;
  esac
  systemctl restart "$unit_name"
done
nginx -t
systemctl enable --now nginx
systemctl reload-or-restart nginx

# bench setup production leaves a self-signed origin cert; Cloudflare Full (strict)
# needs a publicly trusted certificate on the origin (same model as ERP bootstrap).
press_host="$PRESS_CONTROL_HOSTNAME"
le_dir="/etc/letsencrypt/live/${press_host}"
if [[ ! -f "${le_dir}/fullchain.pem" ]]; then
  systemctl stop nginx
  if ! certbot certonly --standalone -d "$press_host" \
    --non-interactive --agree-tos --register-unsafely-without-email; then
    systemctl start nginx || true
    echo "Could not obtain a Let's Encrypt certificate for ${press_host}." >&2
    exit 1
  fi
  systemctl start nginx
fi
as_frappe env PATH="/home/frappe/.local/bin:$PATH" bash -c "
  set -Eeuo pipefail
  cd '$bench_root'
  bench --site '${press_host}' set-config ssl_certificate '${le_dir}/fullchain.pem'
  bench --site '${press_host}' set-config ssl_certificate_key '${le_dir}/privkey.pem'
  bench --site '${press_host}' set-config force_ssl 1
  bench setup nginx --yes --logging none
"
# This control plane is served only over HTTPS. Certbot can still use its
# standalone HTTP challenge while Nginx is stopped during certificate renewal.
# Bench may generate the HTTP server in either config/nginx.conf or a file in
# conf.d, so disable every plain-HTTP listener before restarting Nginx.
while IFS= read -r nginx_config; do
  sed -i -E \
    -e 's/^[[:space:]]*listen[[:space:]]+80([[:space:]]+[^;]+)?;/    listen 127.0.0.1:8080; # HTTP is local-only; HTTPS is served on 443;/' \
    -e 's/^[[:space:]]*listen[[:space:]]+\[::\]:80([[:space:]]+[^;]+)?;/    # IPv6 HTTP disabled; HTTPS is served on 443;/' \
    "${nginx_config}"
done < <(find -L "${bench_root}/config" /etc/nginx/conf.d /etc/nginx/sites-enabled \
  -type f -name '*.conf' -print 2>/dev/null | sort -u)
rm -f /etc/nginx/sites-enabled/default
cat >"/etc/nginx/conf.d/${bench_name}-ssl.conf" <<EOF
# HTTPS listener for the Press control plane. Bench's generated config on
# this Ubuntu image only creates the HTTP server block.
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${press_host};
    root ${bench_root}/sites;

    ssl_certificate ${le_dir}/fullchain.pem;
    ssl_certificate_key ${le_dir}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options nosniff;

    location /assets {
        try_files \$uri =404;
        add_header Cache-Control "max-age=31536000";
    }

    location /socket.io {
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Frappe-Site-Name ${press_host};
        proxy_set_header Origin \$scheme://\$http_host;
        proxy_set_header Host \$host;
        proxy_pass http://press-bench-socketio-server;
    }

    location / {
        try_files /${press_host}/public\$uri @press_webserver;
    }

    location @press_webserver {
        proxy_http_version 1.1;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Frappe-Site-Name ${press_host};
        proxy_set_header Host \$host;
        proxy_set_header X-Use-X-Accel-Redirect True;
        proxy_read_timeout 120;
        proxy_redirect off;
        proxy_pass http://press-bench-frappe;
    }
}
EOF
systemctl enable --now nginx
systemctl reload-or-restart nginx
install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
cat >/etc/letsencrypt/renewal-hooks/deploy/reload-nginx <<'EOF'
#!/usr/bin/env bash
systemctl reload nginx
EOF
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
systemctl enable --now certbot.timer
# Do not report a successful deployment while the origin is unreachable.
# Cloudflare returns 521 when Nginx is stopped or no longer owns HTTPS. The
# web worker can take a short moment to become ready after systemd restarts.
systemctl enable --now nginx
systemctl restart nginx
systemctl is-active --quiet nginx || {
  systemctl status nginx --no-pager >&2 || true
  journalctl -u nginx -n 80 --no-pager >&2 || true
  exit 1
}
ss -ltn '( sport = :443 )' >&2 || {
  echo 'Nginx is active but is not listening on port 443.' >&2
  exit 1
}
if ss -ltn '( sport = :80 )' | grep -q LISTEN; then
  echo 'Nginx is unexpectedly listening on plain HTTP port 80.' >&2
  nginx -T >&2 || true
  exit 1
fi
health_ok=0
for _ in $(seq 1 30); do
  if curl --fail --silent --show-error --insecure --max-time 15 \
    --resolve "${press_host}:443:127.0.0.1" \
    "https://${press_host}/api/method/ping" -o /dev/null; then
    health_ok=1
    break
  fi
  sleep 2
done
if (( health_ok == 0 )); then
  echo "Local HTTPS health check failed for ${press_host}." >&2
  curl --silent --show-error --insecure --max-time 10 --resolve "${press_host}:443:127.0.0.1" \
    -i "https://${press_host}/api/method/ping" | head -40 >&2 || true
  curl --silent --show-error --max-time 10 -H "Host: ${press_host}" \
    -i "http://127.0.0.1:8000/api/method/ping" | head -40 >&2 || true
  nginx -T >&2 || true
  exit 1
fi

# Press's tenant-facing wildcard certificate is used by the hybrid builder and
# Docker registry. It must be publicly trusted because these hostnames are
# reached through Cloudflare in Full (strict) mode.
cf_credentials=/root/.config/letsencrypt/cloudflare.ini
# Press validates this certificate as an RSA certificate and expects a 2048-bit
# private key. Keep the old certificate name untouched while migrating from the
# default Certbot ECDSA key to an explicitly requested RSA key.
origin_cert_name="${PRESS_ROOT_DOMAIN}-rsa"
origin_le_dir="/etc/letsencrypt/live/${origin_cert_name}"
install -d -m 0700 "$(dirname "$cf_credentials")"
printf 'dns_cloudflare_api_token = %s\n' "$PRESS_CLOUDFLARE_API_TOKEN" >"$cf_credentials"
chmod 0600 "$cf_credentials"
certbot certonly --dns-cloudflare --dns-cloudflare-credentials "$cf_credentials" \
  --cert-name "$origin_cert_name" --key-type rsa --rsa-key-size 2048 \
  --non-interactive --agree-tos \
  --register-unsafely-without-email --keep-until-expiring \
  -d "$PRESS_ROOT_DOMAIN" -d "*.${PRESS_ROOT_DOMAIN}"
[[ -s "$origin_le_dir/fullchain.pem" && -s "$origin_le_dir/privkey.pem" ]] || {
  echo "Wildcard certificate was not created for ${PRESS_ROOT_DOMAIN}." >&2
  exit 1
}
install -d -o frappe -g frappe -m 0750 /home/frappe/.config/rekov
install -o frappe -g frappe -m 0644 "$origin_le_dir/fullchain.pem" /home/frappe/.config/rekov/root-fullchain.pem
install -o frappe -g frappe -m 0600 "$origin_le_dir/privkey.pem" /home/frappe/.config/rekov/root-privkey.pem

touch "$bench_root/.rekov-press-control-complete"
chown frappe:frappe "$bench_root/.rekov-press-control-complete"
echo "Press control plane installed for $PRESS_CONTROL_HOSTNAME."
