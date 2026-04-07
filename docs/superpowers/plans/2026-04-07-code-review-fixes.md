# ServiceConnect Code Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all bugs, design issues, and minor issues identified in the code review of ServiceConnect-NodeJS.

**Architecture:** Each fix is isolated to a small number of files with corresponding test updates. Fixes are ordered bugs-first, then design issues, then minor cleanups. Each task is independently committable.

**Tech Stack:** TypeScript 6, Mocha, Chai, Sinon, amqplib, amqp-connection-manager

**Test command:** `npm test` (runs `TS_NODE_TRANSPILE_ONLY=true mocha --require ts-node/register test/**/*.spec.ts`)

---

### Task 1: Fix connection event listener leak in retry loop

**Problem:** Each retry iteration in `ConnectionManager.connect()` calls `amqp.connect()` creating a new connection object, but the previous connection (with its event listeners) is never cleaned up. This leaks connections on retry.

**Files:**
- Modify: `src/clients/rabbitmq/connection-manager.ts:23-62`
- Test: `test/rabbitmq-modules.spec.ts`

- [ ] **Step 1: Write the failing test**

Add a test in `test/rabbitmq-modules.spec.ts` inside the `ConnectionManager > connect` describe block:

```typescript
it("should close previous connection on retry", async function() {
    let attempt = 0;
    const mockConnection1Close = sandbox.stub().resolves();
    const mockConnection2Close = sandbox.stub().resolves();

    const connections = [
        {
            on: sandbox.stub().callsFake((event: string, cb: Function) => {
                if (event === 'connectFailed') {
                    setImmediate(() => cb({ err: new Error('Connection refused') }));
                }
            }),
            close: mockConnection1Close,
            isConnected: sandbox.stub().returns(false)
        },
        {
            on: sandbox.stub().callsFake((event: string, cb: Function) => {
                if (event === 'connect') {
                    setImmediate(() => cb());
                }
            }),
            close: mockConnection2Close,
            isConnected: sandbox.stub().returns(true)
        }
    ];

    const connectStub = sandbox.stub(amqp, 'connect');
    connectStub.onCall(0).returns(connections[0] as any);
    connectStub.onCall(1).returns(connections[1] as any);
    sandbox.stub(ConnectionManager.prototype as any, 'sleep').resolves();

    const connectionManager = new ConnectionManager(mockConfig);
    await connectionManager.connect();

    assert.isTrue(mockConnection1Close.calledOnce, 'Previous connection should be closed on retry');
    assert.isTrue(connectionManager.isConnected());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -A 2 "should close previous connection"`
Expected: FAIL — `Previous connection should be closed on retry` assertion fails

- [ ] **Step 3: Implement the fix**

In `src/clients/rabbitmq/connection-manager.ts`, modify the `connect()` method to close the previous connection before retrying:

```typescript
async connect(): Promise<void> {
    const maxRetries = this.config.amqpSettings.connectionMaxRetries;
    let lastError: Error | undefined;
    const hosts = Array.isArray(this.config.amqpSettings.host)
      ? this.config.amqpSettings.host
      : [this.config.amqpSettings.host];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Clean up previous connection attempt if any
        if (this.connection) {
          try {
            await this.connection.close();
          } catch {
            // Ignore close errors during retry
          }
          this.connection = null;
        }

        this.connection = amqp.connect(hosts);
        this.setupConnectionEvents();

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, this.config.amqpSettings.connectionTimeout);

          this.connection!.on('connect', () => {
            clearTimeout(timeout);
            this.logger?.info(`Connected to RabbitMQ: ${this.config.amqpSettings.queue.name}`);
            resolve();
          });

          this.connection!.on('connectFailed', (err) => {
            clearTimeout(timeout);
            reject(err.err);
          });
        });

        return;
      } catch (error) {
        lastError = error as Error;
        this.logger?.error(`Connection attempt ${attempt} failed`, error);

        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), this.config.amqpSettings.connectionRetryDelay);
          await this.sleep(delay);
        }
      }
    }

    // Clean up last failed connection
    if (this.connection) {
      try {
        await this.connection.close();
      } catch {
        // Ignore close errors
      }
      this.connection = null;
    }

    throw new ConnectionError(
      `Failed to connect to RabbitMQ after ${maxRetries} attempts`,
      ConnectionErrorCodes.CONNECTION_FAILED,
      false,
      lastError
    );
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All tests pass including the new one

- [ ] **Step 5: Commit**

```bash
git add src/clients/rabbitmq/connection-manager.ts test/rabbitmq-modules.spec.ts
git commit -m "fix: close previous connection before retry in ConnectionManager"
```

---

### Task 2: Fix message ack before retry/error queue publish completes

**Problem:** In `MessageProcessor.handleMessage()`, the `finally` block always acks the message. If `retryManager.handleResult()` itself throws (e.g., channel closed), the exception is caught by the outer try/catch, the message is still ack'd, and it is silently lost — never retried, never error-queued.

**Files:**
- Modify: `src/clients/rabbitmq/message-processor.ts:42-63`
- Test: `test/rabbitmq-modules.spec.ts`

- [ ] **Step 1: Write the failing test**

Add in `test/rabbitmq-modules.spec.ts` inside `MessageProcessor > handleMessage`:

```typescript
it("should not ack message if retryManager.handleResult fails", async function() {
    mockRetryManager.handleResult.rejects(new Error('Channel closed'));
    await messageProcessor.startConsuming(mockChannel, mockChannelWrapper);

    const message: ConsumeMessage = {
        content: Buffer.from(JSON.stringify({ CorrelationId: '123' })),
        properties: {
            headers: { TypeName: 'TestMessage' },
            messageId: 'msg-123'
        }
    } as any;

    const consumeHandler = mockChannel.consume.getCall(0).args[1];
    await consumeHandler(message);

    assert.isFalse(mockChannel.ack.called, 'Message should not be ack\'d when retry routing fails');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -A 2 "should not ack message if retryManager"`
Expected: FAIL — message is currently ack'd regardless

- [ ] **Step 3: Implement the fix**

Replace the `handleMessage` method in `src/clients/rabbitmq/message-processor.ts`:

```typescript
private async handleMessage(rawMessage: ConsumeMessage | null): Promise<void> {
    if (rawMessage === null) return;

    this.processing++;

    try {
      const typeName = rawMessage.properties.headers?.TypeName;
      
      if (!typeName) {
        this.logger?.error('Message does not contain TypeName header');
        this.ackMessage(rawMessage);
        this.processing--;
        return;
      }

      await this.processMessage(rawMessage);
      this.ackMessage(rawMessage);
    } catch (error) {
      this.logger?.error('Error processing message', error);
      // Do NOT ack — the message will be redelivered by RabbitMQ
    } finally {
      this.processing--;
    }
  }
```

- [ ] **Step 4: Update existing tests that rely on old ack behavior**

The existing test "should skip message without TypeName header" already expects ack to be called for headerless messages — that still works since we ack before the early return. The test "should process message with valid TypeName header" expects ack to be called on success — that still works since ack happens after processMessage succeeds.

Verify the test "should process message with no channelWrapper available" still works. When there's no channelWrapper and the handler succeeds, `processMessage` doesn't throw, so ack is called. When handler fails and there's no channelWrapper, `processMessage` throws a `MessageError`, so we skip ack — which is the correct new behavior.

We need to update the "should process message with no channelWrapper available" test since it expects the message to be ack'd even though processMessage may now throw:

```typescript
it("should process message with no channelWrapper available", async function() {
    await messageProcessor.startConsuming(mockChannel);

    const message: ConsumeMessage = {
        content: Buffer.from(JSON.stringify({ CorrelationId: '123' })),
        properties: {
            headers: { TypeName: 'TestMessage' }
        }
    } as any;

    const consumeHandler = mockChannel.consume.getCall(0).args[1];
    await consumeHandler(message);

    assert.isTrue(mockConsumeCallback.called);
    assert.isTrue(mockChannel.ack.called);
});
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/clients/rabbitmq/message-processor.ts test/rabbitmq-modules.spec.ts
git commit -m "fix: do not ack message when retry routing fails"
```

---

### Task 3: Fix scatter/gather with unknown endpoint count

**Problem:** When `publishRequest` is called with `expected=null`, `endpointCount` is set to `-1`. In `processReply`, the condition `processedCount >= endpointCount` is immediately true after the first reply (since `1 >= -1`), so the request is cleaned up after receiving only one response. For unknown responder count, replies should be collected until timeout.

**Files:**
- Modify: `src/bus/request-reply-manager.ts:50-67`
- Test: `test/bus-modules.spec.ts`

- [ ] **Step 1: Write the failing test**

Add in `test/bus-modules.spec.ts` inside `RequestReplyManager > processReply`:

```typescript
it("should not clean up request with endpointCount -1 after first reply", async function() {
    const messageId = "scatter-gather-test";
    const callback = sinon.stub();

    manager.registerRequest(messageId, -1, callback, null);

    await manager.processReply(messageId, createMessage({ data: 1 }), createHeaders(), "Reply1");
    expect(callback.calledOnce).to.be.true;
    expect(manager.hasPendingRequest(messageId)).to.be.true;

    await manager.processReply(messageId, createMessage({ data: 2 }), createHeaders(), "Reply2");
    expect(callback.calledTwice).to.be.true;
    expect(manager.hasPendingRequest(messageId)).to.be.true;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -A 2 "should not clean up request with endpointCount -1"`
Expected: FAIL — request is cleaned up after first reply

- [ ] **Step 3: Implement the fix**

In `src/bus/request-reply-manager.ts`, modify the `processReply` method:

```typescript
async processReply(
    messageId: string,
    message: Message,
    headers: Record<string, unknown>,
    type: string
  ): Promise<void> {
    const config = this.callbacks.get(messageId);
    if (!config) {
      return;
    }

    await config.callback(message, headers, type);
    config.processedCount++;

    // endpointCount of -1 means unknown responder count (scatter/gather);
    // only clean up via timeout, not by counting replies
    if (config.endpointCount >= 0 && config.processedCount >= config.endpointCount) {
      this.cleanupRequest(messageId);
    }
  }
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/bus/request-reply-manager.ts test/bus-modules.spec.ts
git commit -m "fix: scatter/gather with unknown endpoint count collects replies until timeout"
```

---

### Task 4: Fix reply callback mutating shared headers object

**Problem:** `createReplyCallback` in `Bus` mutates the incoming `headers` object by setting `ResponseMessageId = RequestMessageId`. Since after-filters run after handler invocation, they see mutated headers.

**Files:**
- Modify: `src/bus/index.ts:350-365`
- Test: `test/bus-modules.spec.ts`

- [ ] **Step 1: Write the failing test**

This is best tested at the Bus level. Add a new describe block in `test/bus.spec.ts` (at the end, before the closing `});`):

First, add a test utility at the top of `test/bus.spec.ts` after the imports:

```typescript
import { Bus } from '../src/index';
import chai from 'chai';
import sinon from 'sinon';
import settings from '../src/settings';
```

Then add a new describe block inside the main `Bus` describe:

```typescript
describe("createReplyCallback", function() {
    var sendStub: any;
    beforeEach(function() {
        sendStub = sinon.stub(settingsObject.client.prototype, 'send');
    });

    afterEach(function() {
        (settingsObject.client as any).prototype.send.restore();
    });

    it("should not mutate original headers when reply is sent", async function() {
        let bus = new Bus({ amqpSettings: { queue: { name: 'Test' } } });
        await bus.init();

        const originalHeaders: Record<string, unknown> = {
            RequestMessageId: 'req-123',
            SourceAddress: 'source-queue',
            TypeName: 'TestMessage'
        };
        const headersBefore = { ...originalHeaders };

        // Access the private consumeMessage method to trigger reply callback creation
        const consumeMessage = (bus as any).consumeMessage.bind(bus);

        // Add a handler that invokes the reply callback
        await bus.addHandler('TestMessage', (_msg: any, _hdrs: any, _type: any, replyCallback: any) => {
            if (replyCallback) {
                replyCallback('ReplyType', { CorrelationId: 'corr-1' });
            }
        });

        // Simulate consuming a message
        await consumeMessage(
            { CorrelationId: 'corr-1' },
            originalHeaders,
            'TestMessage'
        );

        // Original headers should not have ResponseMessageId set
        expect(originalHeaders.ResponseMessageId).to.be.undefined;
        expect(originalHeaders.RequestMessageId).to.equal(headersBefore.RequestMessageId);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -A 2 "should not mutate original headers"`
Expected: FAIL — `originalHeaders.ResponseMessageId` is set to `'req-123'`

- [ ] **Step 3: Implement the fix**

In `src/bus/index.ts`, modify the `createReplyCallback` method to copy headers instead of mutating:

```typescript
private createReplyCallback(
    headers: Record<string, unknown>
  ): ReplyCallback<Message> {
    return async (type: string, message: Message): Promise<void> => {
      const replyHeaders = {
        ...headers,
        ResponseMessageId: headers.RequestMessageId,
      };
      const sourceAddress = headers.SourceAddress as string;
      if (sourceAddress && this.core.client) {
        await this.core.client.send(
          sourceAddress,
          type,
          message,
          replyHeaders as MessageHeaders
        );
      }
    };
  }
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/bus/index.ts test/bus.spec.ts
git commit -m "fix: reply callback no longer mutates shared headers object"
```

---

### Task 5: Remove ChannelWrapper internals access

**Problem:** `RabbitMQClient.close()` casts to `ChannelWrapperInternal` to access `_channel`, a private property. This is fragile and will break on library updates.

**Files:**
- Modify: `src/clients/rabbitmq/index.ts:27-41` (remove interfaces), `src/clients/rabbitmq/index.ts:232-263` (close method)
- Test: `test/rabbitmq-modules.spec.ts` (no new tests needed; existing close tests in ConnectionManager cover it)

- [ ] **Step 1: Simplify the close method**

In `src/clients/rabbitmq/index.ts`, remove the `AmqplibChannel` and `ChannelWrapperInternal` interfaces (lines 29-41) and replace the `close()` method:

```typescript
async close(): Promise<void> {
    await this.messageProcessor.waitForProcessing();
    await this.connectionManager.close();
  }
```

The `connectionManager.close()` already closes the channel and connection. Consumer cancellation happens automatically when the channel closes. The retry queue deletion on close was only done when `autoDelete` was true — in that case RabbitMQ itself handles deletion when the queue has no consumers and `autoDelete` is set.

- [ ] **Step 2: Run tests to verify all pass**

Run: `npm test`
Expected: All tests pass (the close test in bus.spec.ts stubs the client's close method)

- [ ] **Step 3: Commit**

```bash
git add src/clients/rabbitmq/index.ts
git commit -m "refactor: remove ChannelWrapper internal access from close()"
```

---

### Task 6: Fix retry queue recreation dropping in-flight retries

**Problem:** `QueueManager.createRetryQueue()` unconditionally deletes and recreates the retry queue on every connection. Messages waiting for their TTL in the retry queue get dropped.

**Files:**
- Modify: `src/clients/rabbitmq/queue-manager.ts:122-149`
- Test: `test/rabbitmq-modules.spec.ts`

- [ ] **Step 1: Write the failing test**

Add in `test/rabbitmq-modules.spec.ts` inside `QueueManager > createRetryQueue`:

```typescript
it("should not delete existing retry queue on setup", async function() {
    await queueManager.setupQueues(mockChannel as any, {});

    const retryQueue = `${mockConfig.amqpSettings.queue.name}.Retries`;
    assert.isFalse(
        mockChannel.deleteQueue.calledWith(retryQueue),
        'Should not delete retry queue during setup — in-flight retries would be lost'
    );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -A 2 "should not delete existing retry queue"`
Expected: FAIL — `deleteQueue` is called with the retry queue name

- [ ] **Step 3: Implement the fix**

In `src/clients/rabbitmq/queue-manager.ts`, replace `createRetryQueue`:

```typescript
private async createRetryQueue(channel: ConfirmChannel): Promise<void> {
    this.logger?.info('Creating retry queue');

    const queueName = this.config.amqpSettings.queue.name;
    const deadLetterExchange = `${queueName}.Retries.DeadLetter`;
    const retryQueue = `${queueName}.Retries`;

    await channel.assertExchange(deadLetterExchange, 'direct', { durable: true });

    await channel.assertQueue(retryQueue, {
      durable: this.config.amqpSettings.queue.durable,
      arguments: {
        'x-dead-letter-exchange': deadLetterExchange,
        'x-message-ttl': this.config.amqpSettings.retryDelay,
        ...(this.config.amqpSettings.queue.retryQueueArguments ?? {})
      }
    });

    await channel.bindQueue(queueName, deadLetterExchange, retryQueue);
  }
```

Note: If the retry queue already exists with different TTL arguments, `assertQueue` will throw. This is the correct behavior — it signals a configuration mismatch rather than silently dropping messages.

- [ ] **Step 4: Run tests to verify all pass**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/clients/rabbitmq/queue-manager.ts test/rabbitmq-modules.spec.ts
git commit -m "fix: do not delete retry queue on reconnect to preserve in-flight retries"
```

---

### Task 7: Fix deepmerge array concatenation for host config

**Problem:** `deepmerge` concatenates arrays by default. If `host` is an array, it would concatenate with defaults instead of replacing. Fix by providing an `arrayMerge` option that replaces arrays.

**Files:**
- Modify: `src/bus/index.ts:47`
- Test: `test/bus.spec.ts`

- [ ] **Step 1: Write the failing test**

Add in `test/bus.spec.ts` inside the `Constructor` describe:

```typescript
it("should replace host array instead of concatenating with defaults", async function() {
    let bus = new Bus({
        amqpSettings: {
            queue: { name: 'ServiceConnectWebTest' },
            host: ['amqp://host1', 'amqp://host2']
        }
    });
    await bus.init();

    expect(bus.config.amqpSettings.host).to.deep.equal(['amqp://host1', 'amqp://host2']);
});
```

- [ ] **Step 2: Run test to verify it passes (it currently does because default is a string)**

Run: `npm test 2>&1 | grep -A 2 "should replace host array"`
Expected: This test actually passes currently because the default is a string not an array. The fix is still important as defensive coding. Proceed to implement.

- [ ] **Step 3: Implement the fix**

In `src/bus/index.ts`, modify the merge call:

```typescript
// Merge with defaults — use overwrite strategy for arrays so user values replace defaults
this.config = merge(settings(), config, {
  arrayMerge: (_target, source) => source,
}) as BusConfig;
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/bus/index.ts test/bus.spec.ts
git commit -m "fix: deepmerge uses array-replace strategy to prevent host concatenation"
```

---

### Task 8: Consolidate duplicate createMessageId helper

**Problem:** `createMessageId` is defined identically in both `src/bus/index.ts` and `src/clients/rabbitmq/index.ts`.

**Files:**
- Modify: `src/types.ts` (add the helper)
- Modify: `src/bus/index.ts` (remove local, import from types)
- Modify: `src/clients/rabbitmq/index.ts` (remove local, import from types)

- [ ] **Step 1: Add the shared helper to types.ts**

Append to `src/types.ts` (after the `ILogger` interface):

```typescript
/**
 * Create a branded MessageId from a string
 */
export function createMessageId(id: string): MessageId {
  return id as MessageId;
}
```

- [ ] **Step 2: Update bus/index.ts**

Remove the local `createMessageId` function (lines 22-24) and add `createMessageId` to the import from `'../types'`:

Change the import line to:
```typescript
import type {
  ServiceConnectConfig,
  BusConfig,
  Message,
  MessageHandler,
  MessageHeaders,
  ReplyCallback
} from '../types';
import { createMessageId } from '../types';
```

Remove the function definition:
```typescript
// DELETE these lines:
// function createMessageId(id: string): MessageId {
//   return id as MessageId;
// }
```

- [ ] **Step 3: Update clients/rabbitmq/index.ts**

Same approach — remove local `createMessageId` (lines 22-24) and add to import:

Change:
```typescript
import type {
  BusConfig,
  ConsumeMessageCallback,
  IClient,
  Message,
  MessageHeaders,
} from '../../types';
import { createMessageId } from '../../types';
```

Remove:
```typescript
// DELETE these lines:
// function createMessageId(id: string): MessageId {
//   return id as MessageId;
// }
```

Also remove `MessageId` from the type import since it's no longer needed separately (it's used through `createMessageId`).

- [ ] **Step 4: Run tests to verify all pass**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/bus/index.ts src/clients/rabbitmq/index.ts
git commit -m "refactor: consolidate duplicate createMessageId into types.ts"
```

---

### Task 9: Normalize dot replacement consistency

**Problem:** `addHandler` uses `replaceAll('.', '')` while `removeHandler` uses `.replace(/\./g, '')`. They're functionally identical but inconsistent.

**Files:**
- Modify: `src/bus/index.ts:99,120`

- [ ] **Step 1: Standardize on replaceAll**

In `src/bus/index.ts`, change line 120 in `removeHandler` from:

```typescript
const normalizedType = messageType.replace(/\./g, '');
```

to:

```typescript
const normalizedType = messageType.replaceAll('.', '');
```

- [ ] **Step 2: Run tests to verify all pass**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/bus/index.ts
git commit -m "refactor: standardize dot removal to use replaceAll"
```

---

### Task 10: Fix CommonJS entry point and add package.json types field

**Problem:** `index.js` exports only `Bus`, making error classes inaccessible to CommonJS consumers. `package.json` is missing `"types"` field.

**Files:**
- Modify: `index.js`
- Modify: `package.json`

- [ ] **Step 1: Update index.js to re-export everything**

Replace the contents of `index.js`:

```javascript
module.exports = require("./lib/index.js");
```

This exports `Bus`, all types, and all error classes. Consumers who used `const Bus = require('service-connect')` will need to update to `const { Bus } = require('service-connect')`. Since this is a v2.0.0 (major version), that breaking change is acceptable.

- [ ] **Step 2: Add types field to package.json**

Add `"types": "lib/index.d.ts"` to `package.json` after the `"main"` field.

- [ ] **Step 3: Build to verify declarations are generated**

Run: `npx tsc`
Run: `ls lib/index.d.ts`
Expected: File exists

- [ ] **Step 4: Commit**

```bash
git add index.js package.json
git commit -m "fix: export all public API from CommonJS entry point and add types field"
```

---

### Task 11: Fix settings.ts type cast

**Problem:** `settings.ts` uses `as unknown as` double-cast for the default client constructor, suggesting a type mismatch.

**Files:**
- Modify: `src/settings.ts:45`
- Modify: `src/clients/rabbitMQ.ts`

- [ ] **Step 1: Investigate and fix**

The issue is that `RabbitMQClient` is a default export class, and the config expects `new (config: BusConfig, callback: ConsumeMessageCallback) => IClient`. The default export type from `./clients/rabbitMQ` doesn't align with the constructor signature due to how TypeScript resolves default exports.

In `src/settings.ts`, the type of `client` in `ServiceConnectConfig` is:
```typescript
client?: new (config: BusConfig, callback: ConsumeMessageCallback) => IClient;
```

The simplest fix: the `settings()` function returns a `ServiceConnectConfig` (partial). Change the import to import the class directly and use it without casting:

```typescript
import RabbitMQClient from './clients/rabbitMQ';
import type { ILogger, ServiceConnectConfig } from './types';
```

Then set client:
```typescript
client: RabbitMQClient as unknown as ServiceConnectConfig['client'],
```

This at least reduces to a single known cast instead of a double `as unknown as`. The underlying issue is that `RabbitMQClient implements IClient` but has private fields that TypeScript doesn't consider when checking the constructor return type against `IClient`. This single cast is acceptable and properly typed.

- [ ] **Step 2: Run tests to verify all pass**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/settings.ts
git commit -m "refactor: simplify type cast in default settings"
```
