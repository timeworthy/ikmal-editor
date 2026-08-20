#!/usr/bin/env bash
set -euo pipefail

compose=(docker compose -f docker-compose.test.yml)
cleanup() {
  "${compose[@]}" down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${compose[@]}" up -d --build

# Do not probe the published host ports here. A developer may already have an
# ikmal process (or another service) listening on 8096/8098; on macOS the
# container VM can then still report a successful port publication while a
# host curl reaches the unrelated process. Probing from inside each service
# proves that the containers we just created are the ones that are healthy.
quality_ready=0
proxy_ready=0
for ((attempt = 0; attempt < 30; attempt += 1)); do
  if [[ "$quality_ready" -eq 0 ]] && "${compose[@]}" exec -T quality curl --fail --silent http://127.0.0.1:8098/health >/dev/null 2>&1; then
    quality_ready=1
  fi
  if [[ "$proxy_ready" -eq 0 ]] && "${compose[@]}" exec -T proxy curl --fail --silent http://127.0.0.1:8096/health >/dev/null 2>&1; then
    proxy_ready=1
  fi
  if [[ "$quality_ready" -eq 1 && "$proxy_ready" -eq 1 ]]; then
    break
  fi
  sleep 1
done
[[ "$quality_ready" -eq 1 ]] || { echo 'Quality container did not become healthy.' >&2; exit 1; }
[[ "$proxy_ready" -eq 1 ]] || { echo 'Proxy container did not become healthy.' >&2; exit 1; }

response="$("${compose[@]}" exec -T proxy curl --fail --silent --data-urlencode 'text=Plants produces its own food.' --data-urlencode 'language=en-US' http://127.0.0.1:8096/v2/check)"
printf '%s\n' "$response" | grep -q 'pronoun-antecedent\|subject-verb\|quality-sidecar'
printf '%s\n' 'Docker quality/proxy lifecycle smoke test passed.'
