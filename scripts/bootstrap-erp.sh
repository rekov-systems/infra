#!/usr/bin/env bash
set -Eeuo pipefail
hostname="$1"
app_dir=/opt/rekov/erpnext

if ! command -v docker >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y ca-certificates certbot curl gnupg nginx openssl
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" >/etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
else
  apt-get update -y
  apt-get install -y certbot nginx openssl
fi

install -d -m 0755 "$app_dir"
cp -a /tmp/rekov/erpnext/. "$app_dir/"
chmod 600 "$app_dir/.env"

echo 'vm.overcommit_memory=1' >/etc/sysctl.d/99-rekov-redis.conf
sysctl --system >/dev/null

# Oracle's Ubuntu image has an iptables INPUT catch-all reject and permits only
# SSH by default. Nginx can be listening correctly while 80/443 remain
# unreachable from Cloudflare unless these rules are installed before it.
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

install -d -m 0755 /etc/nginx/rekov
install -d -m 0755 /var/www/letsencrypt
if [[ ! -f /etc/nginx/rekov/origin.crt ]]; then
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/nginx/rekov/origin.key -out /etc/nginx/rekov/origin.crt \
    -subj "/CN=$hostname"
fi
cat >/etc/nginx/sites-available/rekov <<EOF
server {
  listen 80 default_server;
  server_name _;
  location ^~ /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
  location / { return 444; }
}
server {
  listen 443 ssl http2 default_server;
  server_name _;
  ssl_certificate /etc/nginx/rekov/origin.crt;
  ssl_certificate_key /etc/nginx/rekov/origin.key;
  return 444;
}
server {
  listen 80;
  server_name $hostname;
  location = /healthz { access_log off; return 200 "ok\\n"; }
  location ^~ /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
  location / { return 301 https://\$host\$request_uri; }
}
server {
  listen 443 ssl http2;
  server_name $hostname;
  ssl_certificate /etc/nginx/rekov/origin.crt;
  ssl_certificate_key /etc/nginx/rekov/origin.key;
  ssl_protocols TLSv1.2 TLSv1.3;
  client_max_body_size 50m;
  location = /healthz { access_log off; return 200 "ok\\n"; }
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 120s;
  }
}
EOF
rm -f /etc/nginx/sites-enabled/default
# Remove the reverse-proxy file produced by the previous bootstrap. Keeping it
# creates two `default_server` declarations and makes nginx refuse to start.
rm -f /etc/nginx/conf.d/rekov-edge.conf
ln -sfn /etc/nginx/sites-available/rekov /etc/nginx/sites-enabled/rekov
nginx -t
systemctl enable --now nginx
systemctl reload nginx

# Full (strict) makes Cloudflare verify the certificate served by Nginx. Start
# with the local certificate above so Nginx can answer HTTP-01, then replace it
# with a public certificate trusted by Cloudflare. The domain stays proxied.
if ! certbot certonly --webroot --webroot-path /var/www/letsencrypt \
  --domain "$hostname" --non-interactive --agree-tos \
  --register-unsafely-without-email; then
  echo "Could not obtain a Let's Encrypt certificate for $hostname." >&2
  exit 1
fi
sed -i \
  -e "s|ssl_certificate /etc/nginx/rekov/origin.crt;|ssl_certificate /etc/letsencrypt/live/$hostname/fullchain.pem;|" \
  -e "s|ssl_certificate_key /etc/nginx/rekov/origin.key;|ssl_certificate_key /etc/letsencrypt/live/$hostname/privkey.pem;|" \
  /etc/nginx/sites-available/rekov
install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
cat >/etc/letsencrypt/renewal-hooks/deploy/reload-nginx <<'EOF'
#!/usr/bin/env bash
systemctl reload nginx
EOF
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
systemctl enable --now certbot.timer
nginx -t
systemctl reload nginx

# This management command lives on the host, not in the ERPNext image. Every
# tenant is a Frappe site with its own database, files, users, and TLS vhost.
cat >/usr/local/sbin/rekov-tenant <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail

base_domain='${hostname#*.}'
app_dir='$app_dir'
reserved='admin api app www mail ftp erp'

usage() {
  echo "Usage: rekov-tenant {create|list|enable|disable} [slug] [admin-password]" >&2
  exit 2
}

site_for_slug() {
  local slug="\$1"
  [[ "\$slug" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\$ ]] || {
    echo 'Tenant slug must contain lowercase letters, numbers, and internal hyphens.' >&2; exit 2;
  }
  for name in \$reserved; do
    [[ "\$slug" != "\$name" ]] || { echo "Reserved tenant slug: \$slug" >&2; exit 2; }
  done
  printf '%s.%s' "\$slug" "\$base_domain"
}

write_vhost() {
  local site="\$1" config="/etc/nginx/sites-available/rekov-tenant-\$1"
  cat >"\$config" <<NGINX
server {
  listen 80;
  server_name \$site;
  location ^~ /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
  location / { return 301 https://\\\$host\\\$request_uri; }
}
server {
  listen 443 ssl http2;
  server_name \$site;
  ssl_certificate /etc/letsencrypt/live/\$site/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/\$site/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  client_max_body_size 50m;
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host \\\$host;
    proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade \\\$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 120s;
  }
}
NGINX
  ln -sfn "\$config" "/etc/nginx/sites-enabled/rekov-tenant-\$1"
  nginx -t && systemctl reload nginx
}

case "\${1:-}" in
  list)
    find "\$app_dir/sites" -mindepth 2 -maxdepth 2 -name site_config.json -printf '%h\\n' | xargs -r -n1 basename | sort
    ;;
  create)
    [[ \$# -ge 2 ]] || usage
    slug="\$2"; site="\$(site_for_slug "\$slug")"
    [[ ! -d "\$app_dir/sites/\$site" ]] || { echo "Tenant already exists: \$site" >&2; exit 1; }
    password_supplied=false
    if [[ \${3+x} ]]; then password="\$3"; password_supplied=true; else password="\$(openssl rand -base64 24)"; fi
    cd "\$app_dir"
    docker compose run --rm --no-deps --entrypoint bash \\
      -e SITE_NAME="\$site" -e SITE_ADMIN_PASSWORD="\$password" backend -lc '
        until (echo > /dev/tcp/db/3306) >/dev/null 2>&1; do sleep 2; done
        bench new-site "\$SITE_NAME" --no-mariadb-socket --mariadb-user-host-login-scope="%" \\
          --admin-password="\$SITE_ADMIN_PASSWORD" --db-root-username=root \\
          --db-root-password="\$MYSQL_ROOT_PASSWORD" --install-app erpnext
      '
    certbot certonly --webroot --webroot-path /var/www/letsencrypt --domain "\$site" \\
      --non-interactive --agree-tos --register-unsafely-without-email
    write_vhost "\$site"
    echo "Tenant created: https://\$site"
    echo 'Login: Administrator'
    if [[ "\$password_supplied" == true ]]; then
      echo 'Password: supplied by operator (not printed)'
    else
      echo "Password (save now; it is not stored in plaintext): \$password"
    fi
    ;;
  enable)
    [[ \$# -eq 2 ]] || usage
    slug="\$2"; site="\$(site_for_slug "\$slug")"
    [[ -f "/etc/nginx/sites-available/rekov-tenant-\$site" ]] || { echo "Unknown tenant: \$site" >&2; exit 1; }
    ln -sfn "/etc/nginx/sites-available/rekov-tenant-\$site" "/etc/nginx/sites-enabled/rekov-tenant-\$site"
    nginx -t && systemctl reload nginx
    ;;
  disable)
    [[ \$# -eq 2 ]] || usage
    slug="\$2"; site="\$(site_for_slug "\$slug")"
    rm -f "/etc/nginx/sites-enabled/rekov-tenant-\$site"
    nginx -t && systemctl reload nginx
    ;;
  *) usage ;;
esac
EOF
chmod 0750 /usr/local/sbin/rekov-tenant

cd "$app_dir"
docker compose config -q
docker compose pull
if ! docker compose up -d --remove-orphans; then
  docker compose ps || true
  docker compose logs --no-color --tail=300 || true
  exit 1
fi
healthy=false
for attempt in $(seq 1 60); do
  # Frappe resolves the tenant from Host.  Testing with 127.0.0.1 makes a
  # healthy frontend report 500 because that is not the configured site.
  if curl --fail --silent --header "Host: $hostname" \
    http://127.0.0.1:8080/api/method/ping >/dev/null; then
    healthy=true
    break
  fi
  if (( attempt % 3 == 0 )); then
    echo "Waiting for ERPNext health check (${attempt}/60)"
  fi
  sleep 10
done
if [[ "$healthy" != true ]]; then
  echo "ERPNext did not become healthy; diagnostics follow." >&2
  docker compose ps || true
  docker compose logs --no-color --tail=300 || true
  curl --include --header "Host: $hostname" http://127.0.0.1:8080/api/method/ping || true
  exit 1
fi
curl --fail --show-error --header "Host: $hostname" http://127.0.0.1:8080/api/method/ping
docker compose ps
docker container prune -f
docker image prune -af
docker builder prune -af
