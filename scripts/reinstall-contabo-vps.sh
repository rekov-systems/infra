#!/usr/bin/env bash
set -Eeuo pipefail
: "${CONTABO_API_USER:?Missing Contabo API user}"
: "${CONTABO_API_PASSWORD:?Missing Contabo API password}"
: "${CONTABO_CLIENT_ID:?Missing Contabo API client ID}"
: "${CONTABO_CLIENT_SECRET:?Missing Contabo API client secret}"
: "${CONTABO_PRODUCT_ID:?Missing Contabo product ID}"
: "${CONTABO_REGION:?Missing Contabo region}"
: "${CONTABO_ROOT_PASSWORD:?Missing Contabo root password}"
: "${CONTABO_SSH_PUBLIC_KEY:?Missing Contabo SSH public key}"
: "${RUNNER_TEMP:?Missing RUNNER_TEMP}"
: "${GITHUB_ENV:?Missing GITHUB_ENV}"
key="$RUNNER_TEMP/contabo_key"
test -s "$key" || { echo 'Persistent Contabo private key was not prepared.' >&2; exit 1; }

request_id() { cat /proc/sys/kernel/random/uuid; }
api=https://api.contabo.com
auth=https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token
api_call() {
  local method=$1 path=$2 token=$3 body=${4:-}
  local args=(-fsS -X "$method" -H "Authorization: Bearer $token"
    -H "x-request-id: $(request_id)" -H 'Content-Type: application/json')
  if [[ -n "$body" ]]; then curl "${args[@]}" --data "$body" "$api$path"
  else curl "${args[@]}" "$api$path"
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
instance_filter='.data[] | select(.productId == $product and .region == $region and .status == "running" and .ipConfig.v4.ip != null)'
count="$(jq --arg product "$CONTABO_PRODUCT_ID" --arg region "$CONTABO_REGION" \
  "[$instance_filter] | length" <<<"$instances")"
if [[ "$count" != 1 ]]; then
  echo "Refusing reinstall: expected one existing running VPS, found $count." >&2
  exit 1
fi
instance="$(jq -c --arg product "$CONTABO_PRODUCT_ID" --arg region "$CONTABO_REGION" \
  "$instance_filter" <<<"$instances")"
instance_id="$(jq -er '.instanceId' <<<"$instance")"
ip="$(jq -er '.ipConfig.v4.ip' <<<"$instance")"

images="$(curl -fsS -G "$api/v1/compute/images" \
  -H "Authorization: Bearer $token" -H "x-request-id: $(request_id)" \
  --data-urlencode 'page=1' --data-urlencode 'size=100' \
  --data-urlencode 'standardImage=true' --data-urlencode 'search=Ubuntu')"
image_count="$(jq '[.data[] | select(.standardImage == true and .osType == "Linux" and ((.name | ascii_downcase | contains("ubuntu")) and ((.name | contains("24.04")) or .version == "24.04")))] | length' <<<"$images")"
if [[ "$image_count" != 1 ]]; then
  echo "Refusing reinstall: expected one standard Ubuntu 24.04 image, found $image_count." >&2
  exit 1
fi
image_id="$(jq -er '.data[] | select(.standardImage == true and .osType == "Linux" and ((.name | ascii_downcase | contains("ubuntu")) and ((.name | contains("24.04")) or .version == "24.04"))) | .imageId' <<<"$images")"

ssh_secret_id=''
password_secret_id=''
cleanup() {
  [[ -z "$ssh_secret_id" ]] || api_call DELETE "/v1/secrets/$ssh_secret_id" "$token" >/dev/null 2>&1 || true
  [[ -z "$password_secret_id" ]] || api_call DELETE "/v1/secrets/$password_secret_id" "$token" >/dev/null 2>&1 || true
}
trap cleanup EXIT
ssh_secret="$(api_call POST /v1/secrets "$token" \
  "$(jq -cn --arg name "rms-reinstall-${GITHUB_RUN_ID:-manual}-ssh" --arg value "$CONTABO_SSH_PUBLIC_KEY" '{name:$name,value:$value,type:"ssh"}')")"
ssh_secret_id="$(jq -er '.data[0].secretId' <<<"$ssh_secret")"
password_secret="$(api_call POST /v1/secrets "$token" \
  "$(jq -cn --arg name "rms-reinstall-${GITHUB_RUN_ID:-manual}-password" --arg value "$CONTABO_ROOT_PASSWORD" '{name:$name,value:$value,type:"password"}')")"
password_secret_id="$(jq -er '.data[0].secretId' <<<"$password_secret")"
body="$(jq -cn --arg image "$image_id" --argjson password "$password_secret_id" \
  --argjson ssh "$ssh_secret_id" \
  '{imageId:$image,rootPassword:$password,sshKeys:[$ssh],defaultUser:"root"}')"
api_call PUT "/v1/compute/instances/$instance_id" "$token" "$body" >/dev/null

ssh-keygen -R "$ip" >/dev/null 2>&1 || true
ready=false
for _ in $(seq 1 50); do
  if ssh -i "$key" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
    -o IdentitiesOnly=yes -o ConnectTimeout=3 "root@$ip" true >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 5
done
if [[ "$ready" != true ]]; then
  echo 'Contabo accepted the reinstall request, but SSH did not become ready in time.' >&2
  exit 1
fi
ssh -i "$key" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
  -o IdentitiesOnly=yes "root@$ip" 'cloud-init status --wait'
{
  printf 'CONTABO_PUBLIC_IP=%s\n' "$ip"
  printf 'CONTABO_SSH_USER=root\n'
  printf 'CONTABO_INSTANCE_ID=%s\n' "$instance_id"
} >>"$GITHUB_ENV"
echo "Reinstalled existing Contabo instance $instance_id with standard Ubuntu 24.04."
