---
'@serviceconnect/rabbitmq': minor
---

Phase C — RabbitMQ transport implementation lands. `@serviceconnect/rabbitmq` now exports `createRabbitMQTransport(options)` returning a producer/consumer pair that satisfies the Phase B `ITransportProducer` / `ITransportConsumer` interfaces against a real RabbitMQ broker, with topology declaration (one fanout exchange per message type, TTL'd retry queue, optional audit + error queues), separate producer/consumer connections, automatic reconnection via `rabbitmq-client`, and a `snapshot()` method on each side for the upcoming Phase G healthchecks. Wire format is byte-compatible with the C# `ServiceConnect.Client.RabbitMQ`.
