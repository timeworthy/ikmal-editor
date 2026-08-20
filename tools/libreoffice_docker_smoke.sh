#!/usr/bin/env bash
set -euo pipefail

docker compose -f docker-compose.libreoffice.yml run --build --rm libreoffice-matrix
echo "Docker LibreOffice UNO matrix passed."
