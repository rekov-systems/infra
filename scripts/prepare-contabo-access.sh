#!/usr/bin/env bash
set -Eeuo pipefail

: "${CONTABO_API_USER:?Missing Contabo API user}"
: "${CONTABO_API_PASSWORD:?Missing Contabo API password}"
: "${CONTABO_CLIENT_ID:?Missing Contabo API client ID}"
: "${CONTABO_CLIENT_SECRET:?Missing Contabo API client secret}"
: "${CONTABO_PRODUCT_ID:?Missing Contabo product ID}"
: "${CONTABO_REGION:?Missing Contabo region}"
: "${RUNNER_TEMP:?Missing RUNNER_TEMP}"
: "${GITHUB_ENV:?Missing GITHUB_ENV}"

api=https://api.contabo.com
auth=https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token
request_id() { cat /proc/sys/kernel/random/uuid; }
api_call() {
  local method=$1 path=$2 token=$3 body=${4:-}
  local args=(-fsS -X "$method" -H "Authorization: Bearer $token"
    -H "x-request-id: $(request_id)" -H 'Content-Type: application/json')
  if [[ -n "$body" ]]; then
    curl "${args[@]}" --data "$body" "$api$path"
  else
    curl "${args[@]}" "$api$path"
  fi
}

token="$(curl -fsS "$auth" \
  --data-urlencode "client_id=$CONTABO_CLIENT_ID" \
  --data-urlencode "client_secret=$CONTABO_CLIENT_SECRET" \
  --data-urlencode "username=$CONTABO_API_USER" \
  --data-urlencode "password=$CONTABO_API_PASSWORD" \
  --data-urlencode 'grant_type=password' | jq -er '.access_token')"
instances="$(curl -fsS -G "$api/v1/compute/instances" \
  -H "Authorization: Bearer $token" -H "x-request-id: $(request_id)" \
  --data-urlencode 'page=1' --data-urlencode 'size=100' \
  --data-urlencode 'ipConfig=true' --data-urlencode 'status=running' \
  --data-urlencode "productIds=$CONTABO_PRODUCT_ID" \
  --data-urlencode "region=$CONTABO_REGION")"

count="$(jq --arg product "$CONTABO_PRODUCT_ID" --arg region "$CONTABO_REGION" \
  '[.data[] | select(.productId == $product and .region == $region and .status == "running" and .ipConfig.v4.ip != null)] | length' <<<"$instances")"
if [[ "$count" != 1 ]]; then
  echo "Expected one running Contabo VPS for product $CONTABO_PRODUCT_ID in $CONTABO_REGION; found $count." >&2
  exit 1
fi
instance="$(jq -c --arg product "$CONTABO_PRODUCT_ID" --arg region "$CONTABO_REGION" \
  '.data[] | select(.productId == $product and .region == $region and .status == "running" and .ipConfig.v4.ip != null)' <<<"$instances")"
instance_id="$(jq -er '.instanceId' <<<"$instance")"
ip="$(jq -er '.ipConfig.v4.ip' <<<"$instance")"
user="$(jq -er '.defaultUser // "root"' <<<"$instance")"

key="$RUNNER_TEMP/contabo_key"
ssh-keygen -q -t ed25519 -N '' -C "rms-deploy-${GITHUB_RUN_ID:-manual}" -f "$key"
chmod 600 "$key"
password="Rms$(openssl rand -hex 12)!5"
ssh_secret_id=''
password_secret_id=''
cleanup() {
  [[ -z "$ssh_secret_id" ]] || api_call DELETE "/v1/secrets/$ssh_secret_id" "$token" >/dev/null 2>&1 || true
  [[ -z "$password_secret_id" ]] || api_call DELETE "/v1/secrets/$password_secret_id" "$token" >/dev/null 2>&1 || true
}
trap cleanup EXIT

ssh_secret="$(api_call POST /v1/secrets "$token" \
  "$(jq -cn --arg name "rms-deploy-${GITHUB_RUN_ID:-manual}-ssh" --rawfile value "$key.pub" '{name:$name,value:($value|rtrimstr("\n")),type:"ssh"}')")"
ssh_secret_id="$(jq -er '.data[0].secretId' <<<"$ssh_secret")"
password_secret="$(api_call POST /v1/secrets "$token" \
  "$(jq -cn --arg name "rms-deploy-${GITHUB_RUN_ID:-manual}-password" --arg value "$password" '{name:$name,value:$value,type:"password"}')")"
password_secret_id="$(jq -er '.data[0].secretId' <<<"$password_secret")"

body="$(jq -cn --argjson password "$password_secret_id" --argjson ssh "$ssh_secret_id" \
  '{rootPassword:$password,sshKeys:[$ssh]}')"
api_call POST "/v1/compute/instances/$instance_id/actions/resetPassword" "$token" "$body" >/dev/null

ready=false
for _ in $(seq 1 60); do
  if ssh -i "$key" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
    -o ConnectTimeout=5 -o IdentitiesOnly=yes "$user@$ip" true >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 5
done
if [[ "$ready" != true ]]; then
  echo "Contabo API accepted the temporary SSH key, but SSH did not become available." >&2
  exit 1
fi
{
  printf 'CONTABO_PUBLIC_IP=%s\n' "$ip"
  printf 'CONTABO_SSH_USER=%s\n' "$user"
  printf 'CONTABO_INSTANCE_ID=%s\n' "$instance_id"
} >>"$GITHUB_ENV"
