#!/usr/bin/env bash
# Run as root on the OCI control VM.
# Required: PRESS_CONTROL_HOSTNAME, PRESS_ADMIN_PASSWORD, PRESS_DB_ROOT_PASSWORD.
set -Eeuo pipefail

: "${PRESS_CONTROL_HOSTNAME:?Set PRESS_CONTROL_HOSTNAME}"
: "${PRESS_ADMIN_PASSWORD:?Set PRESS_ADMIN_PASSWORD}"
: "${PRESS_DB_ROOT_PASSWORD:?Set PRESS_DB_ROOT_PASSWORD}"

press_revision="3890b928eecc2f0b08d084c40559ca5ebd7d1f64"
bench_root="/home/frappe/press-bench"
bench_python="python3"

as_frappe() {
  if command -v runuser >/dev/null 2>&1; then
    runuser -u frappe -- "$@"
  else
    sudo -u frappe "$@"
  fi
}

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y build-essential ca-certificates cron curl git libffi-dev libcups2-dev \
  libmariadb-dev libssl-dev mariadb-server nginx pkg-config redis-server sudo \
  python3-dev python3-pip python3-venv software-properties-common xvfb
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs
corepack enable || true

id frappe >/dev/null 2>&1 || useradd --create-home --shell /bin/bash frappe
if [[ -d "$bench_root" ]] && [[ ! -d "$bench_root/apps/frappe" ]]; then
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

as_frappe env PATH="$PATH" CI=1 BENCH_SUPPRESS_ROOT_WARNING=1 bash <<EOF
set -Eeuo pipefail
python3 -m pip install --user --break-system-packages frappe-bench
export PATH="\$HOME/.local/bin:\$PATH"
export CI=1
if [[ -d "$bench_root" ]] && [[ ! -d "$bench_root/apps/frappe" ]]; then
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
if [[ ! -d apps/press ]]; then
  bench get-app https://github.com/frappe/press.git
fi
press_remote="origin"
git -C apps/press remote get-url origin >/dev/null 2>&1 || press_remote="upstream"
git -C apps/press fetch --depth=1 "\$press_remote" "$press_revision"
git -C apps/press checkout --detach "$press_revision"
bench setup requirements
if [[ ! -f "sites/$PRESS_CONTROL_HOSTNAME/site_config.json" ]]; then
  bench new-site "$PRESS_CONTROL_HOSTNAME" \\
    --mariadb-root-username root \\
    --mariadb-root-password "$PRESS_DB_ROOT_PASSWORD" \\
    --admin-password "$PRESS_ADMIN_PASSWORD"
  bench --site "$PRESS_CONTROL_HOSTNAME" install-app press
fi
bench --site "$PRESS_CONTROL_HOSTNAME" set-config developer_mode 0
EOF

as_frappe env PATH="/home/frappe/.local/bin:$PATH" \
  bash -lc "cd '$bench_root' && bench setup production frappe"
echo "Press control plane installed for $PRESS_CONTROL_HOSTNAME."
