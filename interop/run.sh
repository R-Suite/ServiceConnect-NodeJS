#!/usr/bin/env bash
# Proves Node.js <-> C# `master` ServiceConnect interop on a shared RabbitMQ broker.
#
# Starts the broker (reusing the examples compose recipe, which is known to work here), builds and
# runs the C# `master` fixture (interop/csharp-fixture), then runs the gated Node interop e2e suite
# (packages/rabbitmq/test/e2e/interop-master.test.ts) against the same broker. Tears everything down
# on exit. Requires Docker and the .NET SDK.
#
# Usage:  bash interop/run.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
DC="docker compose -f $ROOT/examples/docker-compose.yml"
FIXLOG="$(mktemp)"
FIXPID=""

cleanup() {
  [ -n "$FIXPID" ] && kill "$FIXPID" 2>/dev/null
  $DC down >/dev/null 2>&1
}
trap cleanup EXIT

echo "==> starting RabbitMQ"
$DC up -d rabbitmq >/dev/null 2>&1
cid="$($DC ps -q rabbitmq)"
for _ in $(seq 1 40); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null)" = "healthy" ] && break
  sleep 3
done

echo "==> starting C# master fixture"
( cd "$HERE/csharp-fixture" && dotnet run -c Release ) >"$FIXLOG" 2>&1 &
FIXPID=$!
for _ in $(seq 1 60); do
  grep -q "FIXTURE READY" "$FIXLOG" 2>/dev/null && break
  kill -0 "$FIXPID" 2>/dev/null || { echo "fixture exited early:"; cat "$FIXLOG"; exit 1; }
  sleep 1
done

echo "==> running Node interop e2e"
cd "$ROOT/packages/rabbitmq"
INTEROP=1 RABBITMQ_URL=amqp://guest:guest@localhost:5672 \
  npx vitest run --project e2e --no-file-parallelism interop-master
