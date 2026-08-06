#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
container_cmd="${IKMAL_APPLE_CONTAINER_BIN:-container}"
suffix="${IKMAL_SMOKE_ID:-$$}"
image="ikmal-editor-smoke:${suffix}"
network="ikmal-editor-smoke-${suffix}"
quality_name="ikmal-editor-quality-${suffix}"
proxy_name="ikmal-editor-proxy-${suffix}"

cleanup() {
  "$container_cmd" delete --force "$proxy_name" "$quality_name" >/dev/null 2>&1 || true
  "$container_cmd" network delete "$network" >/dev/null 2>&1 || true
  "$container_cmd" image delete --force "$image" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! command -v "$container_cmd" >/dev/null 2>&1; then
  echo "Apple container CLI not found: $container_cmd" >&2
  exit 2
fi
if ! "$container_cmd" system status >/dev/null 2>&1; then
  echo "Apple container services are not running. Start them with: container system start" >&2
  exit 2
fi

"$container_cmd" build --progress plain -t "$image" "$ROOT_DIR"
"$container_cmd" network create "$network" >/dev/null

"$container_cmd" run -d --name "$quality_name" --network "$network" \
  -e IKMAL_BIND_HOST=0.0.0.0 \
  -e IKMAL_QUALITY_PORT=8098 \
  "$image" --quality-server >/dev/null

"$container_cmd" run -d --name "$proxy_name" --network "$network" \
  -e IKMAL_BIND_HOST=0.0.0.0 \
  -e IKMAL_QUALITY_PROXY_PORT=8096 \
  -e IKMAL_LANGUAGETOOL_URL=http://127.0.0.1:8097/v2/check \
  -e IKMAL_QUALITY_URL="http://${quality_name}:8098/v1/analyze" \
  -p 8096:8096 \
  "$image" --quality-proxy >/dev/null

for attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:8098/health >/dev/null 2>&1 && \
     curl --fail --silent http://127.0.0.1:8096/health >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" == "30" ]]; then
    echo "Apple container services did not become healthy." >&2
    "$container_cmd" logs "$quality_name" || true
    "$container_cmd" logs "$proxy_name" || true
    exit 1
  fi
  sleep 1
done

response="$(curl --fail --silent \
  --data-urlencode 'text=Plants produces its own food.' \
  --data-urlencode 'language=en-US' \
  http://127.0.0.1:8096/v2/check)"
printf '%s\n' "$response" | grep -q 'pronoun-antecedent\|subject-verb\|quality-sidecar'
printf '%s\n' 'Apple container quality/proxy lifecycle smoke test passed.'
