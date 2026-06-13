# Contributing to ServiceConnect (Node.js)

Thanks for your interest in contributing. ServiceConnect is a small, opinionated async
message bus over RabbitMQ for modern Node.js. This guide covers how the project is laid
out, how to build and test it, the conventions we hold code to, and how releases are cut.

For consumer-facing usage, see the [README](README.md) and the
[documentation site](https://r-suite.github.io/ServiceConnect-NodeJS/).

## Before you start

- For anything more than a trivial fix, open an issue first so we can agree on the
  approach before you invest time.
- Bug reports are most useful with a minimal reproduction (a failing test or a small
  script against the `examples/` brokers is ideal).
- By contributing you agree your work is licensed under the project's [MIT license](LICENSE).

## Prerequisites

- **Node.js 22 LTS or later** — the packages are ESM-only and target current Node.
- **pnpm 9** — this is a pnpm workspace. `corepack enable` will provision the version
  pinned in the root `package.json` (`packageManager`); `npm`/`yarn` will not install the
  workspace correctly.
- **Docker** — required for the end-to-end tests, the MongoDB store tests, and the stress
  harness: they spin up real RabbitMQ and MongoDB containers via
  [Testcontainers](https://testcontainers.com/). The pure-unit suites need no Docker.

## Project layout

This is a [Turborepo](https://turbo.build/) + pnpm workspace. Each publishable package
lives under [`packages/`](packages) and depends **inward** on the core:

| Package | Role |
| --- | --- |
| `@serviceconnect/core` | Public abstractions + core runtime — the `Bus`, message contracts, the `ITransportProducer`/`ITransportConsumer` and `ISagaStore`/`IAggregatorStore`/`ITimeoutStore` interfaces, the dispatch pipeline, handler/process-manager/aggregator/routing-slip/streaming/request-reply machinery, serialization, and the `ServiceConnectError` hierarchy. Depends only on the standard library. |
| `@serviceconnect/rabbitmq` | RabbitMQ transport. |
| `@serviceconnect/persistence-memory` / `@serviceconnect/persistence-mongodb` | Saga / aggregator / timeout persistence. |
| `@serviceconnect/telemetry` | OpenTelemetry tracing (W3C `traceparent`, OTel messaging semconv). |
| `@serviceconnect/healthchecks` | Producer / consumer health probes. |

The transport / persistence / feature packages reference **only** `@serviceconnect/core`
(via `workspace:*`) — never each other. Keep it that way: new transports or persistence
backends are self-contained packages that depend inward, not sideways. A new persistence
backend should implement the store interfaces from core and pass the shared contract tests
(see [Tests](#tests)).

Other top-level directories:

- [`examples/`](examples) — one runnable app per messaging pattern, with a shared
  `docker-compose.yml` for local brokers and a [`run-all.sh`](examples/run-all.sh). New
  behaviour worth showing off should come with (or extend) an example.
- [`harness/stress`](harness/stress) — the soak / throughput / chaos stress harness.
- [`website/`](website) — the Astro + Starlight documentation site.

## Building and testing

From the repository root:

```bash
pnpm install                 # install the workspace
pnpm build                   # build every package (tsup)
pnpm lint                    # biome check (format + lint) across all packages
pnpm test                    # all package test suites (turbo)
```

`pnpm test` runs every package's tests. The `core`, `telemetry`, `healthchecks`,
`persistence-memory`, and `rabbitmq` unit suites are pure and need no Docker; the
`persistence-mongodb` and `stress-harness` suites use Testcontainers, so Docker must be
running for those.

The broker-backed suites are run per package:

```bash
# RabbitMQ end-to-end tests (Testcontainers; runs sequentially against one broker)
pnpm --filter @serviceconnect/rabbitmq test:e2e

# Stress harness — quick smoke, or a longer soak
pnpm --filter @serviceconnect/stress-harness smoke
pnpm --filter @serviceconnect/stress-harness soak

# Every example, end to end (brings its own broker via docker compose)
bash examples/run-all.sh
```

Before opening a PR, the local gate is a clean `pnpm build`, `pnpm lint`, `pnpm test`, and
`pnpm --filter @serviceconnect/rabbitmq test:e2e`. A green local run means the same checks
CI runs have passed.

## Coding conventions

[`biome.json`](biome.json) is the source of truth for style and lint, and CI fails on any
deviation. Run `pnpm biome check --write .` (or your editor's Biome integration) before
committing. The highlights:

### Language & structure

- **ESM only.** Every package is `"type": "module"`; relative imports use explicit `.js`
  extensions (NodeNext resolution). `verbatimModuleSyntax` is on, so type-only imports must
  use `import type`.
- **TypeScript strict** — `strict`, `noUncheckedIndexedAccess`, and `noImplicitOverride` are
  enabled. No `any` on public surfaces; model absence with `undefined` and narrow it.
- **Formatting** — 4-space indent, single quotes, 100-column line width (Biome). No unused
  imports or variables (lint errors).
- **Module boundaries** — transports/persistence/feature packages import from
  `@serviceconnect/core` only, never from a sibling package.

### Async & cancellation

- The per-message `AbortSignal` is threaded through the consume path and the transport
  producer's optional `signal` parameter. Honour it — long-running or cancellable work
  should observe `signal.aborted` / `signal.throwIfAborted()` rather than ignoring it.
- Don't coordinate timing-sensitive tests with `setTimeout` sleeps; poll a condition (see
  [Tests](#tests)).

### Naming

- Interfaces are `I`-prefixed (`ITransportProducer`, `ISagaStore`); type parameters are
  `T`-prefixed. Exported values use `camelCase` factory functions (`createBus`,
  `memorySagaStore`); classes are `PascalCase`.

### Logging, configuration, errors

- **Logging** goes through the injected `Logger` interface (`createBus({ logger })`), not
  `console.*`. Honour the level threshold.
- **Configuration / wiring** is exposed through `createBus(...)` and the fluent
  registration API (`registerMessage`, `handle`, `registerProcess`, `registerAggregator`).
  New components plug in through the published interfaces and options — don't expect
  consumers to wire concrete internals.
- **Errors** derive from `ServiceConnectError` (`@serviceconnect/core`) — e.g.
  `MessageTypeNotRegisteredError`, `OutgoingFiltersBlockedError`, `ConcurrencyError`,
  `ValidationError`. Add a well-named subtype rather than throwing a bare `Error`.

### Comments

Comments describe the implementation: what the code does, the invariant it preserves, the
trade-off it expresses, the *why* behind a non-obvious choice. They must **not** carry
meta-references that rot — issue/ticket IDs, phase or work-stream labels, commit hashes, or
"fixed in X" framing. That history belongs in the commit message and PR description;
in-source comments should read as if the current shape was always the design.

## Tests

- **Vitest**, with `describe` / `it` blocks. Prefer real code over mocks — bus tests use
  the in-memory `fakeTransport` from `@serviceconnect/core/testing` rather than hand-rolled
  doubles.
- **Unit tests** need no Docker. **Integration / e2e tests** (`persistence-mongodb`,
  `rabbitmq` `test:e2e`, the stress harness) use Testcontainers and exercise a real broker /
  database over the wire.
- A **new persistence backend** must pass the shared contract suites in
  `@serviceconnect/core/testing` (`runSagaStoreContract`, `runAggregatorStoreContract`,
  `runTimeoutStoreContract`) — wire them up like the memory and MongoDB packages do.
- **Coordinate timing by polling a condition** (`vi.waitFor`, or a deadline loop), not by
  sleeping a fixed duration. e2e tests against the shared broker run sequentially and are
  retried for transient broker-latency flakes.
- New features need tests; bug fixes should come with a regression test that fails before
  the fix and passes after.

## Documentation

User-facing docs live in [`website/`](website) (Astro + Starlight) and deploy to GitHub
Pages from `master`. If your change alters public API or behaviour, update the relevant
pages. Build the site locally with `pnpm --filter @serviceconnect/website build`.

## Commits and pull requests

- **Branch from `master`.** CI runs on every branch and every PR, so push early to get
  feedback.
- Follow **Conventional Commits** for messages — `type(scope): summary`, e.g.
  `fix(rabbitmq): …`, `docs: …`, `ci: …`. Common types: `feat`, `fix`, `docs`, `test`,
  `refactor`, `ci`, `chore`. Put detailed rationale and any ticket references in the commit
  body / PR description, not in code comments.
- Keep PRs focused, and make sure the local gate (build, lint, tests, e2e) passes before
  requesting review.

## Releasing (maintainers)

Releases are cut from **`master` only** and driven entirely by a git tag. The tag drives
the published version for every package — there is no version to bump in the source tree;
pushing a `v*` tag triggers the [release workflow](.github/workflows/release.yml), which
stamps the tag's version onto each package and publishes them with `pnpm -r publish`
(internal `workspace:*` dependencies are rewritten to that version automatically).

One guard runs before anything is built or published:

- **On master** — the tagged commit must be reachable from `origin/master`, so tag *after*
  your release commit is merged.

Publishing requires an `NPM_TOKEN` secret on the workflow's `npm` environment (a granular
or automation npm token with write access to the `@serviceconnect` scope).

### Stable release

```bash
git checkout master && git pull
git tag -a v1.0.0 -m "Release 1.0.0"
git push origin v1.0.0
```

### Pre-release

A SemVer pre-release suffix (`-beta.1`, `-rc.1`, …) shares the same base version, so no
source change is needed between a pre-release and its stable cut:

```bash
git tag -a v1.0.0-rc.1 -m "1.0.0 RC1" && git push origin v1.0.0-rc.1   # pre-release
# ...validate, then promote the same base to stable:
git tag -a v1.0.0      -m "Release 1.0.0" && git push origin v1.0.0     # stable
```

npm publishes any hyphenated version under the **`next`** dist-tag instead of `latest`, so
it is excluded from default installs; consumers opt in with
`npm install @serviceconnect/core@next` (the npm equivalent of a NuGet pre-release).

### Notes

- **Push the tag explicitly** — a plain `git push` does not send tags, and avoid
  `git push --tags` (it pushes every local tag).
- **Use dot-numeric suffixes** — `-rc.1`, `-rc.2`, `-rc.10` sort correctly; `-rc1` / `-rc10`
  sort as strings (so `rc10` < `rc2`).
- **Versions are effectively permanent** — npm versions can be deprecated but only
  unpublished within 72 hours, so a pushed tag's version is final. `pnpm -r publish` skips
  versions already on the registry, so re-running after a partial failure is safe.
- **Manual dispatch** — the workflow can also be run from *Actions → release* with a
  `version` input; it is subject to the same on-master guard.
