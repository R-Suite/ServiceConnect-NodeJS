# ServiceConnect examples

10 small runnable Node CLI examples, one per pattern plus filters and telemetry. Each is self-contained — exits 0 on success, non-zero on failure.

## Prerequisites

- Docker + Docker Compose v2 (`docker compose ...`).
- Node 22 + pnpm 9.

## Run one example

`bash examples/<name>/run.sh` boots the shared docker-compose stack, runs the example, tears the stack down.

## Run them all

`bash examples/run-all.sh` boots the stack once, runs every example sequentially, tears down. Exits non-zero if any example fails. Wall-clock target: 90-120 seconds.

## Examples

- `publish-subscribe` — `bus.publish` + handler.
- `send` — `bus.send` to a specific queue.
- `request-reply` — `bus.sendRequest` and `bus.sendRequestMulti` (scatter-gather).
- `polymorphic` — base-type handler receives derived-type messages.
- `saga` — process-manager lifecycle. Default `--persistence inmemory`; pass `--persistence mongo` to use MongoDB.
- `aggregator` — `Aggregator<T>` batching by size.
- `routing-slip` — message walks an itinerary of three queues in order.
- `streaming` — 50-chunk stream with `openStream` / `handleStream`.
- `filters` — filter pipeline + middleware in one demo.
- `telemetry` — wires `@serviceconnect/telemetry` with an in-memory OTel span exporter.
