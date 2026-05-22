---
'@serviceconnect/core': minor
'@serviceconnect/persistence-memory': minor
'@serviceconnect/rabbitmq': minor
---

Phase E — advanced patterns lands. Four new dispatcher subsystems on `@serviceconnect/core`:

- **Process Manager (sagas)** with `ProcessHandler<TData, TMessage>`, persistent state via `ISagaStore`, crash-safe timeouts via `ITimeoutStore` + `TimeoutPoller`. Public API: `bus.registerProcessData(...).registerProcess(...).startsWith(...).handles(...)`.
- **Aggregator** with the `Aggregator<T>` abstract base, per-type `batchSize`/`timeout` flush policy, lease-based replay via `IAggregatorStore` + `AggregatorFlushTimer`. Public API: `bus.registerAggregator(typeName, instance, { store })`.
- **Routing Slip** via `bus.route(typeName, message, [...destinations])` with destination validation at send-time and receive-time.
- **Streaming** via `bus.openStream` (returns `StreamSender<T>`) and `bus.handleStream` (consumer-side, receives chunks as `AsyncIterable<T>`), plus a Web Streams adapter (`bus.openWritableStream`).

`@serviceconnect/persistence-memory` is now a real package with `memorySagaStore`, `memoryAggregatorStore`, `memoryTimeoutStore`. Reusable contract suites live under `@serviceconnect/core/testing/persistence/*` and the Phase F MongoDB backend will re-run the same coverage.

Six new error classes: `ConcurrencyError`, `DuplicateSagaError`, `AggregatorConfigurationError`, `RoutingSlipDestinationError`, `StreamFaultedError`, `StreamSequenceError`.
