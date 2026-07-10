#!/usr/bin/env bash
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
EXAMPLES=(
  publish-subscribe
  send
  request-reply
  polymorphic
  saga
  aggregator
  routing-slip
  streaming
  filters
  telemetry
)

docker compose -f "$HERE/docker-compose.yml" up -d --wait
trap 'docker compose -f "$HERE/docker-compose.yml" down' EXIT

failures=()
for ex in "${EXAMPLES[@]}"; do
  echo "==> $ex"
  if ! ( cd "$HERE/$ex" && node --import tsx src/index.ts ); then
    failures+=("$ex")
  fi
done

if [ ${#failures[@]} -gt 0 ]; then
  echo "FAILURES: ${failures[*]}"
  exit 1
fi
echo "all examples passed"
