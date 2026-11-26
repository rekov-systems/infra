#!/usr/bin/env bash
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"
: "${CLOUDFLARE_ROOT_DOMAIN:?CLOUDFLARE_ROOT_DOMAIN is required}"

mode="${1:-all}"
if [[ "$mode" != all && "$mode" != detach && "$mode" != delete ]]; then
  echo "Usage: $0 [all|detach|delete]" >&2
  exit 2
fi

account_api="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}"
api="${account_api}/workers"
# Delete test services first: they may still hold service bindings to production
# services, and Cloudflare refuses to remove a referenced service.
workers=(desk-ops-dashboard-test desk-api-test desk-dashboard-test desk-ops-dashboard desk-api desk-dashboard)

response="$(curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" "${api}/domains?per_page=100")"
jq -e '.success == true' >/dev/null <<<"$response" || {
  echo "Cloudflare could not list Worker domains; token needs Workers metadata read." >&2
  exit 1
}
mapfile -t old_domains < <(jq -r --argjson workers "$(printf '%s\n' "${workers[@]}" | jq -R . | jq -s .)" \
  '.result[]? | select(.service as $s | $workers | index($s)) | [.id,.hostname] | @tsv' <<<"$response")
if [[ "$mode" != delete ]]; then
for item in "${old_domains[@]}"; do
  id="${item%%$'\t'*}"
  host="${item#*$'\t'}"
  detached="$(curl --fail-with-body --silent --show-error -X DELETE \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" "${api}/domains/${id}")"
  jq -e '.success == true' >/dev/null <<<"$detached" || {
    echo "Could not detach ${host}; Cloudflare response:" >&2
    jq -c '{success, errors, messages}' <<<"$detached" >&2
    exit 1
  }
  echo "Detached ${host} from its Desk Worker."
done
fi

[[ "$mode" == detach ]] && exit 0

queues_response="$(curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" "${account_api}/queues?per_page=100")"
jq -e '.success == true' >/dev/null <<<"$queues_response" || {
  echo "Could not list Cloudflare Queues before removing Desk consumers." >&2
  jq -c '{success, errors, messages}' <<<"$queues_response" >&2
  exit 1
}
queue_pages="$(jq -r '.result_info.total_pages // 1' <<<"$queues_response")"
queue_ids=()
for page in $(seq 1 "$queue_pages"); do
  if [[ "$page" == 1 ]]; then
    queue_page="$queues_response"
  else
    queue_page="$(curl --fail-with-body --silent --show-error \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      "${account_api}/queues?page=${page}&per_page=100")"
    jq -e '.success == true' >/dev/null <<<"$queue_page" || {
      echo "Could not enumerate Cloudflare Queue page ${page}." >&2
      jq -c '{success, errors, messages}' <<<"$queue_page" >&2
      exit 1
    }
  fi
  while IFS= read -r queue_id; do
    [[ -n "$queue_id" ]] && queue_ids+=("$queue_id")
  done < <(jq -r '.result[]?.queue_id // empty' <<<"$queue_page")
done
echo "Inspecting ${#queue_ids[@]} Cloudflare Queues for Desk consumers."
for queue_id in "${queue_ids[@]}"; do
  queue_response="$(curl --fail-with-body --silent --show-error \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    "${account_api}/queues/${queue_id}/consumers?per_page=100")"
  jq -e '.success == true' >/dev/null <<<"$queue_response" || {
    echo "Could not inspect a Cloudflare Queue before removing Desk consumers." >&2
    jq -c '{success, errors, messages}' <<<"$queue_response" >&2
    exit 1
  }
  mapfile -t queue_consumers < <(jq -r --argjson workers "$(printf '%s\n' "${workers[@]}" | jq -R . | jq -s .)" \
    '.result[]? | select(.script_name as $s | $workers | index($s)) | [.consumer_id,.script_name] | @tsv' \
    <<<"$queue_response")
  for consumer in "${queue_consumers[@]}"; do
    consumer_id="${consumer%%$'\t'*}"
    consumer_worker="${consumer#*$'\t'}"
    consumer_response="$(curl --fail-with-body --silent --show-error -X DELETE \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      "${account_api}/queues/${queue_id}/consumers/${consumer_id}")"
    jq -e '.success == true' >/dev/null <<<"$consumer_response" || {
      echo "Could not remove Desk Worker ${consumer_worker} from its Queue consumer." >&2
      jq -c '{success, errors, messages}' <<<"$consumer_response" >&2
      exit 1
    }
    echo "Removed Desk Worker ${consumer_worker} from its Queue consumer."
  done
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
    echo "Could not delete Desk Worker ${worker} (HTTP ${status}); Cloudflare response:" >&2
    if [[ -s "$response_file" ]]; then
      jq -c '{success, errors, messages}' "$response_file" >&2 || cat "$response_file" >&2
    fi
    rm -f "$response_file"
    exit 1
  fi
  rm -f "$response_file"
  echo "Deleted Desk Worker ${worker}."
done
