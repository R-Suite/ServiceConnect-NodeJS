---
'@serviceconnect/core': minor
'@serviceconnect/rabbitmq': patch
---

Phase B — Core abstractions land in `@serviceconnect/core`: Bus, Message, ConsumeContext, Handler registration (function / class / factory), four-stage filter + middleware pipeline, JSON serializer with optional Standard Schema validation, message-type registry, transport interfaces, and an in-memory `fakeTransport` available via the `@serviceconnect/core/testing` subpath. The `@serviceconnect/rabbitmq` probe is upgraded to import the public `Message` type alongside the existing `PACKAGE_NAME` constant.
