# Cross-runtime interop proof (Node.js ⇄ C# `master`)

Proves that `@serviceconnect/*` (Node.js) interoperates on the same RabbitMQ broker with the
published C# `master` ServiceConnect — the deployed wire format.

- **`csharp-fixture/`** — a minimal C# `master` service (references the published `ServiceConnect`
  NuGet package). It consumes from queue `csharp-in`, registers `Interop.Messages.Ping`, and replies
  to every `Ping` with `Pong { Text = ping.Text + "-pong" }`. One handler serves both transports:
  point-to-point (a Node `sendRequest` to `csharp-in`) and pub/sub (a Node `publishRequest` fanned
  out via the `Interop.Messages.Ping` exchange the fixture's queue is bound to).
- **`run.sh`** — starts the broker, builds + runs the fixture, runs the gated Node interop e2e suite
  (`packages/rabbitmq/test/e2e/interop-master.test.ts`, enabled by `INTEROP=1`), and tears down.

## Run

```bash
bash interop/run.sh
```

Requires Docker and the .NET SDK. Expected: `Tests 2 passed` — each round-trip validates type
identity (`TypeName` = .NET FullName), PascalCase body (de)serialization, the `FullName`-stripped
pub/sub exchange name, and request/reply correlation (`RequestMessageId`/`ResponseMessageId` +
`SourceAddress`) — Node→C# and C#→Node.

## Status

Validated for **Phase 1** (identity / headers / serialization) and **Phase 2(a)** (pub/sub exchange
naming). See `docs/superpowers/specs/2026-06-14-csharp-node-wire-interop-roadmap.md`.
