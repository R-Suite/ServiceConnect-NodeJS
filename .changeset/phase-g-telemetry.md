---
'@serviceconnect/core': minor
'@serviceconnect/telemetry': minor
---

Phase G ships `@serviceconnect/telemetry` — OpenTelemetry instrumentation for ServiceConnect. Two opt-in wrappers: `telemetryProducer(producer)` decorates an `ITransportProducer` to emit publish/send spans + inject W3C `traceparent` into outbound headers; `telemetryConsumeWrapper()` returns a `(cb) => cb` higher-order function that brackets the dispatcher with a process span (parented by the extracted `traceparent`). Span attributes follow OpenTelemetry messaging semantic conventions (`messaging.system`, `messaging.operation`, `messaging.destination.name`, `messaging.message.id`, `messaging.message.conversation_id`, `messaging.message.body.size`). Metrics: `serviceconnect.publish.count`, `serviceconnect.consume.count`, `serviceconnect.error.count`, `serviceconnect.processing.duration` (histogram). Peer-deps `@opentelemetry/api ^1.7.0` so consumers bring their own SDK.

`@serviceconnect/core` gains one small additive change: `BusOptions.consumeWrapper?: (cb: ConsumeCallback) => ConsumeCallback` (used by the telemetry consume wrapper) plus `Bus.consumer`, `Bus.producer`, and `Bus.lastConsumedAt` getters on the public surface.
