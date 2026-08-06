#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
requested="${IKMAL_CONTAINER_RUNTIME:-auto}"

apple_container_ready() {
  [[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]] || return 1
  command -v container >/dev/null 2>&1 || return 1
  container system status >/dev/null 2>&1
}

docker_ready() {
  command -v docker >/dev/null 2>&1 || return 1
  docker compose version >/dev/null 2>&1
  docker info >/dev/null 2>&1
}

run_unavailable() {
  if [[ "${IKMAL_SMOKE_REQUIRED:-0}" == "1" ]]; then
    echo "No usable container runtime is available. Install Apple container or Docker, or set IKMAL_CONTAINER_RUNTIME=none to skip intentionally." >&2
    exit 2
  fi
  echo "No usable container runtime is available; container smoke test skipped. Run with IKMAL_SMOKE_REQUIRED=1 to make this an error."
}

case "$requested" in
  none)
    echo "Container smoke test disabled with IKMAL_CONTAINER_RUNTIME=none."
    exit 0
    ;;
  apple)
    if ! apple_container_ready; then
      echo "Apple container was requested but is not ready. On supported Apple Silicon/macOS systems, install it and run: container system start" >&2
      exit 2
    fi
    exec "$ROOT_DIR/tools/apple_container_smoke.sh"
    ;;
  docker)
    if ! docker_ready; then
      echo "Docker was requested but 'docker compose' is unavailable." >&2
      exit 2
    fi
    exec "$ROOT_DIR/tools/docker_smoke.sh"
    ;;
  auto)
    if apple_container_ready; then
      exec "$ROOT_DIR/tools/apple_container_smoke.sh"
    elif docker_ready; then
      exec "$ROOT_DIR/tools/docker_smoke.sh"
    else
      run_unavailable
    fi
    ;;
  *)
    echo "Unknown IKMAL_CONTAINER_RUNTIME '$requested'; use auto, apple, docker, or none." >&2
    exit 2
    ;;
esac
