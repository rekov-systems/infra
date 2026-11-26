#!/usr/bin/env bash
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"
: "${DESK_HOSTNAME:?DESK_HOSTNAME is required}"

api="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/domains"
domains="$(curl --fail-with-body --silent --show-error \
  --get --data-urlencode "hostname=${DESK_HOSTNAME}" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  "$api")"

if ! jq -e '.success == true' >/dev/null <<<"$domains"; then
  echo "Cloudflare could not list Worker domains; the API token needs Workers metadata read access." >&2
  exit 1
fi

mapfile -t domain_ids < <(jq -r --arg host "$DESK_HOSTNAME" \
  '.result[]? | select(.hostname == $host) | .id' <<<"$domains")

if ((${#domain_ids[@]} == 0)); then
  echo "No Worker custom domain is attached to ${DESK_HOSTNAME}."
  exit 0
fi

if ((${#domain_ids[@]} > 1)); then
  echo "Cloudflare returned multiple Worker domains for ${DESK_HOSTNAME}; refusing an ambiguous detach." >&2
  exit 1
fi

detached="$(curl --fail-with-body --silent --show-error \
  -X DELETE -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  "${api}/${domain_ids[0]}")"
if ! jq -e '.success == true' >/dev/null <<<"$detached"; then
  echo "Cloudflare could not detach ${DESK_HOSTNAME}; the API token needs Workers Scripts Write or Workers Admin." >&2
  exit 1
fi

echo "Detached only the Worker custom-domain binding for ${DESK_HOSTNAME}; the Worker itself was not deleted."
