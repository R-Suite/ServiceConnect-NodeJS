#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/.."

docker compose -f "$ROOT/docker-compose.yml" up -d --wait
trap 'docker compose -f "$ROOT/docker-compose.yml" down' EXIT
cd "$HERE"
node --import tsx src/index.ts
