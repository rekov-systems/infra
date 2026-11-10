#!/usr/bin/env bash
# Run as root on the OCI control VM.
# Required: PRESS_CONTROL_HOSTNAME, PRESS_ADMIN_PASSWORD, PRESS_DB_ROOT_PASSWORD.
set -Eeuo pipefail

: "${PRESS_CONTROL_HOSTNAME:?Set PRESS_CONTROL_HOSTNAME}"
: "${PRESS_ADMIN_PASSWORD:?Set PRESS_ADMIN_PASSWORD}"
: "${PRESS_DB_ROOT_PASSWORD:?Set PRESS_DB_ROOT_PASSWORD}"

# These two revisions are a compatibility unit.  Do not replace either with a
# moving branch: Press still imports ``init_telemetry`` and Frappe removed that
# compatibility export after this revision.
press_revision="3890b928eecc2f0b08d084c40559ca5ebd7d1f64"
frappe_revision="629c997393dd4e72f69bcb2dc0fde8907cddc6a4"
bench_root="/home/frappe/press-bench"
bench_python="/usr/bin/python3.14"

bench_env_python_ok() {
  local venv_py="$bench_root/env/bin/python"
  [[ -x "$venv_py" ]] || return 1
  "$venv_py" -c 'import sys; sys.exit(0 if sys.version_info[:2] == (3, 14) else 1)' 2>/dev/null
}

as_frappe() {
  if command -v runuser >/dev/null 2>&1; then
    runuser -u frappe -w /home/frappe -- "$@"
  else
    sudo -u frappe -H -- "$@"
  fi
}

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ansible build-essential ca-certificates certbot cron curl fail2ban git golang-go libffi-dev libcups2-dev \
  libmariadb-dev libssl-dev mariadb-server nginx pkg-config redis-server sudo \
  python3-dev python3-pip python3-venv software-properties-common xvfb
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs
corepack enable || true
add-apt-repository -y ppa:deadsnakes/ppa
apt-get update
apt-get install -y python3.14 python3.14-dev python3.14-venv
bench_python="$(command -v python3.14)"

id frappe >/dev/null 2>&1 || useradd --create-home --shell /bin/bash frappe
install -d -o frappe -g frappe /home/frappe
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
if [[ ! -d "$bench_root/apps/frappe" ]]; then
  rm -rf "$bench_root"
elif [[ -x "$bench_root/env/bin/python" ]] && ! "$bench_root/env/bin/python" -c 'import sys; sys.exit(0 if sys.version_info[:2] == (3, 14) else 1)' 2>/dev/null; then
  rm -rf "$bench_root"
fi
if [[ ! -d "$bench_root/apps/frappe" ]]; then
  if ! bench init --frappe-branch version-16 --python "$bench_python" "$bench_root" <<< 'n'; then
    rm -rf "$bench_root"
    echo 'bench init failed.' >&2
    exit 1
  fi
fi
cd "$bench_root"
git config --global --add safe.directory "$bench_root"
git config --global --add safe.directory "$bench_root/apps/frappe"
git config --global --add safe.directory "$bench_root/apps/press"
# ``version-16`` is a moving target.  Pin Frappe before installing Press so
# every run uses the same API surface as the pinned Press revision.
if git -C apps/frappe remote get-url origin >/dev/null 2>&1; then
  git -C apps/frappe remote set-url origin https://github.com/frappe/frappe.git
else
  git -C apps/frappe remote add origin https://github.com/frappe/frappe.git
fi
git -C apps/frappe fetch --depth=1 origin "$frappe_revision"
git -C apps/frappe checkout --detach "$frappe_revision"
if ! ./env/bin/python -c 'from frappe.utils.telemetry import init_telemetry'; then
  echo 'Pinned Frappe revision does not provide Press-required init_telemetry.' >&2
  exit 1
fi
if [[ ! -d apps/press/.git ]]; then
  git clone https://github.com/frappe/press.git apps/press
fi
if git -C apps/press remote get-url origin >/dev/null 2>&1; then
  git -C apps/press remote set-url origin https://github.com/frappe/press.git
else
  git -C apps/press remote add origin https://github.com/frappe/press.git
fi
git -C apps/press fetch --depth=1 origin "$press_revision"
git -C apps/press checkout --detach "$press_revision"
grep -qxF press apps.txt 2>/dev/null || echo press >>apps.txt
patch_press_for_python314() {
  local f=apps/press/pyproject.toml
  [[ -f "\$f" ]] || { echo "missing \$f" >&2; return 1; }
  # Press pins pre-3.14 stacks; vendor six.* and old builds fail on CPython 3.14/aarch64.
  sed -i \
    -e 's/ansible==3.4.0/ansible>=10.0.0,<15/' \
    -e 's/playwright==1.49.1/playwright>=1.50.0/' \
    -e 's/stripe~=2.56.0/stripe>=10.0.0,<13/' \
    -e '/frappe-mcp @ git+https:\/\/github.com\/frappe\/mcp/d' \
    -e '/types-stripe/d' \
    "\$f"
}
patch_press_typeddict_for_python314() {
  local f=apps/press/press/press/doctype/deploy_candidate/cache_utils.py
  [[ -f "\$f" ]] || return 0
  grep -q 'cwd=str,' "\$f" || return 0
  python3.14 - "\$f" <<'PY'
import sys
from pathlib import Path

p = Path(sys.argv[1])
text = p.read_text()
old = (
    'CommandOutput = TypedDict(\n'
    '\t"CommandOutput",\n'
    '\tcwd=str,\n'
    '\timage_tag=str,\n'
    '\treturncode=int,\n'
    '\toutput=str,\n'
    ')'
)
new = (
    'CommandOutput = TypedDict(\n'
    '\t"CommandOutput",\n'
    '\t{\n'
    '\t\t"cwd": str,\n'
    '\t\t"image_tag": str,\n'
    '\t\t"returncode": int,\n'
    '\t\t"output": str,\n'
    '\t},\n'
    ')'
)
if old not in text:
    if '"cwd": str' in text:
        sys.exit(0)
    print('unexpected TypedDict in deploy_candidate/cache_utils.py', file=sys.stderr)
    sys.exit(1)
p.write_text(text.replace(old, new, 1))
PY
}
patch_press_for_python314
patch_press_typeddict_for_python314
export PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1
bench setup requirements
uv pip install --python ./env/bin/python 'ansible>=10.0.0,<15' 'stripe>=10.0.0,<13' --upgrade
# pyOpenSSL 25.x breaks when uv pulls cryptography 45+ (TLS DocTypes use OpenSSL.crypto).
uv pip install --python ./env/bin/python 'cryptography>=44.0.1,<45' 'pyOpenSSL>=25.0.0,<26'
# Dropped from pyproject only to avoid uv building pydantic-core; Press still imports it at runtime.
# frappe-mcp pins pydantic~=2.11.7 (core 2.33.2 has no cp314 wheels); use a matched pair with wheels.
uv pip install --python ./env/bin/python 'pydantic==2.12.5' 'pydantic-core==2.41.5'
uv pip install --python ./env/bin/python \
  'Werkzeug==3.1.3' 'jsonschema>=4.24.0,<5' 'Click>=8.1.8,<9'
uv pip install --python ./env/bin/python --no-deps 'frappe-mcp @ git+https://github.com/frappe/mcp'
if ! ./env/bin/python -c '
from ansible import constants, context
from ansible.executor.playbook_executor import PlaybookExecutor
import stripe
from OpenSSL import SSL, crypto
import frappe_mcp
'; then
  echo "Press dependency preflight failed (ansible/stripe/pyOpenSSL/frappe_mcp on Python 3.14)." >&2
  exit 1
fi
if ! systemctl is-active --quiet redis-server; then
  echo 'The system Redis service is not running.' >&2
  exit 1
fi
# This control plane deliberately uses Ubuntu's managed Redis, not the
# development Redis processes (ports 11000/13000) generated by bench init.
bench set-config -g redis_cache 'redis://127.0.0.1:6379'
bench set-config -g redis_queue 'redis://127.0.0.1:6379'
bench set-config -g redis_socketio 'redis://127.0.0.1:6379'
# These are Bench's common-config commands (not Frappe's `set-config`
# command).  Press must use native systemd units, never Supervisor.
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
    --mariadb-root-username root \\
    --mariadb-root-password "$PRESS_DB_ROOT_PASSWORD" \\
    --admin-password "$PRESS_ADMIN_PASSWORD"
fi
if ! bench --site "$PRESS_CONTROL_HOSTNAME" list-apps 2>/dev/null | grep -qxF press; then
  if [[ -f "\$install_marker" ]]; then
    echo 'Press is absent from an already initialized control plane; refusing destructive recovery.' >&2
    exit 1
  fi
  uv pip install --python ./env/bin/python 'cryptography>=44.0.1,<45' 'pyOpenSSL>=25.0.0,<26'
  uv pip install --python ./env/bin/python 'pydantic==2.12.5' 'pydantic-core==2.41.5'
  uv pip install --python ./env/bin/python \
    'Werkzeug==3.1.3' 'jsonschema>=4.24.0,<5' 'Click>=8.1.8,<9'
  uv pip install --python ./env/bin/python --no-deps 'frappe-mcp @ git+https://github.com/frappe/mcp'
  bench --site "$PRESS_CONTROL_HOSTNAME" install-app press
fi
bench --site "$PRESS_CONTROL_HOSTNAME" set-config developer_mode 0
EOF

# Bench's production wrapper has distro-specific provisioning side effects
# (Supervisor and a global pip install). Generate its systemd/nginx artefacts
# directly, then install only the generated units and nginx link ourselves.
as_frappe env PATH="/home/frappe/.local/bin:$PATH" bash -c "
  set -Eeuo pipefail
  cd '$bench_root'
  bench setup systemd --user frappe --yes
  bench setup nginx --yes
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
# the already-running Ubuntu Redis at 127.0.0.1:6379, so enable only web and
# worker units.
systemctl enable --now "${bench_name}-web.target" "${bench_name}-workers.target"
nginx -t
systemctl reload nginx

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
  bench setup nginx --yes
"
systemctl enable --now nginx
systemctl reload nginx
install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
cat >/etc/letsencrypt/renewal-hooks/deploy/reload-nginx <<'EOF'
#!/usr/bin/env bash
systemctl reload nginx
EOF
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
systemctl enable --now certbot.timer
touch "$bench_root/.rekov-press-control-complete"
chown frappe:frappe "$bench_root/.rekov-press-control-complete"
echo "Press control plane installed for $PRESS_CONTROL_HOSTNAME."
