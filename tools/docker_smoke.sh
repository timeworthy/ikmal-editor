#!/usr/bin/env bash
set -euo pipefail

compose=(docker compose -f docker-compose.test.yml)
cleanup() {
  "${compose[@]}" down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${compose[@]}" up -d --build
curl --fail --silent http://127.0.0.1:8098/health >/dev/null
curl --fail --silent http://127.0.0.1:8096/health >/dev/null

response="$(curl --fail --silent --data-urlencode 'text=Plants produces its own food.' --data-urlencode 'language=en-US' http://127.0.0.1:8096/v2/check)"
printf '%s\n' "$response" | grep -q 'pronoun-antecedent\|subject-verb\|quality-sidecar'
printf '%s\n' 'Docker quality/proxy lifecycle smoke test passed.'
