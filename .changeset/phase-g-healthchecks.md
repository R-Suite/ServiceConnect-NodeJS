---
'@serviceconnect/healthchecks': minor
---

Phase G ships `@serviceconnect/healthchecks` — plain async functions returning `{ status: 'healthy' | 'unhealthy' | 'degraded'; description?; data? }`. Three built-in checks: `producerConnectivity(bus)` (probes `bus.producer.isHealthy`), `consumerConnectivity(bus)` (probes `bus.consumer.isConnected` + `isCancelledByBroker`), `consumerBusy(bus, { graceMs })` (degrades when `bus.lastConsumedAt` exceeds the grace window, unhealthy when disconnected). No framework adapter — consumers wire results into Express / Fastify / K8s probes themselves.
