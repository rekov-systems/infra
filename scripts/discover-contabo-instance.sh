#!/usr/bin/env bash
set -Eeuo pipefail
: "${CONTABO_API_USER:?Missing Contabo API user}"
: "${CONTABO_API_PASSWORD:?Missing Contabo API password}"
: "${CONTABO_CLIENT_ID:?Missing Contabo API client ID}"
: "${CONTABO_CLIENT_SECRET:?Missing Contabo API client secret}"
: "${CONTABO_PRODUCT_ID:?Missing Contabo product ID}"
: "${CONTABO_REGION:?Missing Contabo region}"
: "${GITHUB_ENV:?Missing GITHUB_ENV}"

request_id() { cat /proc/sys/kernel/random/uuid; }
auth='https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token'
api='https://api.contabo.com'
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
filter='.data[] | select(.productId == $product and .region == $region and .status == "running" and .ipConfig.v4.ip != null)'
count="$(jq --arg product "$CONTABO_PRODUCT_ID" --arg region "$CONTABO_REGION" \
  "[$filter] | length" <<<"$instances")"
if [[ "$count" != 1 ]]; then
  echo "Expected one running Contabo VPS for product $CONTABO_PRODUCT_ID in $CONTABO_REGION; found $count." >&2
  exit 1
fi
instance="$(jq -c --arg product "$CONTABO_PRODUCT_ID" --arg region "$CONTABO_REGION" \
  "$filter" <<<"$instances")"
{
  printf 'CONTABO_PUBLIC_IP=%s\n' "$(jq -er '.ipConfig.v4.ip' <<<"$instance")"
  printf 'CONTABO_SSH_USER=%s\n' "$(jq -er '.defaultUser // "root"' <<<"$instance")"
  printf 'CONTABO_INSTANCE_ID=%s\n' "$(jq -er '.instanceId' <<<"$instance")"
} >>"$GITHUB_ENV"
