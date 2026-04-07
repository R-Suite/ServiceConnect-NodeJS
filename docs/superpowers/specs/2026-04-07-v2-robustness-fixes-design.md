# ServiceConnect-NodeJS v2 Robustness Fixes — Design Spec

**Date:** 2026-04-07
**Scope:** Production code + test reliability (45 findings from dual code review)
**Semver:** Major (v2 — package.json already bumped)
**Approach:** 10 grouped tasks ordered by severity, related findings bundled into cohesive units

---

## Overview

A dual code review (Claude + Codex, 6 passes) identified 48 findings across the ServiceConnect-NodeJS codebase. One finding (#7 deepmerge array aliasing) was already fixed. Three pure suggestions (#15 linting setup, #16 bus.spec.ts style modernization) are deferred. This spec covers the remaining **45 findings** organized into **10 implementation groups**.

### Findings Summary

| Severity | Count | Examples |
|----------|-------|---------|
| Critical | 3 | Infinite redelivery loop, request/reply race condition, negative RetryCount bypass |
| Important | 22 | SSL silently broken, nack without error handling, Buffer corruption in retry queue |
| Minor | 18 | Dead code, listener leaks, missing validation, test fragility |
| Suggestion | 2 | Host type guard, wrong describe block name |

### Excluded Findings

| # | Finding | Reason |
|---|---------|--------|
| 7 | deepmerge array aliasing | Already fixed (commit 08a0b75) |
| 15 | No linting configuration | Separate tooling effort |
| 16 | Legacy bus.spec.ts patterns | Separate style modernization effort |

---

## Group 1: Message Processing Pipeline Overhaul

**Findings:** #1 (Critical), #30 (Important), #32 (Important), #25 (Minor), #40 (Minor)
**Files:** `src/clients/rabbitmq/message-processor.ts`, `src/bus/index.ts`

### Problem

The ack/nack flow in `handleMessage` has multiple failure modes:
- Handler succeeds but audit/retry publish fails -> nack with `requeue: true` -> infinite redelivery loop (#1)
- After-filter throws -> treated as handler failure -> nack -> duplicate processing (#30)
- Channel closed when nack is called -> unhandled rejection (#32)
- Dead `updatedHeaders` variable created but never used (#25)
- `content.toString()` assumes UTF-8 without checking AMQP `content-encoding` (#40)

### Design

Restructure `handleMessage` into three distinct outcome paths:

1. **Handler succeeded + post-processing succeeded** -> ack
2. **Handler succeeded + post-processing failed** (audit publish, after-filter) -> ack anyway (business logic completed), log the post-processing error
3. **Handler failed** -> pass to retry manager. If retry manager also fails, nack with `requeue: false` (dead-letter) instead of `requeue: true`

Additional changes:
- Wrap all `channel.nack()` and `channel.ack()` calls in try-catch to handle closed channels gracefully
- Remove the dead `updatedHeaders` block (lines 93-96)
- Check `rawMessage.properties.contentEncoding` before `toString()`, default to UTF-8 if unspecified

**Key behavioral change:** After-filter failures no longer cause message redelivery. Persistent retry-manager failures send messages to dead-letter instead of looping infinitely.

### Files Modified

| File | Changes |
|------|---------|
| `src/clients/rabbitmq/message-processor.ts` | Restructure handleMessage ack/nack flow, wrap ack/nack in try-catch, remove dead updatedHeaders, add content-encoding check |
| `src/bus/index.ts` | Wrap after-filter execution in try-catch in consumeMessage, log and swallow after-filter errors |

---

## Group 2: Request/Reply System Overhaul

**Findings:** #2 (Critical), #5 (Important), #29 (Important), #47 (Important)
**Files:** `src/bus/index.ts`, `src/bus/request-reply-manager.ts`

### Problem

- `processReply()` runs concurrently with handlers because `handlerPromises` aren't awaited first (#2)
- `replyCallback` is async but handlers call it without await — failed sends become unhandled rejections (#5)
- Scatter-gather with `expected=null` and no timeout leaks entries in callbacks Map forever (#29)
- `processedCount` incremented before callback invocation — retried replies double-count and cause premature cleanup (#47)

### Design

**In `consumeMessage` (bus/index.ts):**
- Move `await Promise.all(handlerPromises)` before the `requestReplyManager.processReply()` call

**In `createReplyCallback` (bus/index.ts):**
- Wrap the internal send call in try-catch, log failures rather than letting rejections escape
- Return type is `Promise<void>`, document that it should be awaited

**In `RequestReplyManager`:**
- Guard against no-cleanup configurations: if `endpointCount` is -1 (scatter-gather) and no timeout provided, enforce a mandatory default timeout (use `defaultRequestTimeout`, minimum 30s). Throw `ValidationError` if both are explicitly null/0
- Move `processedCount` increment to after `await config.callback(...)` succeeds
- Track processed reply message IDs in a `Set<string>` to deduplicate retried replies

### Files Modified

| File | Changes |
|------|---------|
| `src/bus/index.ts` | Reorder awaits in consumeMessage, wrap replyCallback with error handling |
| `src/bus/request-reply-manager.ts` | Add timeout enforcement, move processedCount increment, add reply dedup Set |

---

## Group 3: Retry & Error Queue Data Integrity

**Findings:** #17 (Critical), #41 (Important)
**Files:** `src/clients/rabbitmq/retry-manager.ts`, `src/clients/rabbitmq/connection-manager.ts`, `src/clients/rabbitmq/index.ts`

### Problem

- `Number(headers.RetryCount) || 0` treats negatives as valid — `-5` with `maxRetries=3` yields 8 retries (#17)
- Channel `json: true` causes `JSON.stringify()` on all payloads — Buffer objects in retry/error paths become corrupted JSON representations (#41)

### Design

**In `RetryManager`:**
- Clamp RetryCount: `const retryCount = Math.max(0, Math.floor(Number(headers.RetryCount) || 0))`

**In `ConnectionManager`:**
- Remove `json: true` from channel creation options

**In `RabbitMQClient`:**
- In `send()` and `publish()`, explicitly serialize: `Buffer.from(JSON.stringify(message))` before passing to channel
- Retry/error paths in `RetryManager` pass raw `Buffer` content through unchanged — no serialization needed since they already have the original bytes

### Files Modified

| File | Changes |
|------|---------|
| `src/clients/rabbitmq/retry-manager.ts` | Clamp RetryCount to non-negative integer |
| `src/clients/rabbitmq/connection-manager.ts` | Remove `json: true` from createChannel |
| `src/clients/rabbitmq/index.ts` | Add explicit JSON serialization in send/publish |

---

## Group 4: Handler & Exchange Lifecycle

**Findings:** #19 (Important), #42 (Important), #46 (Important), #45 (Minor), #36 (Minor)
**Files:** `src/clients/rabbitmq/index.ts`, `src/clients/rabbitmq/queue-manager.ts`, `src/bus/message-handler.ts`, `src/bus/index.ts`

### Problem

- Wildcard `"*"` in config handlers creates a literal `*` exchange on RabbitMQ (#19)
- Repeated `consumeType()` overwrites Map entry but old setup function persists in channel — stale setups re-execute on reconnection (#42)
- Static types (from config) bound via `bindMessageTypes()` never registered in `typeSetupFunctions` — `removeType()` can't unbind them (#46)
- `removeHandler` leaves empty arrays as dead keys (#45)
- Handlers stored by original name but exchanges by normalized name — collision possible (#36)

### Design

**Normalize type names consistently:**
- `MessageHandlerManager` stores handlers by normalized name (dots removed)
- `Bus.addHandler` and `Bus.removeHandler` normalize before storing
- `consumeMessage` normalizes incoming `TypeName` before handler lookup
- Eliminates dual-name collision (#36)

**Filter wildcard from exchange binding:**
- `QueueManager.bindMessageTypes()` skips keys equal to `"*"` (#19)

**Unify setup function lifecycle:**
- During `setupQueues`, register each statically-configured type in `typeSetupFunctions` via the same mechanism as `consumeType` (#46)
- In `consumeType`, check `typeSetupFunctions.has(type)` first — call `removeSetup` on old function before adding new one (#42)

**Clean up empty handler entries:**
- After `removeHandler` splices the last handler, `delete this.handlers[messageType]` (#45)

### Files Modified

| File | Changes |
|------|---------|
| `src/bus/index.ts` | Normalize type names in addHandler/removeHandler/consumeMessage |
| `src/bus/message-handler.ts` | Store by normalized name, delete empty entries |
| `src/clients/rabbitmq/index.ts` | Guard consumeType against duplicates, register static types in typeSetupFunctions |
| `src/clients/rabbitmq/queue-manager.ts` | Filter `"*"` from bindMessageTypes |

---

## Group 5: Connection & Graceful Shutdown

**Findings:** #24 (Minor), #31 (Important), #33 (Minor)
**Files:** `src/clients/rabbitmq/connection-manager.ts`, `src/clients/rabbitmq/message-processor.ts`, `src/clients/rabbitmq/index.ts`

### Problem

- `.on()` used for one-shot promise resolution listeners — accumulate over reconnect cycles (#24)
- `waitForProcessing()` has TOCTOU race — resolves at 0, but new message can arrive before callback executes (#31)
- `assertedExchanges` Set never cleared — exchanges deleted on broker aren't re-asserted (#33)

### Design

**Connection listeners:**
- Replace `.on()` with `.once()` for `connect`/`connectFailed` in connect retry loop and `connect`/`error` in createChannel (#24)

**Graceful shutdown:**
- Add `closing` boolean flag to `MessageProcessor`
- When `close()` is called, set `this.closing = true` before calling `waitForProcessing()`
- In `handleMessage`, if `this.closing` is true, nack with `requeue: true` (let another consumer handle it) and return without incrementing `processing` (#31)

**Exchange cache:**
- Register a setup callback via `channel.addSetup()` that clears `assertedExchanges` at the start of each channel setup. Since addSetup callbacks replay on reconnection, this ensures re-assertion on fresh channels (#33)

### Files Modified

| File | Changes |
|------|---------|
| `src/clients/rabbitmq/connection-manager.ts` | .on() -> .once() for promise listeners |
| `src/clients/rabbitmq/message-processor.ts` | Add closing flag, guard handleMessage |
| `src/clients/rabbitmq/index.ts` | Clear assertedExchanges on channel setup |

---

## Group 6: Configuration & Validation Hardening

**Findings:** #4 (Important), #18 (Important), #20 (Important), #44 (Important), #48 (Minor), #28 (Suggestion), #10 (Minor)
**Files:** `src/bus/index.ts`, `src/clients/rabbitmq/index.ts`, `package.json`

### Problem

Multiple validation gaps allow invalid configurations to pass silently and cause confusing runtime failures.

### Design

**Init guard:**
- `addHandler`/`removeHandler` throw `ValidationError` (new code `NOT_INITIALIZED`) if `!this.initialized` (#4)

**Type validation on send():**
- Add `if (!type || type.trim() === '')` check matching `publish()`. Throw `ValidationError` with `INVALID_MESSAGE_TYPE` (#18)

**Harden numeric validation in `validateConfig`:**
- Replace `typeof x !== 'number' || x < 0` with `!Number.isFinite(x) || x < 0` for all numeric fields
- For `prefetch`, add `!Number.isInteger(x)`
- Add `connectionMaxRetries` validation: `!Number.isFinite(x) || x < 1` (#20, #44)

**Harden queue name validation:**
- `typeof name !== 'string' || name.trim() === ''` (#48)

**Harden host validation:**
- Add `typeof h !== 'string'` guard before `.trim()`, throw `ValidationError` (#28)

**Engines field:**
- Add `"engines": { "node": ">=18" }` to package.json (#10)

**New ValidationErrorCode:**
- Add `NOT_INITIALIZED` to `ValidationErrorCodes` enum

### Files Modified

| File | Changes |
|------|---------|
| `src/bus/index.ts` | Init guard, harden validateConfig, type validation on send |
| `src/clients/rabbitmq/index.ts` | Type validation on send if not already in bus layer |
| `src/errors/ValidationError.ts` | Add NOT_INITIALIZED error code |
| `package.json` | Add engines field |

---

## Group 7: SSL/TLS Implementation

**Finding:** #3 (Important)
**Files:** `src/clients/rabbitmq/connection-manager.ts`, `src/types.ts`, `src/settings.ts`

### Problem

SSL/TLS is documented and typed but never wired through to `amqp.connect()`. Users get silent plaintext connections.

### Design

**Fix SSLConfig types (types.ts):**
- Change `key`, `cert`, `ca`, `pfx` from `string | null` to `Buffer | Buffer[] | undefined`
- Breaking type change, appropriate for v2

**Update defaults (settings.ts):**
- Remove `null` defaults for SSL certificate fields, use `undefined` (opt-in only)
- Keep `enabled: false` as default

**Wire SSL to connection (connection-manager.ts):**
- When `ssl.enabled` is true, construct `tls.ConnectionOptions` from SSLConfig
- Pass as second argument: `amqp.connect(hosts, { connectionOptions })`
- Map fields: `cert`, `key`, `ca`, `pfx`, `passphrase`, `rejectUnauthorized` (from `ssl.verify`)

**Validate SSL config:**
- In `validateConfig`, when `ssl.enabled` is true, verify at least one of `cert`+`key` or `pfx` is provided
- Throw `ValidationError` with `CONFIG_INVALID_SSL`

**Update README:**
- Update SSL configuration example to show `Buffer` usage with `fs.readFileSync`

### Files Modified

| File | Changes |
|------|---------|
| `src/types.ts` | Fix SSLConfig field types to Buffer |
| `src/settings.ts` | Update SSL defaults to undefined |
| `src/clients/rabbitmq/connection-manager.ts` | Pass SSL options to amqp.connect |
| `src/bus/index.ts` | Add SSL validation in validateConfig |
| `README.md` | Update SSL example |

---

## Group 8: Message Headers & Routing

**Findings:** #43 (Important), #34 (Minor)
**Files:** `src/bus/index.ts`, `src/clients/rabbitmq/index.ts`

### Problem

- Reply headers copy incoming `DestinationAddress` — audit metadata shows wrong destination (#43)
- `buildHeaders` uses default deepmerge (concatenation) while Bus uses source-replace — array headers get duplicated (#34)

### Design

**Reply header cleanup (bus/index.ts createReplyCallback):**
- When constructing reply headers from incoming message, explicitly delete `DestinationAddress`, `SourceAddress`, and `ConsumerType` before spreading
- Preserve correlation headers: `CorrelationId`, `RequestMessageId`, `ResponseMessageId`
- `sendToEndpoint` will set correct routing headers for the reply destination (#43)

**Consistent deepmerge (rabbitmq/index.ts buildHeaders):**
- Pass `{ arrayMerge: (_target, source) => source }` to the deepmerge call in `buildHeaders` (#34)

### Files Modified

| File | Changes |
|------|---------|
| `src/bus/index.ts` | Strip routing headers from reply in createReplyCallback |
| `src/clients/rabbitmq/index.ts` | Add arrayMerge option to buildHeaders deepmerge call |

---

## Group 9: Error Handling & Code Quality

**Findings:** #6 (Important), #8 (Minor), #35 (Minor), #37 (Minor), #9 (Minor)
**Files:** `src/errors/ServiceConnectError.ts`, `src/bus/index.ts`, `.gitignore`/git index

### Problem

- `Error.captureStackTrace` targets wrong constructor frame (#6)
- Redundant logger null check before optional chaining (#8)
- Constructor binding prevents subclass overrides (#35)
- No runtime `CorrelationId` validation on outbound messages (#37)
- `lib/` tracked in git despite `.gitignore` (#9)

### Design

**Stack trace fix (ServiceConnectError.ts):**
- Change `Error.captureStackTrace(this, ServiceConnectError)` to `Error.captureStackTrace(this, new.target)` — automatically targets whichever constructor was called (#6)

**Logger cleanup (bus/index.ts):**
- Remove redundant `if (this.config.logger)` wrapper, keep only optional chaining (#8)

**Document non-subclassable design (bus/index.ts):**
- Add JSDoc on Bus class stating it is not designed for inheritance. Constructor method binding is intentional for safe callback passing (#35)

**Runtime CorrelationId validation (bus/index.ts):**
- In `send()` and `publish()`, check `message.CorrelationId` is a non-empty string
- Throw `MessageError` with `INVALID_MESSAGE_FORMAT` if missing (#37)

**Remove lib/ from git:**
- Run `git rm -r --cached lib/` to untrack compiled output (#9)

### Files Modified

| File | Changes |
|------|---------|
| `src/errors/ServiceConnectError.ts` | Fix captureStackTrace to use new.target |
| `src/bus/index.ts` | Remove redundant logger check, add JSDoc, add CorrelationId validation |
| git index | Remove lib/ from tracking |

---

## Group 10: Integration Test Reliability

**Findings:** #21 (Important), #22 (Important), #23 (Important), #26 (Minor), #11 (Minor), #12 (Minor), #13 (Minor), #27 (Minor), #38 (Minor), #39 (Suggestion)
**Files:** All files under `integration-test/`, `test/bus.spec.ts`, `package.json`

### Problem

Multiple anti-patterns across integration tests cause false passes, hangs, and misleading failure messages.

### Design

1. **Replace `new Promise(async ...)` with direct async/await** in all 11 affected test files. Restructure: set up handler before `init()`, await send/publish, await a helper that resolves when handler fires (#21)

2. **Add `await` to all `send()`/`publish()` calls** — or `await Promise.all()` for loop-based sends (#22)

3. **Verify audit queue content** — in `auditQueue.spec.ts`, after handler resolves, consume from `Test.Consumer.Audit` and assert message presence with `TimeProcessed` header (#23)

4. **Guard teardown** — `await consumer?.close()` / `await producer?.close()` in all `afterEach` hooks (#26)

5. **Docker cleanup** — add `docker rm -f rabbitmq 2>/dev/null || true` before `docker run` in `setupDocker.ts` (#11)

6. **Poll deadlines** — wrap `setInterval` polls with 30s max duration, reject with actual vs expected values (#12)

7. **Add CorrelationId to replies** — `CorrelationId: message.CorrelationId` in test reply objects (#13)

8. **Pin RabbitMQ version** — change `bitnami/rabbitmq:latest` to `bitnami/rabbitmq:4.1.0` in package.json scripts (#27)

9. **Await close()** — add `await` to `bus.close()` in `bus.spec.ts` (#38)

10. **Fix describe name** — `"Events"` -> `"Filters"` in `filters.spec.ts` (#39)

### Files Modified

| File | Changes |
|------|---------|
| `integration-test/commands.spec.ts` | async/await refactor, await sends, guard teardown |
| `integration-test/events.spec.ts` | async/await refactor, await publishes, guard teardown |
| `integration-test/competingConsumers.spec.ts` | async/await refactor, await sends, guard teardown |
| `integration-test/customLogger.spec.ts` | async/await refactor, guard teardown |
| `integration-test/auditQueue.spec.ts` | async/await refactor, add audit verification, guard teardown |
| `integration-test/removeHandler.spec.ts` | async/await refactor, guard teardown |
| `integration-test/multipleEndpoints.spec.ts` | async/await refactor, guard teardown |
| `integration-test/wildcardHandler.spec.ts` | async/await refactor, guard teardown |
| `integration-test/priorityQueue.spec.ts` | async/await refactor, guard teardown |
| `integration-test/filters.spec.ts` | await sends, fix describe name |
| `integration-test/requestReply.spec.ts` | Add CorrelationId to replies, poll deadline |
| `integration-test/retries.spec.ts` | Poll deadline, guard teardown |
| `integration-test/scatterGather.spec.ts` | Add CorrelationId, poll deadline |
| `integration-test/setupDocker.ts` | Docker cleanup before run |
| `integration-test/config.ts` | No changes needed |
| `test/bus.spec.ts` | Await close() |
| `package.json` | Pin rabbitmq image version |

---

## Execution Order

Groups are ordered by severity — most critical production bugs first:

| Order | Group | Critical | Important | Minor | Risk |
|-------|-------|----------|-----------|-------|------|
| 1 | Message Processing Pipeline | 1 | 2 | 2 | High — core ack/nack semantics change |
| 2 | Request/Reply System | 1 | 3 | 0 | High — concurrency behavior changes |
| 3 | Retry & Error Queue Data Integrity | 1 | 1 | 0 | High — serialization path changes |
| 4 | Handler & Exchange Lifecycle | 0 | 3 | 2 | Medium — affects type binding across layers |
| 5 | Connection & Graceful Shutdown | 0 | 1 | 2 | Medium — connection lifecycle changes |
| 6 | Configuration & Validation | 0 | 4 | 3 | Low — additive validation, clear error paths |
| 7 | SSL/TLS Implementation | 0 | 1 | 0 | Medium — new feature wiring |
| 8 | Message Headers & Routing | 0 | 1 | 1 | Low — targeted header changes |
| 9 | Error Handling & Code Quality | 0 | 1 | 4 | Low — isolated fixes |
| 10 | Integration Test Reliability | 0 | 3 | 7 | Low — test-only changes |

---

## Cross-Cutting Concerns

### Testing Strategy

Each group gets its own unit tests covering the changed behavior. Groups 1-5 (higher risk) should also verify integration test scenarios pass. Group 10 is itself a test improvement effort.

### Breaking Changes (v2)

| Change | Impact |
|--------|--------|
| `addHandler` before `init()` now throws | Callers were already silently broken |
| `send()` with empty type now throws | Messages were already silently dropped |
| SSL types change to `Buffer` | Type-level breaking change |
| After-filter errors no longer cause message redelivery | Behavioral change — handlers now always ack on success |
| `nack` uses `requeue: false` on persistent retry failure | Messages go to DLX instead of looping |
| Handler names stored normalized | Lookup uses normalized names consistently |
| `CorrelationId` required at runtime | JS callers must include it |

### Files Touched Per Group (Overlap Analysis)

`src/bus/index.ts` is modified in groups 1, 2, 4, 6, 7, 8, 9. This is expected — it's the main facade (449 lines). Changes are in different methods with minimal overlap:
- Group 1: consumeMessage (after-filter path)
- Group 2: consumeMessage (await order), createReplyCallback
- Group 4: addHandler/removeHandler (normalization)
- Group 6: validateConfig, addHandler (init guard), send (type validation)
- Group 7: validateConfig (SSL)
- Group 8: createReplyCallback (header stripping)
- Group 9: logger check, JSDoc, CorrelationId validation in send/publish
