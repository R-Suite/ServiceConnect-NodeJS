# ServiceConnect for Node.js

[![ci](https://github.com/R-Suite/ServiceConnect-NodeJS/actions/workflows/ci.yml/badge.svg?branch=v3)](https://github.com/R-Suite/ServiceConnect-NodeJS/actions/workflows/ci.yml)
[![docs](https://github.com/R-Suite/ServiceConnect-NodeJS/actions/workflows/docs.yml/badge.svg?branch=v3)](https://github.com/R-Suite/ServiceConnect-NodeJS/actions/workflows/docs.yml)

Asynchronous messaging for Node.js. ServiceConnect gives you a typed, ergonomic bus on top of RabbitMQ with first-class support for pub/sub, point-to-point, request/reply, scatter-gather, polymorphic dispatch, process managers (sagas), aggregators, routing slips, streaming, and a pluggable pipeline.

It is the Node.js sibling of [ServiceConnect for .NET](https://github.com/R-Suite/ServiceConnect-CSharp) and is wire-compatible with it.

**Documentation:** <https://r-suite.github.io/ServiceConnect-NodeJS/>

## Why?

Most Node.js AMQP clients give you a connection and a channel. You then write the same plumbing every project: typed handlers, retry queues, error queues, correlation, request/reply, sagas, streaming. ServiceConnect provides all of that out of the box, with a small, composable API and a clean transport abstraction so you can swap the broker (or persistence layer) without touching your handlers.

## Install

```bash
npm install @serviceconnect/core @serviceconnect/rabbitmq
```

Optional packages:

```bash
npm install @serviceconnect/persistence-memory   # in-memory saga / aggregator stores (dev + tests)
npm install @serviceconnect/persistence-mongodb  # MongoDB-backed stores (production)
npm install @serviceconnect/telemetry            # OpenTelemetry hooks
npm install @serviceconnect/healthchecks         # producer / consumer health probes
```

## Quickstart

```ts
import { createBus, createMessageTypeRegistry, type Message } from '@serviceconnect/core';
import { rabbitMQWithRegistry } from '@serviceconnect/rabbitmq';

interface OrderPlaced extends Message {
  orderId: string;
  total: number;
}

const registry = createMessageTypeRegistry();
registry.register<OrderPlaced>('OrderPlaced');

const bus = createBus({
  queue: { name: 'orders' },
  transport: rabbitMQWithRegistry(
    { url: 'amqp://localhost' },
    registry,
  ),
  registry,
});

bus.handle<OrderPlaced>('OrderPlaced', async (msg, ctx) => {
  console.log('charging', msg.orderId, msg.total);
});

await bus.start();
await bus.publish<OrderPlaced>('OrderPlaced', {
  correlationId: 'c-1',
  orderId: 'o-1',
  total: 49.99,
});
```

## Packages

| Package | Purpose |
|---|---|
| `@serviceconnect/core` | Bus, handlers, pipeline, sagas, aggregators, routing slip, streaming. |
| `@serviceconnect/rabbitmq` | RabbitMQ transport. |
| `@serviceconnect/persistence-memory` | In-memory saga / aggregator / timeout stores. |
| `@serviceconnect/persistence-mongodb` | MongoDB-backed stores. |
| `@serviceconnect/telemetry` | OpenTelemetry producer / consumer wrappers. |
| `@serviceconnect/healthchecks` | Producer + consumer health checks. |

## Examples

Runnable end-to-end examples live under [`examples/`](./examples). Each example uses the `examples/docker-compose.yml` to spin up RabbitMQ:

```bash
cd examples
docker compose up -d
bash run-all.sh
```

## Migration from v2

The legacy `service-connect` v2.x package (on the `master` branch) is preserved unchanged. v3 is a complete redesign with typed handlers, ESM-only, Node 22 LTS, and a pluggable transport.

See the [migration guide](https://r-suite.github.io/ServiceConnect-NodeJS/migrating-v2-to-v3/) for a side-by-side mapping of every v2 concept to its v3 replacement.

## Engine support

Node 22 LTS or later. ESM only. TypeScript users: NodeNext module resolution.

## Contributing

Issues and PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for project layout, build/test instructions, coding conventions, and the release process.

## License

MIT — see [LICENSE](./LICENSE).
