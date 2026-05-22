---
'@serviceconnect/core': minor
'@serviceconnect/rabbitmq': minor
---

Phase D — basic patterns lands. `@serviceconnect/core` now ships a real `RequestReplyManager` and the Bus's `sendRequest` / `sendRequestMulti` / `publishRequest` complete (replacing the Phase B stubs). Polymorphic messages are supported via `bus.registerMessage(name, { parents })`; the dispatcher walks the parent chain when resolving handlers. Five new error classes — `RequestTimeoutError` (with `.partialReplies`), `RequestSendCancelledError`, `AbortError`, `ArgumentError`, `ArgumentOutOfRangeError`. `@serviceconnect/rabbitmq` declares parent fanout exchanges + exchange-to-exchange bindings at publish time when a `parentsOf` callback is supplied; a `rabbitMQWithRegistry(opts, registry)` convenience helper wires the lookup from a core `IMessageTypeRegistry`.
