#!/usr/bin/env bash
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"
: "${CLOUDFLARE_ROOT_DOMAIN:?CLOUDFLARE_ROOT_DOMAIN is required}"

api="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers"
workers=(desk-dashboard desk-api desk-ops-dashboard desk-dashboard-test desk-api-test desk-ops-dashboard-test)

response="$(curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" "${api}/domains?per_page=100")"
jq -e '.success == true' >/dev/null <<<"$response" || {
  echo "Cloudflare could not list Worker domains; token needs Workers metadata read." >&2
  exit 1
}
mapfile -t old_domains < <(jq -r --argjson workers "$(printf '%s\n' "${workers[@]}" | jq -R . | jq -s .)" \
  '.result[]? | select(.service as $s | $workers | index($s)) | [.id,.hostname] | @tsv' <<<"$response")
for item in "${old_domains[@]}"; do
  id="${item%%$'\t'*}"
  host="${item#*$'\t'}"
  detached="$(curl --fail-with-body --silent --show-error -X DELETE \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" "${api}/domains/${id}")"
  jq -e '.success == true' >/dev/null <<<"$detached" || {
    echo "Could not detach ${host}; Cloudflare response:" >&2
    jq -r '(.errors // [])[] | "code=\(.code // "unknown") message=\(.message // "unknown")"' <<<"$detached" >&2
    exit 1
  }
  echo "Detached ${host} from its Desk Worker."
done

for worker in "${workers[@]}"; do
  response_file="$(mktemp)"
  status="$(curl --silent --show-error -o "$response_file" -w '%{http_code}' \
    -X DELETE -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    "${api}/scripts/${worker}")"
  if [[ "$status" == 404 ]]; then
    rm -f "$response_file"
    echo "Worker ${worker} was already absent."
    continue
  fi
  if [[ "$status" != 2* ]] || { [[ -s "$response_file" ]] && ! jq -e '.success == true' "$response_file" >/dev/null; }; then
    rm -f "$response_file"
    echo "Could not delete Desk Worker ${worker}; token needs Workers Scripts Write or Workers Admin." >&2
    exit 1
  fi
  rm -f "$response_file"
  echo "Deleted Desk Worker ${worker}."
done
