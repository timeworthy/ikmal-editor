#!/usr/bin/env bash
set -euo pipefail

docker compose -f docker-compose.adapters.yml run --rm adapter-matrix
printf '%s\n' 'Docker integration adapter matrix passed.'
