#!/usr/bin/env bash
set -Eeuo pipefail

for service in nginx supervisor mariadb mysql redis-server; do
  if systemctl is-active --quiet "$service"; then
    systemctl stop "$service"
  fi
  systemctl disable "$service" 2>/dev/null || true
done
while read -r unit; do
  [[ "$unit" =~ (pilot|press|frappe) ]] || continue
  systemctl disable --now "$unit" || true
done < <(systemctl list-unit-files --type=service --no-legend | awk '{print $1}')

rm -rf /home/frappe /home/ubuntu/pilot /home/ubuntu/.cache/pilot
rm -rf /var/lib/mysql /var/lib/redis
rm -rf /etc/nginx /etc/supervisor /var/log/nginx /var/log/frappe /var/log/pilot /var/log/supervisor
find /etc/systemd/system -maxdepth 2 -type f \
  \( -iname '*pilot*' -o -iname '*press*' -o -iname '*frappe*' \) -delete
userdel frappe 2>/dev/null || true
apt-get clean
systemctl daemon-reload
