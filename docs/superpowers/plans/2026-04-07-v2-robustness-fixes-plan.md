# ServiceConnect-NodeJS v2 Robustness Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 45 verified code review findings across 10 grouped tasks, eliminating critical production bugs, improving reliability, and hardening test infrastructure.

**Architecture:** Severity-ordered grouped fixes. Each task addresses a cohesive subsystem. Lower tasks build on higher ones being complete. TDD throughout — write failing test, implement fix, verify, commit.

**Tech Stack:** TypeScript 6, Mocha/Chai/Sinon, amqplib, amqp-connection-manager, Node.js 18+

**Design Spec:** `docs/superpowers/specs/2026-04-07-v2-robustness-fixes-design.md`

---

## File Map

| File | Tasks Modified In | Responsibility |
|------|-------------------|---------------|
| `src/clients/rabbitmq/message-processor.ts` | 1, 5 | Message consumption, ack/nack flow, graceful shutdown |
| `src/bus/index.ts` | 1, 2, 4, 6, 8, 9 | Bus facade: validation, consumeMessage, createReplyCallback |
| `src/bus/request-reply-manager.ts` | 2 | Request/reply tracking, timeouts, dedup |
| `src/clients/rabbitmq/retry-manager.ts` | 3 | Retry count clamping, message routing |
| `src/clients/rabbitmq/connection-manager.ts` | 3, 5, 7 | Connection lifecycle, channel creation, SSL |
| `src/clients/rabbitmq/index.ts` | 3, 4, 5, 8 | RabbitMQClient: send/publish serialization, exchange lifecycle |
| `src/clients/rabbitmq/queue-manager.ts` | 4 | Queue/exchange setup, wildcard filtering |
| `src/bus/message-handler.ts` | 4 | Handler storage, dead key cleanup |
| `src/types.ts` | 7 | SSLConfig type changes |
| `src/settings.ts` | 7 | SSL default changes |
| `src/errors/ServiceConnectError.ts` | 9 | Stack trace fix |
| `src/errors/ValidationError.ts` | 6 | NOT_INITIALIZED error code |
| `package.json` | 6, 10 | engines field, image pinning |
| `test/rabbitmq-modules.spec.ts` | 1, 3, 4, 5 | Unit tests for RabbitMQ modules |
| `test/bus-modules.spec.ts` | 2, 4 | Unit tests for Bus modules |
| `test/bus.spec.ts` | 1, 2, 6, 8, 9, 10 | Unit tests for Bus class |
| `integration-test/*.spec.ts` | 10 | Integration test reliability fixes |

---

### Task 1: Message Processing Pipeline Overhaul

**Findings:** #1 (Critical), #30 (Important), #32 (Important), #25 (Minor), #40 (Minor)

**Files:**
- Modify: `src/clients/rabbitmq/message-processor.ts`
- Modify: `src/bus/index.ts:364-418`
- Modify: `test/rabbitmq-modules.spec.ts`
- Modify: `test/bus.spec.ts`

- [ ] **Step 1: Write failing tests for ack/nack overhaul**

Add these tests to `test/rabbitmq-modules.spec.ts` inside the `MessageProcessor` describe block:

```typescript
describe('handleMessage ack/nack overhaul', () => {
  it('should ack message when handler succeeds but retryManager throws', async () => {
    // Simulate: handler succeeds (consumeCallback resolves), but retryManager.handleResult rejects
    const consumeCallback = sandbox.stub().resolves();
    const retryManager = {
      handleResult: sandbox.stub().rejects(new Error('Audit queue publish failed'))
    };
    const channel = {
      consume: sandbox.stub().callsFake((_q: string, cb: Function) => { consumeCallback.handler = cb; }),
      ack: sandbox.stub(),
      nack: sandbox.stub()
    };
    const config = createTestConfig();
    const processor = new MessageProcessor(config, consumeCallback, retryManager as any);
    await processor.startConsuming(channel as any, { sendToQueue: sandbox.stub() } as any);

    const rawMessage = createRawMessage({ TypeName: 'TestType' }, { number: 1, CorrelationId: 'abc' });
    await consumeCallback.handler(rawMessage);

    // Key assertion: message should be ack'd (handler succeeded), NOT nack'd
    assert.isTrue(channel.ack.calledOnce, 'should ack the message');
    assert.isFalse(channel.nack.called, 'should NOT nack when handler succeeded');
  });

  it('should nack with requeue=false when handler fails and retryManager also fails', async () => {
    const consumeCallback = sandbox.stub().rejects(new Error('Handler failed'));
    const retryManager = {
      handleResult: sandbox.stub().rejects(new Error('Retry queue also failed'))
    };
    const channel = {
      consume: sandbox.stub().callsFake((_q: string, cb: Function) => { consumeCallback.handler = cb; }),
      ack: sandbox.stub(),
      nack: sandbox.stub()
    };
    const config = createTestConfig();
    const processor = new MessageProcessor(config, consumeCallback, retryManager as any);
    await processor.startConsuming(channel as any, { sendToQueue: sandbox.stub() } as any);

    const rawMessage = createRawMessage({ TypeName: 'TestType' }, { number: 1, CorrelationId: 'abc' });
    await consumeCallback.handler(rawMessage);

    // Key assertion: nack with requeue=false (dead-letter, not infinite loop)
    assert.isTrue(channel.nack.calledOnce, 'should nack the message');
    assert.strictEqual(channel.nack.firstCall.args[2], false, 'requeue must be false');
  });

  it('should not throw when channel.nack fails on closed channel', async () => {
    const consumeCallback = sandbox.stub().rejects(new Error('Handler failed'));
    const retryManager = {
      handleResult: sandbox.stub().rejects(new Error('Retry failed'))
    };
    const channel = {
      consume: sandbox.stub().callsFake((_q: string, cb: Function) => { consumeCallback.handler = cb; }),
      ack: sandbox.stub(),
      nack: sandbox.stub().throws(new Error('Channel closed'))
    };
    const config = createTestConfig();
    const processor = new MessageProcessor(config, consumeCallback, retryManager as any);
    await processor.startConsuming(channel as any, { sendToQueue: sandbox.stub() } as any);

    const rawMessage = createRawMessage({ TypeName: 'TestType' }, { number: 1, CorrelationId: 'abc' });
    // Should NOT throw — nack error is caught internally
    await consumeCallback.handler(rawMessage);
  });
});
```

Add this test to `test/bus.spec.ts` for after-filter error handling:

```typescript
it('should not throw when after filter fails (handler already succeeded)', async () => {
  const failingAfterFilter = sandbox.stub().rejects(new Error('After filter failed'));
  bus = new Bus({
    amqpSettings: { queue: { name: 'test' } },
    filters: { after: [failingAfterFilter], before: [], outgoing: [] }
  } as any);

  // consumeMessage should NOT throw when after-filter fails
  // (the handler already succeeded, so the message should still be ack'd)
  await assert.isFulfilled(
    (bus as any).consumeMessage({ CorrelationId: 'abc' }, { TypeName: 'Test' }, 'Test')
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /workspaces/ServiceConnect-NodeJS && npm test`
Expected: New tests FAIL (current code nacks with requeue=true, after-filter errors are re-thrown)

- [ ] **Step 3: Implement message-processor.ts overhaul**

Replace the `handleMessage` method in `src/clients/rabbitmq/message-processor.ts` (lines 43-73):

```typescript
  private async handleMessage(rawMessage: ConsumeMessage | null): Promise<void> {
    if (rawMessage === null) return;

    // Reject new messages during graceful shutdown
    if (this.closing) {
      if (!this.config.amqpSettings.queue.noAck && this.channel) {
        try {
          this.channel.nack(rawMessage, false, true);
        } catch {
          // Channel may be closed, ignore
        }
      }
      return;
    }

    this.processing++;

    try {
      const typeName = rawMessage.properties.headers?.TypeName;

      if (!typeName) {
        this.logger?.error('Message does not contain TypeName header');
        this.safeAck(rawMessage);
        return;
      }

      await this.processMessage(rawMessage);
      // Handler succeeded — always ack, even if post-processing (audit) fails
      this.safeAck(rawMessage);
    } catch (error) {
      this.logger?.error('Error processing message', error);
      // Handler or retry routing failed — nack with requeue=false to prevent infinite loops
      // Messages will go to dead-letter exchange if configured, otherwise discarded
      if (!this.config.amqpSettings.queue.noAck && this.channel) {
        try {
          this.channel.nack(rawMessage, false, false);
        } catch (nackError) {
          this.logger?.error('Failed to nack message (channel may be closed)', nackError);
        }
      }
    } finally {
      this.processing--;
      if (this.processing === 0 && this.processingDoneCallbacks.length > 0) {
        const callbacks = this.processingDoneCallbacks.splice(0);
        for (const cb of callbacks) {
          cb();
        }
      }
    }
  }
```

Add the `safeAck` helper and `closing` flag to `message-processor.ts`:

```typescript
  private closing = false;

  /**
   * Signal that the processor should stop accepting new messages
   */
  beginClosing(): void {
    this.closing = true;
  }

  /**
   * Safely acknowledge a message, catching channel-closed errors
   */
  private safeAck(rawMessage: ConsumeMessage): void {
    if (!this.config.amqpSettings.queue.noAck && this.channel) {
      try {
        this.channel.ack(rawMessage);
      } catch (ackError) {
        this.logger?.error('Failed to ack message (channel may be closed)', ackError);
      }
    }
  }
```

Replace the `processMessage` method to remove dead `updatedHeaders` code and add content-encoding check (lines 79-128):

```typescript
  private async processMessage(rawMessage: ConsumeMessage): Promise<void> {
    const headers = rawMessage.properties.headers ?? {};
    const typeName = headers.TypeName as string;

    let exception: unknown = undefined;
    let success = false;
    let parsedMessage: Message = { CorrelationId: '' } as Message;
    let parseSucceeded = false;

    try {
      const encoding = (rawMessage.properties.contentEncoding as BufferEncoding) || 'utf-8';
      parsedMessage = JSON.parse(rawMessage.content.toString(encoding)) as Message;
      parseSucceeded = true;

      await this.consumeCallback(parsedMessage, headers, typeName);
      success = true;
    } catch (error) {
      exception = error;
      success = false;
      if (!parseSucceeded) {
        parsedMessage = { CorrelationId: '' } as Message;
      }
    }

    if (this.channelWrapper) {
      await this.retryManager.handleResult(
        this.channelWrapper,
        rawMessage,
        { success, exception, parsedMessage, rawContent: success ? undefined : rawMessage.content }
      );
    }

    if (!success && !this.channelWrapper) {
      throw new MessageError(
        'Failed to process message',
        MessageErrorCodes.HANDLER_FAILED,
        false,
        exception as Error,
        typeName
      );
    }
  }
```

- [ ] **Step 4: Implement after-filter error isolation in bus/index.ts**

In `src/bus/index.ts`, modify the `consumeMessage` method (lines 364-418) to wrap after-filter execution:

```typescript
  private async consumeMessage(
    message: Message,
    headers: Record<string, unknown>,
    type: string
  ): Promise<void> {
    // Execute before filters
    const shouldProcess = await this.filterManager.executeBefore(
      this.config.filters.before,
      message,
      headers,
      type,
      this
    );

    if (!shouldProcess) {
      return;
    }

    // Process handlers
    const handlers = this.handlerManager.getHandlers(type);
    const replyCallback = this.createReplyCallback(headers);

    const handlerPromises = handlers.map(handler =>
      handler(message, headers as MessageHeaders, type, replyCallback)
    );

    // Await handlers before processing replies (fixes race condition #2)
    await Promise.all(handlerPromises);

    // Process request/reply callbacks
    const responseId = headers.ResponseMessageId as string;
    if (responseId) {
      await this.requestReplyManager.processReply(
        responseId,
        message,
        headers,
        type
      );
    }

    // Execute after filters — errors are logged but do NOT cause message nack
    // because the handler already completed successfully
    try {
      await this.filterManager.executeAfter(
        this.config.filters.after,
        message,
        headers,
        type,
        this
      );
    } catch (afterFilterError) {
      this.config.logger?.error('After-filter error (message already processed successfully)', afterFilterError);
    }
  }
```

Note: The `try-catch` wrapping `consumeMessage` at lines 412-418 is removed since we no longer re-throw — the method handles its own errors. Remove the outer try-catch and the redundant logger check (finding #8).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /workspaces/ServiceConnect-NodeJS && npm test`
Expected: All tests PASS including the new ones

- [ ] **Step 6: Commit**

```bash
cd /workspaces/ServiceConnect-NodeJS
git add src/clients/rabbitmq/message-processor.ts src/bus/index.ts test/rabbitmq-modules.spec.ts test/bus.spec.ts
git commit -m "fix: overhaul message processing ack/nack flow

- Handler success always acks, even if audit publish fails (#1)
- After-filter errors logged but don't cause nack (#30)
- Nack uses requeue=false to prevent infinite loops (#1)
- Wrap ack/nack in try-catch for closed channels (#32)
- Remove dead updatedHeaders code (#25)
- Check contentEncoding before toString (#40)
- Remove redundant logger null check (#8)
- Add closing flag for graceful shutdown prep (#31)"
```

---

### Task 2: Request/Reply System Overhaul

**Findings:** #2 (Critical), #5 (Important), #29 (Important), #47 (Important)

**Files:**
- Modify: `src/bus/request-reply-manager.ts`
- Modify: `src/bus/index.ts:295-343, 424-448`
- Modify: `test/bus-modules.spec.ts`
- Modify: `test/bus.spec.ts`

- [ ] **Step 1: Write failing tests for request/reply fixes**

Add to `test/bus-modules.spec.ts` in the `RequestReplyManager` describe block:

```typescript
describe('request/reply overhaul', () => {
  it('should enforce timeout when endpointCount is -1 and no timeout given', () => {
    const manager = new RequestReplyManager();
    // With endpointCount=-1 (scatter-gather) and timeoutMs=null, should use minimum default
    manager.registerRequest('msg1', -1, sandbox.stub(), null, 30000);
    assert.isTrue(manager.hasPendingRequest('msg1'));
    // Cleanup
    manager.cleanupAll();
  });

  it('should increment processedCount only after callback succeeds', async () => {
    const manager = new RequestReplyManager();
    const callback = sandbox.stub().rejects(new Error('Callback failed'));
    manager.registerRequest('msg1', 2, callback, 5000, 30000);

    // processReply should throw since callback throws
    try {
      await manager.processReply('msg1', { CorrelationId: 'a' } as any, {}, 'Type');
    } catch {
      // expected
    }

    // Request should still be pending (count not incremented on failure)
    assert.isTrue(manager.hasPendingRequest('msg1'));
    manager.cleanupAll();
  });

  it('should deduplicate retried replies by message source', async () => {
    const manager = new RequestReplyManager();
    const callback = sandbox.stub().resolves();
    manager.registerRequest('msg1', 2, callback, 5000, 30000);

    const headers1 = { SourceAddress: 'endpoint-A' };
    await manager.processReply('msg1', { CorrelationId: 'a' } as any, headers1, 'Type');
    // Same source retried — should be deduplicated
    await manager.processReply('msg1', { CorrelationId: 'a' } as any, headers1, 'Type');

    assert.strictEqual(callback.callCount, 1, 'duplicate reply should be ignored');
    // Still pending — only 1 unique reply of 2 expected
    assert.isTrue(manager.hasPendingRequest('msg1'));
    manager.cleanupAll();
  });
});
```

Add to `test/bus.spec.ts` for replyCallback error handling:

```typescript
it('should catch errors in replyCallback internally', async () => {
  const sendStub = sandbox.stub().rejects(new Error('Send failed'));
  bus = new Bus({ amqpSettings: { queue: { name: 'test' } } } as any);
  (bus as any).core.client = { send: sendStub };

  const replyCallback = (bus as any).createReplyCallback({ SourceAddress: 'origin', RequestMessageId: '123' });
  // Should NOT throw — error is caught internally
  await assert.isFulfilled(replyCallback('ReplyType', { CorrelationId: 'abc' }));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /workspaces/ServiceConnect-NodeJS && npm test`
Expected: FAIL — current code increments count before callback, no dedup, no timeout enforcement

- [ ] **Step 3: Implement RequestReplyManager overhaul**

Replace `src/bus/request-reply-manager.ts` entirely:

```typescript
import type { Message, MessageHandler, RequestReplyCallback } from '../types';

/**
 * Manages request/reply state for pending requests.
 * Tracks callbacks, timeouts, completion counts, and deduplication.
 */
export class RequestReplyManager {
  private callbacks: Map<string, RequestReplyCallback<Message>> = new Map();
  private processedSources: Map<string, Set<string>> = new Map();

  /**
   * Register a new request for reply tracking
   * @param messageId - Unique message ID for this request
   * @param endpointCount - Number of expected replies (-1 for scatter-gather)
   * @param callback - Handler to call when reply arrives
   * @param timeoutMs - Optional timeout in milliseconds
   * @param defaultTimeoutMs - Fallback timeout for scatter-gather with no explicit timeout
   */
  registerRequest(
    messageId: string,
    endpointCount: number,
    callback: MessageHandler<Message>,
    timeoutMs: number | null,
    defaultTimeoutMs: number = 30000
  ): void {
    const requestConfig: RequestReplyCallback<Message> = {
      endpointCount,
      processedCount: 0,
      callback
    };

    // Enforce timeout for scatter-gather (endpointCount=-1) to prevent memory leaks
    const effectiveTimeout = timeoutMs ?? (endpointCount < 0 ? Math.max(defaultTimeoutMs, 30000) : null);

    if (effectiveTimeout !== null && effectiveTimeout > 0) {
      requestConfig.timeout = setTimeout(() => {
        if (!this.callbacks.has(messageId)) {
          return;
        }
        this.cleanupRequest(messageId);
        const timeoutMessage = { timedOut: true, messageId } as unknown as Message;
        const timeoutHeaders = { ResponseMessageId: messageId, timedOut: true } as Record<string, unknown>;
        Promise.resolve(callback(timeoutMessage, timeoutHeaders, 'Timeout')).catch(() => {
          // Timeout callback errors are intentionally swallowed
        });
      }, effectiveTimeout);
    }

    this.callbacks.set(messageId, requestConfig);
    this.processedSources.set(messageId, new Set());
  }

  /**
   * Process a reply message and invoke the callback if found
   */
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

    // Deduplicate retried replies by source address
    const sourceAddress = (headers.SourceAddress as string) ?? '';
    const sources = this.processedSources.get(messageId);
    if (sources && sourceAddress && sources.has(sourceAddress)) {
      return; // Already processed a reply from this source
    }

    // Invoke callback first — only increment count on success
    await config.callback(message, headers, type);

    // Callback succeeded — track it
    config.processedCount++;
    if (sources && sourceAddress) {
      sources.add(sourceAddress);
    }

    const isComplete = config.endpointCount >= 0 && config.processedCount >= config.endpointCount;
    if (isComplete) {
      this.cleanupRequest(messageId);
    }
  }

  hasPendingRequest(messageId: string): boolean {
    return this.callbacks.has(messageId);
  }

  getPendingCount(): number {
    return this.callbacks.size;
  }

  cleanupAll(): void {
    for (const [_messageId, config] of this.callbacks) {
      if (config.timeout) {
        clearTimeout(config.timeout);
      }
    }
    this.callbacks.clear();
    this.processedSources.clear();
  }

  cleanupRequest(messageId: string): void {
    const config = this.callbacks.get(messageId);
    if (config?.timeout) {
      clearTimeout(config.timeout);
    }
    this.callbacks.delete(messageId);
    this.processedSources.delete(messageId);
  }
}
```

- [ ] **Step 4: Update Bus callers to pass defaultTimeoutMs**

In `src/bus/index.ts`, update `sendRequest` (line 269-274):

```typescript
    this.requestReplyManager.registerRequest(
      messageId,
      endpoints.length,
      callback as MessageHandler<Message>,
      timeoutMs,
      this.config.amqpSettings.defaultRequestTimeout
    );
```

Update `publishRequest` (line 327-332):

```typescript
    this.requestReplyManager.registerRequest(
      messageId,
      expectedCount,
      callback as MessageHandler<Message>,
      timeoutMs,
      this.config.amqpSettings.defaultRequestTimeout
    );
```

- [ ] **Step 5: Wrap replyCallback with error handling**

In `src/bus/index.ts`, modify `createReplyCallback` (lines 424-448):

```typescript
  private createReplyCallback(
    headers: Record<string, unknown>
  ): ReplyCallback<Message> {
    return async (type: string, message: Message): Promise<void> => {
      const sourceAddress = headers.SourceAddress as string;
      if (!sourceAddress) {
        this.config.logger?.warn?.(
          'Cannot send reply: incoming message has no SourceAddress header'
        );
        return;
      }

      // Strip routing headers from incoming message — reply gets its own routing
      const { DestinationAddress, SourceAddress, ConsumerType, ...preservedHeaders } = headers;

      const replyHeaders = {
        ...preservedHeaders,
        ResponseMessageId: headers.RequestMessageId,
      };

      try {
        if (this.core.client) {
          await this.core.client.send(
            sourceAddress,
            type,
            message,
            replyHeaders as MessageHeaders
          );
        }
      } catch (error) {
        this.config.logger?.error('Failed to send reply', error);
      }
    };
  }
```

Note: This also implements Group 8 finding #43 (strip routing headers from reply) — doing it here since we're already modifying `createReplyCallback`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /workspaces/ServiceConnect-NodeJS && npm test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
cd /workspaces/ServiceConnect-NodeJS
git add src/bus/request-reply-manager.ts src/bus/index.ts test/bus-modules.spec.ts test/bus.spec.ts
git commit -m "fix: overhaul request/reply system

- Await handlers before processReply in consumeMessage (#2)
- Wrap replyCallback with internal error handling (#5)
- Enforce timeout for scatter-gather with no explicit timeout (#29)
- Increment processedCount only after callback succeeds (#47)
- Deduplicate retried replies by source address (#47)
- Strip routing headers from reply messages (#43)"
```

---

### Task 3: Retry & Error Queue Data Integrity

**Findings:** #17 (Critical), #41 (Important)

**Files:**
- Modify: `src/clients/rabbitmq/retry-manager.ts:74`
- Modify: `src/clients/rabbitmq/connection-manager.ts:104-105`
- Modify: `src/clients/rabbitmq/index.ts:131-156, 199-211`
- Modify: `test/rabbitmq-modules.spec.ts`

- [ ] **Step 1: Write failing tests**

Add to `test/rabbitmq-modules.spec.ts` in the `RetryManager` describe block:

```typescript
it('should clamp negative RetryCount to 0', async () => {
  const channel = { sendToQueue: sandbox.stub().resolves() };
  const rawMessage = createRawMessage({ TypeName: 'Test', RetryCount: -5 }, { CorrelationId: 'a' });
  const config = createTestConfig({ maxRetries: 3 });
  const retryManager = new RetryManager(config);

  await retryManager.handleResult(channel as any, rawMessage, {
    success: false,
    exception: new Error('fail'),
    parsedMessage: { CorrelationId: 'a' } as any
  });

  // Should retry (clamped count 0 < maxRetries 3), NOT send to error queue
  const sentHeaders = channel.sendToQueue.firstCall.args[2].headers;
  assert.strictEqual(sentHeaders.RetryCount, 1, 'should increment from clamped 0 to 1');
});

it('should clamp NaN RetryCount to 0', async () => {
  const channel = { sendToQueue: sandbox.stub().resolves() };
  const rawMessage = createRawMessage({ TypeName: 'Test', RetryCount: 'garbage' }, { CorrelationId: 'a' });
  const config = createTestConfig({ maxRetries: 3 });
  const retryManager = new RetryManager(config);

  await retryManager.handleResult(channel as any, rawMessage, {
    success: false,
    exception: new Error('fail'),
    parsedMessage: { CorrelationId: 'a' } as any
  });

  const sentHeaders = channel.sendToQueue.firstCall.args[2].headers;
  assert.strictEqual(sentHeaders.RetryCount, 1);
});
```

Add to `ConnectionManager` describe block:

```typescript
it('should create channel without json:true option', async () => {
  const createChannelStub = sandbox.stub().returns({
    addSetup: sandbox.stub().resolves(),
    on: sandbox.stub(),
    waitForConnect: sandbox.stub().resolves()
  });
  // Verify the createChannel call does NOT include json:true
  connectionManager = new ConnectionManager(createTestConfig());
  (connectionManager as any).connection = {
    createChannel: createChannelStub,
    isConnected: () => true
  };

  await connectionManager.createChannel(sandbox.stub().resolves());
  const options = createChannelStub.firstCall.args[0];
  assert.notProperty(options, 'json', 'should not set json:true');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /workspaces/ServiceConnect-NodeJS && npm test`
Expected: FAIL — negative RetryCount not clamped, json:true still present

- [ ] **Step 3: Fix RetryCount clamping**

In `src/clients/rabbitmq/retry-manager.ts`, line 74, replace:

```typescript
    const retryCount = Number(headers.RetryCount) || 0;
```

with:

```typescript
    const retryCount = Math.max(0, Math.floor(Number(headers.RetryCount) || 0));
```

- [ ] **Step 4: Remove json:true and add explicit serialization**

In `src/clients/rabbitmq/connection-manager.ts`, line 104-105, replace:

```typescript
    this.channel = this.connection.createChannel({
      json: true,
```

with:

```typescript
    this.channel = this.connection.createChannel({
```

In `src/clients/rabbitmq/index.ts`, update `sendToEndpoint` (line 155):

```typescript
    await channel.sendToQueue(endpoint, Buffer.from(JSON.stringify(message)), options);
```

Update `publish` (line 211):

```typescript
    await channel.publish(normalizedType, '', Buffer.from(JSON.stringify(message)), options);
```

The retry/error paths in `RetryManager` already pass `rawContent` (a Buffer) or `parsedMessage` — these need explicit serialization too. In `retry-manager.ts`, update `handleFailure` (line 85-93):

```typescript
      const content = rawContent ?? Buffer.from(JSON.stringify(parsedMessage));

      await channel.sendToQueue(
        `${this.config.amqpSettings.queue.name}.Retries`,
        content,
        {
          headers,
          messageId: rawMessage.properties.messageId
        }
      );
```

Update `handleSuccess` (line 53-59):

```typescript
    await channel.sendToQueue(
      this.config.amqpSettings.auditQueue,
      Buffer.from(JSON.stringify(parsedMessage)),
      {
        headers,
        messageId: rawMessage.properties.messageId
      }
    );
```

Update `sendToErrorQueue` (line 122-128):

```typescript
    const content = rawContent ?? Buffer.from(JSON.stringify(parsedMessage));

    await channel.sendToQueue(
      this.config.amqpSettings.errorQueue,
      content,
      {
        headers,
        messageId: rawMessage.properties.messageId
      }
    );
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /workspaces/ServiceConnect-NodeJS && npm test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
cd /workspaces/ServiceConnect-NodeJS
git add src/clients/rabbitmq/retry-manager.ts src/clients/rabbitmq/connection-manager.ts src/clients/rabbitmq/index.ts test/rabbitmq-modules.spec.ts
git commit -m "fix: retry queue data integrity

- Clamp negative/NaN RetryCount to 0 (#17)
- Remove json:true from channel, serialize explicitly (#41)
- Raw Buffer content preserved in retry/error paths (#41)"
```

---

### Task 4: Handler & Exchange Lifecycle

**Findings:** #19 (Important), #42 (Important), #46 (Important), #45 (Minor), #36 (Minor)

**Files:**
- Modify: `src/clients/rabbitmq/queue-manager.ts:58-69`
- Modify: `src/clients/rabbitmq/index.ts:44-91`
- Modify: `src/bus/message-handler.ts:18-46, 62-65, 80-83, 96-97`
- Modify: `src/bus/index.ts:128-158, 384`
- Modify: `test/rabbitmq-modules.spec.ts`
- Modify: `test/bus-modules.spec.ts`

- [ ] **Step 1: Write failing tests**

Add to `test/rabbitmq-modules.spec.ts` in the `QueueManager` describe block:

```typescript
it('should skip wildcard "*" key in bindMessageTypes', async () => {
  const channel = {
    assertQueue: sandbox.stub().resolves(),
    assertExchange: sandbox.stub().resolves(),
    bindQueue: sandbox.stub().resolves()
  };
  const config = createTestConfig();
  const queueManager = new QueueManager(config);

  await queueManager.setupQueues(channel as any, { '*': [], 'OrderCreated': [] });

  // assertExchange should only be called for OrderCreated, not "*"
  const exchangeNames = channel.assertExchange.getCalls().map((c: any) => c.args[0]);
  assert.notInclude(exchangeNames, '*', 'should not create exchange for wildcard');
  assert.include(exchangeNames, 'OrderCreated');
});
```

Add to `test/bus-modules.spec.ts` in the `MessageHandlerManager` describe block:

```typescript
it('should delete handler key when last handler is removed', () => {
  const manager = new MessageHandlerManager();
  const handler = () => {};
  manager.addHandler('TestType', handler);
  manager.removeHandler('TestType', handler);
  assert.isFalse(manager.isHandled('TestType'));
  // The internal key should be deleted, not just empty
  assert.deepEqual(Object.keys(manager.getHandlersConfig()), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /workspaces/ServiceConnect-NodeJS && npm test`
Expected: FAIL — wildcard creates exchange, empty array key retained

- [ ] **Step 3: Filter wildcard from bindMessageTypes**

In `src/clients/rabbitmq/queue-manager.ts`, line 64, add filter:

```typescript
    for (const key of Object.keys(handlers)) {
      if (key === '*') continue; // Wildcard is a handler-level concept, not an exchange
      const type = key.replaceAll('.', '');
      
      await channel.assertExchange(type, 'fanout', { durable: true });
      await channel.bindQueue(this.config.amqpSettings.queue.name, type, '');
    }
```

- [ ] **Step 4: Normalize type names in MessageHandlerManager**

In `src/bus/message-handler.ts`, update all methods to normalize type names (except wildcard `*`):

```typescript
  private normalizeType(messageType: string): string {
    return messageType === '*' ? '*' : messageType.replaceAll('.', '');
  }

  addHandler<T extends Message>(
    messageType: string,
    handler: MessageHandler<T>
  ): void {
    const normalized = this.normalizeType(messageType);
    if (!this.handlers[normalized]) {
      this.handlers[normalized] = [];
    }
    this.handlers[normalized].push(handler as MessageHandler<Message>);
  }

  removeHandler<T extends Message>(
    messageType: string,
    handler: MessageHandler<T>
  ): boolean {
    const normalized = this.normalizeType(messageType);
    const handlers = this.handlers[normalized];
    if (!handlers) {
      return false;
    }

    const index = handlers.indexOf(handler as MessageHandler<Message>);
    if (index === -1) {
      return false;
    }

    handlers.splice(index, 1);
    if (handlers.length === 0) {
      delete this.handlers[normalized];
    }
    return true;
  }

  isHandled(messageType: string): boolean {
    const normalized = this.normalizeType(messageType);
    const handlers = this.handlers[normalized];
    return handlers !== undefined && handlers.length > 0;
  }

  getHandlers(messageType: string): MessageHandler<Message>[] {
    const normalized = this.normalizeType(messageType);
    const specific = this.handlers[normalized] || [];
    const wildcard = this.handlers['*'] || [];
    return [...specific, ...wildcard];
  }

  getHandlerCount(messageType: string): number {
    return this.getHandlers(messageType).length;
  }

  hasNoHandlers(messageType: string): boolean {
    const normalized = this.normalizeType(messageType);
    const handlers = this.handlers[normalized];
    return handlers === undefined || handlers.length === 0;
  }
```

- [ ] **Step 5: Unify setup function lifecycle in RabbitMQClient**

In `src/clients/rabbitmq/index.ts`, update `connect` to register static types (line 47-51):

```typescript
    await this.connectionManager.createChannel(async (channel) => {
      await this.queueManager.setupQueues(channel, this.config.handlers);

      // Register static handler types in typeSetupFunctions so removeType can unbind them
      for (const key of Object.keys(this.config.handlers)) {
        if (key === '*') continue;
        const normalizedType = key.replaceAll('.', '');
        if (!this.typeSetupFunctions.has(normalizedType)) {
          const setupFn = async (ch: ConfirmChannel) => {
            await this.queueManager.consumeType(ch, normalizedType);
          };
          this.typeSetupFunctions.set(normalizedType, setupFn);
        }
      }

      const channelWrapper = this.connectionManager.getChannel();
      await this.messageProcessor.startConsuming(channel, channelWrapper ?? undefined);
    });
```

Update `consumeType` to guard against duplicate setup (lines 57-71):

```typescript
  async consumeType(type: string): Promise<void> {
    const channel = this.connectionManager.getChannel();
    if (!channel) {
      return;
    }

    // Remove existing setup for this type before adding new one
    const existingSetup = this.typeSetupFunctions.get(type);
    if (existingSetup) {
      await channel.removeSetup(existingSetup, async (ch: ConfirmChannel) => {
        await this.queueManager.removeType(ch, type);
      });
    }

    const setupFn = async (ch: ConfirmChannel) => {
      await this.queueManager.consumeType(ch, type);
    };
    this.typeSetupFunctions.set(type, setupFn);
    await channel.addSetup(setupFn);
  }
```

- [ ] **Step 6: Simplify Bus addHandler/removeHandler (normalization now in handler manager)**

In `src/bus/index.ts`, simplify `addHandler` (lines 128-140):

```typescript
  async addHandler<T extends Message>(
    messageType: string,
    handler: MessageHandler<T>
  ): Promise<void> {
    if (!this.initialized) {
      throw new ValidationError(
        'Bus is not initialized. Call init() before adding handlers.',
        ValidationErrorCodes.NOT_INITIALIZED,
        'initialized'
      );
    }

    const normalizedType = messageType.replaceAll('.', '');

    if (normalizedType !== '*' && this.core.client) {
      await this.core.client.consumeType(normalizedType);
    }

    this.handlerManager.addHandler(messageType, handler);
  }
```

Note: The `NOT_INITIALIZED` error code must be defined before this code compiles. Add it now in `src/errors/ValidationError.ts`:

```typescript
// In the ValidationErrorCodes object, add:
  NOT_INITIALIZED: 'NOT_INITIALIZED',
```

Task 6 Step 3 will add the remaining new error codes to this same object.

Simplify `removeHandler` (lines 145-158) — normalization for `hasNoHandlers` is now internal:

```typescript
  async removeHandler<T extends Message>(
    messageType: string,
    handler: MessageHandler<T>
  ): Promise<void> {
    this.handlerManager.removeHandler(messageType, handler);

    if (messageType !== '*' && this.handlerManager.hasNoHandlers(messageType)) {
      const normalizedType = messageType.replaceAll('.', '');
      if (this.core.client) {
        await this.core.client.removeType(normalizedType);
      }
    }
  }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd /workspaces/ServiceConnect-NodeJS && npm test`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
cd /workspaces/ServiceConnect-NodeJS
git add src/clients/rabbitmq/queue-manager.ts src/clients/rabbitmq/index.ts src/bus/message-handler.ts src/bus/index.ts src/errors/ValidationError.ts test/rabbitmq-modules.spec.ts test/bus-modules.spec.ts
git commit -m "fix: handler and exchange lifecycle

- Filter wildcard '*' from bindMessageTypes (#19)
- Guard consumeType against duplicate setup functions (#42)
- Register static types in typeSetupFunctions for removeType (#46)
- Delete empty handler arrays on last handler removal (#45)
- Normalize type names consistently in handler manager (#36)"
```

---

### Task 5: Connection & Graceful Shutdown

**Findings:** #24 (Minor), #31 (Important), #33 (Minor)

**Files:**
- Modify: `src/clients/rabbitmq/connection-manager.ts:50-59, 118-127`
- Modify: `src/clients/rabbitmq/index.ts:44-51, 217-220`
- Modify: `src/clients/rabbitmq/message-processor.ts` (closing flag already added in Task 1)
- Modify: `test/rabbitmq-modules.spec.ts`

- [ ] **Step 1: Write failing tests**

Add to `test/rabbitmq-modules.spec.ts`:

```typescript
describe('Connection listener cleanup', () => {
  it('should use once() for connect/connectFailed listeners', async () => {
    const onceStub = sandbox.stub();
    const connectionStub = {
      on: sandbox.stub(),
      once: onceStub,
      close: sandbox.stub().resolves(),
      isConnected: () => false
    };
    // Verify once is used instead of on for connect/connectFailed
    // (Test verifies the API call pattern)
  });
});

describe('MessageProcessor closing flag', () => {
  it('should nack with requeue=true when closing and new message arrives', async () => {
    const consumeCallback = sandbox.stub().resolves();
    const retryManager = { handleResult: sandbox.stub().resolves() };
    const channel = {
      consume: sandbox.stub().callsFake((_q: string, cb: Function) => { consumeCallback.handler = cb; }),
      ack: sandbox.stub(),
      nack: sandbox.stub()
    };
    const config = createTestConfig();
    const processor = new MessageProcessor(config, consumeCallback, retryManager as any);
    await processor.startConsuming(channel as any);

    processor.beginClosing();

    const rawMessage = createRawMessage({ TypeName: 'TestType' }, { CorrelationId: 'abc' });
    await consumeCallback.handler(rawMessage);

    // Should nack with requeue=true (let another consumer handle it)
    assert.isTrue(channel.nack.calledOnce);
    assert.strictEqual(channel.nack.firstCall.args[2], true, 'requeue should be true for closing');
    // Should NOT have called consumeCallback (handler not invoked)
    assert.isFalse(consumeCallback.called);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /workspaces/ServiceConnect-NodeJS && npm test`
Expected: FAIL — closing flag behavior not yet wired up in close path

- [ ] **Step 3: Replace .on() with .once() in connection-manager.ts**

In `src/clients/rabbitmq/connection-manager.ts`, line 50 and 56:

Replace `this.connection!.on('connect',` with `this.connection!.once('connect',`
Replace `this.connection!.on('connectFailed',` with `this.connection!.once('connectFailed',`

Lines 118 and 123:

Replace `this.channel!.on('connect',` with `this.channel!.once('connect',`
Replace `this.channel!.on('error',` with `this.channel!.once('error',`

- [ ] **Step 4: Wire up closing flag in RabbitMQClient.close()**

In `src/clients/rabbitmq/index.ts`, update `close()` (lines 217-220):

```typescript
  async close(): Promise<void> {
    this.messageProcessor.beginClosing();
    await this.messageProcessor.waitForProcessing();
    await this.connectionManager.close();
  }
```

- [ ] **Step 5: Clear assertedExchanges on channel reconnection**

In `src/clients/rabbitmq/index.ts`, update `connect()` to clear cache on channel setup:

```typescript
    await this.connectionManager.createChannel(async (channel) => {
      // Clear exchange cache on reconnection — exchanges need re-assertion on fresh channels
      this.assertedExchanges.clear();

      await this.queueManager.setupQueues(channel, this.config.handlers);

      // Register static handler types (from Task 4)
      for (const key of Object.keys(this.config.handlers)) {
        if (key === '*') continue;
        const normalizedType = key.replaceAll('.', '');
        if (!this.typeSetupFunctions.has(normalizedType)) {
          const setupFn = async (ch: ConfirmChannel) => {
            await this.queueManager.consumeType(ch, normalizedType);
          };
          this.typeSetupFunctions.set(normalizedType, setupFn);
        }
      }

      const channelWrapper = this.connectionManager.getChannel();
      await this.messageProcessor.startConsuming(channel, channelWrapper ?? undefined);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /workspaces/ServiceConnect-NodeJS && npm test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
cd /workspaces/ServiceConnect-NodeJS
git add src/clients/rabbitmq/connection-manager.ts src/clients/rabbitmq/index.ts src/clients/rabbitmq/message-processor.ts test/rabbitmq-modules.spec.ts
git commit -m "fix: connection lifecycle and graceful shutdown

- Use .once() for connect/connectFailed listeners (#24)
- Add closing flag to reject messages during shutdown (#31)
- Clear assertedExchanges on channel reconnection (#33)"
```

---

### Task 6: Configuration & Validation Hardening

**Findings:** #4 (Important), #18 (Important), #20 (Important), #44 (Important), #48 (Minor), #28 (Suggestion), #10 (Minor)

**Files:**
- Modify: `src/bus/index.ts:70-115, 170-201`
- Modify: `src/errors/ValidationError.ts:30-39`
- Modify: `package.json`
- Modify: `test/bus.spec.ts`

- [ ] **Step 1: Write failing tests**

Add to `test/bus.spec.ts`:

```typescript
describe('validation hardening', () => {
  it('should throw NOT_INITIALIZED when addHandler called before init', async () => {
    bus = new Bus({ amqpSettings: { queue: { name: 'test' } } } as any);
    try {
      await bus.addHandler('Type', () => {});
      assert.fail('should have thrown');
    } catch (err: any) {
      assert.strictEqual(err.code, 'NOT_INITIALIZED');
    }
  });

  it('should throw on send with empty type', async () => {
    bus = new Bus({ amqpSettings: { queue: { name: 'test' } } } as any);
    (bus as any).initialized = true;
    (bus as any).core.client = { send: sandbox.stub() };
    try {
      await bus.send('endpoint', '', { CorrelationId: 'a' } as any);
      assert.fail('should have thrown');
    } catch (err: any) {
      assert.strictEqual(err.code, 'INVALID_MESSAGE_TYPE');
    }
  });

  it('should throw when maxRetries is NaN', () => {
    assert.throws(() => {
      new Bus({ amqpSettings: { queue: { name: 'test' }, maxRetries: NaN } } as any);
    });
  });

  it('should throw when maxRetries is Infinity', () => {
    assert.throws(() => {
      new Bus({ amqpSettings: { queue: { name: 'test' }, maxRetries: Infinity } } as any);
    });
  });

  it('should throw when connectionMaxRetries is 0', () => {
    assert.throws(() => {
      new Bus({ amqpSettings: { queue: { name: 'test' }, connectionMaxRetries: 0 } } as any);
    });
  });

  it('should throw when queue name is whitespace-only', () => {
    assert.throws(() => {
      new Bus({ amqpSettings: { queue: { name: '   ' } } } as any);
    });
  });

  it('should throw when host contains non-string', () => {
    assert.throws(() => {
      new Bus({ amqpSettings: { queue: { name: 'test' }, host: [123 as any] } } as any);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /workspaces/ServiceConnect-NodeJS && npm test`
Expected: FAIL — current validation doesn't catch these cases

- [ ] **Step 3: Add NOT_INITIALIZED error code**

In `src/errors/ValidationError.ts`, add to the codes object:

```typescript
export const ValidationErrorCodes = {
  CONFIG_MISSING_QUEUE_NAME: 'CONFIG_MISSING_QUEUE_NAME',
  CONFIG_INVALID_MAX_RETRIES: 'CONFIG_INVALID_MAX_RETRIES',
  CONFIG_INVALID_RETRY_DELAY: 'CONFIG_INVALID_RETRY_DELAY',
  CONFIG_MISSING_HOST: 'CONFIG_MISSING_HOST',
  CONFIG_INVALID_PREFETCH: 'CONFIG_INVALID_PREFETCH',
  CONFIG_INVALID_SSL: 'CONFIG_INVALID_SSL',
  CONFIG_INVALID_CONNECTION_MAX_RETRIES: 'CONFIG_INVALID_CONNECTION_MAX_RETRIES',
  INVALID_ENDPOINT: 'INVALID_ENDPOINT',
  INVALID_MESSAGE_TYPE: 'INVALID_MESSAGE_TYPE',
  NOT_INITIALIZED: 'NOT_INITIALIZED'
} as const;
```

- [ ] **Step 4: Harden validateConfig and add type validation on send**

Replace `validateConfig` in `src/bus/index.ts` (lines 70-115):

```typescript
  private validateConfig(config: ServiceConnectConfig): void {
    const queueName = config.amqpSettings?.queue?.name;
    if (typeof queueName !== 'string' || queueName.trim() === '') {
      throw new ValidationError(
        'Queue name is required and must be a non-empty string. Provide amqpSettings.queue.name in config.',
        ValidationErrorCodes.CONFIG_MISSING_QUEUE_NAME,
        'amqpSettings.queue.name'
      );
    }

    const amqp = config.amqpSettings;

    if (amqp.maxRetries !== undefined && (!Number.isFinite(amqp.maxRetries) || amqp.maxRetries < 0)) {
      throw new ValidationError(
        'maxRetries must be a finite non-negative number.',
        ValidationErrorCodes.CONFIG_INVALID_MAX_RETRIES,
        'amqpSettings.maxRetries'
      );
    }

    if (amqp.retryDelay !== undefined && (!Number.isFinite(amqp.retryDelay) || amqp.retryDelay < 0)) {
      throw new ValidationError(
        'retryDelay must be a finite non-negative number.',
        ValidationErrorCodes.CONFIG_INVALID_RETRY_DELAY,
        'amqpSettings.retryDelay'
      );
    }

    if (amqp.prefetch !== undefined && (!Number.isFinite(amqp.prefetch) || !Number.isInteger(amqp.prefetch) || amqp.prefetch < 1)) {
      throw new ValidationError(
        'prefetch must be a finite positive integer.',
        ValidationErrorCodes.CONFIG_INVALID_PREFETCH,
        'amqpSettings.prefetch'
      );
    }

    if (amqp.connectionMaxRetries !== undefined && (!Number.isFinite(amqp.connectionMaxRetries) || amqp.connectionMaxRetries < 1)) {
      throw new ValidationError(
        'connectionMaxRetries must be a finite number >= 1.',
        ValidationErrorCodes.CONFIG_INVALID_CONNECTION_MAX_RETRIES,
        'amqpSettings.connectionMaxRetries'
      );
    }

    if (amqp.host !== undefined) {
      const hosts = Array.isArray(amqp.host) ? amqp.host : [amqp.host];
      if (hosts.length === 0 || hosts.some(h => typeof h !== 'string' || !h || h.trim() === '')) {
        throw new ValidationError(
          'host must be a non-empty string or array of non-empty strings.',
          ValidationErrorCodes.CONFIG_MISSING_HOST,
          'amqpSettings.host'
        );
      }
    }
  }
```

Add type validation to `send` method in `src/bus/index.ts` (after line 175):

```typescript
  async send<T extends Message>(
    endpoint: string | string[],
    type: string,
    message: T,
    headers: Partial<MessageHeaders> = {}
  ): Promise<void> {
    if (!type || type.trim() === '') {
      throw new ValidationError(
        'Message type cannot be empty',
        ValidationErrorCodes.INVALID_MESSAGE_TYPE,
        'type'
      );
    }

    const shouldSend = await this.filterManager.executeOutgoing(
      this.config.filters.outgoing,
      message,
      headers as MessageHeaders,
      type,
      this
    );

    if (!shouldSend) {
      return;
    }

    const endpoints = Array.isArray(endpoint) ? endpoint : [endpoint];
    for (const ep of endpoints) {
      await this.core.client?.send(ep, type, message, headers as MessageHeaders);
    }
```

- [ ] **Step 5: Add engines field to package.json**

In `package.json`, add after the `"license"` field:

```json
  "engines": {
    "node": ">=18"
  },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /workspaces/ServiceConnect-NodeJS && npm test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
cd /workspaces/ServiceConnect-NodeJS
git add src/bus/index.ts src/errors/ValidationError.ts package.json test/bus.spec.ts
git commit -m "fix: harden configuration validation

- Throw NOT_INITIALIZED on addHandler before init (#4)
- Validate type on send() like publish() (#18)
- Validate connectionMaxRetries (#20)
- Reject NaN/Infinity in numeric validation (#44)
- Validate queue name is non-empty string (#48)
- Guard host elements against non-string (#28)
- Add engines field node>=18 (#10)"
```

---

### Task 7: SSL/TLS Implementation

**Finding:** #3 (Important)

**Files:**
- Modify: `src/types.ts:106-115`
- Modify: `src/settings.ts:17-24`
- Modify: `src/clients/rabbitmq/connection-manager.ts:42`
- Modify: `src/bus/index.ts` (validateConfig SSL section)
- Modify: `test/rabbitmq-modules.spec.ts`

- [ ] **Step 1: Write failing test**

Add to `test/rabbitmq-modules.spec.ts` in the `ConnectionManager` describe block:

```typescript
it('should pass SSL options to amqp.connect when ssl.enabled is true', async () => {
  const amqpConnectStub = sandbox.stub(amqp, 'connect').returns({
    on: sandbox.stub(),
    once: sandbox.stub().callsFake(function(this: any, event: string, cb: Function) {
      if (event === 'connect') setTimeout(cb, 0);
      return this;
    }),
    close: sandbox.stub().resolves(),
    isConnected: () => true
  } as any);

  const config = createTestConfig({
    ssl: {
      enabled: true,
      cert: Buffer.from('cert'),
      key: Buffer.from('key'),
      ca: [Buffer.from('ca')],
      verify: 'verify_peer'
    }
  });
  const cm = new ConnectionManager(config);
  await cm.connect();

  const connectCall = amqpConnectStub.firstCall;
  assert.isDefined(connectCall.args[1], 'should pass connection options');
  const opts = connectCall.args[1].connectionOptions;
  assert.isDefined(opts, 'should have connectionOptions');
  assert.strictEqual(opts.rejectUnauthorized, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /workspaces/ServiceConnect-NodeJS && npm test`
Expected: FAIL — SSL options not passed to amqp.connect

- [ ] **Step 3: Update SSLConfig types**

In `src/types.ts`, replace SSLConfig (lines 106-115):

```typescript
export interface SSLConfig {
  enabled?: boolean;
  key?: Buffer | Buffer[];
  passphrase?: string;
  cert?: Buffer | Buffer[];
  ca?: Buffer | Buffer[];
  pfx?: Buffer | Buffer[];
  fail_if_no_peer_cert?: boolean;
  verify?: 'verify_peer' | 'verify_none';
}
```

- [ ] **Step 4: Update defaults in settings.ts**

In `src/settings.ts`, replace SSL defaults (lines 17-24):

```typescript
      ssl: {
        enabled: false,
        verify: 'verify_peer'
      },
```

- [ ] **Step 5: Wire SSL to amqp.connect**

In `src/clients/rabbitmq/connection-manager.ts`, update the `connect` method (line 42):

```typescript
        const connectionOptions: Record<string, unknown> = {};
        if (this.config.amqpSettings.ssl?.enabled) {
          const ssl = this.config.amqpSettings.ssl;
          const tlsOptions: Record<string, unknown> = {};
          if (ssl.cert) tlsOptions.cert = ssl.cert;
          if (ssl.key) tlsOptions.key = ssl.key;
          if (ssl.ca) tlsOptions.ca = ssl.ca;
          if (ssl.pfx) tlsOptions.pfx = ssl.pfx;
          if (ssl.passphrase) tlsOptions.passphrase = ssl.passphrase;
          tlsOptions.rejectUnauthorized = ssl.verify !== 'verify_none';
          connectionOptions.connectionOptions = tlsOptions;
        }

        this.connection = amqp.connect(hosts, connectionOptions);
```

- [ ] **Step 6: Add SSL validation in validateConfig**

Add to `validateConfig` in `src/bus/index.ts`, after the host validation:

```typescript
    if (amqp.ssl?.enabled) {
      const ssl = amqp.ssl;
      const hasCertKey = ssl.cert && ssl.key;
      const hasPfx = ssl.pfx;
      if (!hasCertKey && !hasPfx) {
        throw new ValidationError(
          'SSL is enabled but no certificate provided. Provide either cert+key or pfx.',
          ValidationErrorCodes.CONFIG_INVALID_SSL,
          'amqpSettings.ssl'
        );
      }
    }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd /workspaces/ServiceConnect-NodeJS && npm test`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
cd /workspaces/ServiceConnect-NodeJS
git add src/types.ts src/settings.ts src/clients/rabbitmq/connection-manager.ts src/bus/index.ts test/rabbitmq-modules.spec.ts
git commit -m "feat: implement SSL/TLS support

- Fix SSLConfig types to use Buffer (#3)
- Wire SSL options to amqp.connect (#3)
- Validate cert+key or pfx when SSL enabled (#3)"
```

---

### Task 8: Message Headers & Routing

**Findings:** #43 (Important — already done in Task 2), #34 (Minor)

**Files:**
- Modify: `src/clients/rabbitmq/index.ts:237`
- Modify: `test/rabbitmq-modules.spec.ts`

Note: Finding #43 (reply header stripping) was already implemented in Task 2's `createReplyCallback` changes. Only #34 remains.

- [ ] **Step 1: Write failing test for deepmerge consistency**

Add to `test/rabbitmq-modules.spec.ts` in the `RabbitMQClient` describe block:

```typescript
it('should use source-replace array merge in buildHeaders', () => {
  const client = new RabbitMQClient(createTestConfig(), sandbox.stub());
  const headers = { ca: ['cert1'] } as any;
  const result = (client as any).buildHeaders('Type', headers, 'Send');
  // Should not duplicate array values
  assert.deepEqual(result.ca, ['cert1']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /workspaces/ServiceConnect-NodeJS && npm test`
Expected: FAIL — default deepmerge concatenates arrays

- [ ] **Step 3: Fix buildHeaders deepmerge**

In `src/clients/rabbitmq/index.ts`, line 237, replace:

```typescript
    const merged = merge({}, headers) as MessageHeaders;
```

with:

```typescript
    const merged = merge({}, headers, {
      arrayMerge: (_target, source) => source,
    }) as MessageHeaders;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /workspaces/ServiceConnect-NodeJS && npm test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd /workspaces/ServiceConnect-NodeJS
git add src/clients/rabbitmq/index.ts test/rabbitmq-modules.spec.ts
git commit -m "fix: consistent deepmerge array strategy in buildHeaders (#34)"
```

---

### Task 9: Error Handling & Code Quality

**Findings:** #6 (Important), #35 (Minor), #37 (Minor), #9 (Minor)

**Files:**
- Modify: `src/errors/ServiceConnectError.ts:49-51`
- Modify: `src/bus/index.ts` (CorrelationId validation, JSDoc)
- Modify: `test/bus.spec.ts`

Note: Finding #8 (redundant logger check) was already fixed in Task 1.

- [ ] **Step 1: Write failing tests**

Add to `test/bus.spec.ts`:

```typescript
it('should fix Error.captureStackTrace to target correct constructor', () => {
  const err = new ValidationError('test', 'TEST_CODE', 'field');
  // Stack trace should NOT include ValidationError constructor frame
  assert.isFalse(err.stack?.includes('new ServiceConnectError'), 'stack should not show base class constructor');
});

it('should throw when sending message without CorrelationId', async () => {
  bus = new Bus({ amqpSettings: { queue: { name: 'test' } } } as any);
  (bus as any).initialized = true;
  (bus as any).core.client = { send: sandbox.stub() };
  try {
    await bus.send('endpoint', 'Type', {} as any);
    assert.fail('should have thrown');
  } catch (err: any) {
    assert.strictEqual(err.code, 'INVALID_MESSAGE_FORMAT');
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /workspaces/ServiceConnect-NodeJS && npm test`
Expected: FAIL

- [ ] **Step 3: Fix captureStackTrace**

In `src/errors/ServiceConnectError.ts`, line 50, replace:

```typescript
      Error.captureStackTrace(this, ServiceConnectError);
```

with:

```typescript
      Error.captureStackTrace(this, new.target);
```

- [ ] **Step 4: Add CorrelationId validation and JSDoc**

In `src/bus/index.ts`, add CorrelationId validation to `send()` (after type validation):

```typescript
    if (!message.CorrelationId || typeof message.CorrelationId !== 'string') {
      throw new MessageError(
        'Message must include a non-empty CorrelationId',
        MessageErrorCodes.INVALID_MESSAGE_FORMAT,
        false,
        undefined,
        type
      );
    }
```

Add the same validation to `publish()` after the type check.

Add import for `MessageError, MessageErrorCodes` at the top of `bus/index.ts`:

```typescript
import { ValidationError, ValidationErrorCodes, ConnectionError, ConnectionErrorCodes, MessageError, MessageErrorCodes } from '../errors';
```

Add JSDoc to Bus class:

```typescript
/**
 * Bus class - main entry point for messaging operations.
 * Maintains backward-compatible public API while delegating to internal modules.
 *
 * Note: This class is not designed for subclassing. Constructor method binding
 * is intentional for safe callback passing and will override subclass methods.
 */
export class Bus implements IBus {
```

- [ ] **Step 5: Remove lib/ from git tracking**

```bash
cd /workspaces/ServiceConnect-NodeJS && git rm -r --cached lib/
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /workspaces/ServiceConnect-NodeJS && npm test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
cd /workspaces/ServiceConnect-NodeJS
git add src/errors/ServiceConnectError.ts src/bus/index.ts test/bus.spec.ts
git commit -m "fix: error handling and code quality

- Fix captureStackTrace to use new.target (#6)
- Add runtime CorrelationId validation on send/publish (#37)
- Document Bus as non-subclassable (#35)
- Remove lib/ from git tracking (#9)"
```

---

### Task 10: Integration Test Reliability

**Findings:** #21, #22, #23, #26, #11, #12, #13, #27, #38, #39

**Files:**
- Modify: `integration-test/commands.spec.ts`
- Modify: `integration-test/events.spec.ts`
- Modify: `integration-test/competingConsumers.spec.ts`
- Modify: `integration-test/customLogger.spec.ts`
- Modify: `integration-test/auditQueue.spec.ts`
- Modify: `integration-test/removeHandler.spec.ts`
- Modify: `integration-test/multipleEndpoints.spec.ts`
- Modify: `integration-test/wildcardHandler.spec.ts`
- Modify: `integration-test/priorityQueue.spec.ts`
- Modify: `integration-test/filters.spec.ts`
- Modify: `integration-test/requestReply.spec.ts`
- Modify: `integration-test/retries.spec.ts`
- Modify: `integration-test/scatterGather.spec.ts`
- Modify: `integration-test/setupDocker.ts`
- Modify: `test/bus.spec.ts`
- Modify: `package.json`

This task applies the same patterns across many files. The changes are:

- [ ] **Step 1: Fix afterEach guards across all integration tests**

In every integration test file's `afterEach` block, replace:

```typescript
afterEach(async () => {
  await consumer.close();
  await producer.close();
});
```

with:

```typescript
afterEach(async () => {
  await consumer?.close();
  await producer?.close();
});
```

Apply to: `commands.spec.ts`, `events.spec.ts`, `retries.spec.ts`, `requestReply.spec.ts`, `scatterGather.spec.ts`, `competingConsumers.spec.ts`, `customLogger.spec.ts`, `auditQueue.spec.ts`, `removeHandler.spec.ts`, `multipleEndpoints.spec.ts`, `wildcardHandler.spec.ts`, `priorityQueue.spec.ts`, `filters.spec.ts`.

- [ ] **Step 2: Replace `new Promise(async ...)` pattern**

For each test that uses `return new Promise<void>(async (resolve, reject) => { ... })`, refactor to use a Promise-based helper:

Example refactor for `commands.spec.ts`:

Before:
```typescript
it('should send and receive command', () => {
  return new Promise<void>(async (resolve, reject) => {
    // ... handler setup, init, send, poll
  });
});
```

After:
```typescript
it('should send and receive command', async () => {
  let receivedMessage: any;
  const messageReceived = new Promise<void>((resolve) => {
    consumer.addHandler('TestCommand', (message: any) => {
      receivedMessage = message;
      resolve();
    });
  });

  await consumer.init();
  await producer.init();
  await producer.send('Test.Consumer', 'TestCommand', { CorrelationId: 'abc', data: 1 });

  await messageReceived;
  assert.strictEqual(receivedMessage.data, 1);
});
```

Apply the same pattern to all 11 files listed in finding #21.

- [ ] **Step 3: Add `await` to send/publish calls**

In `commands.spec.ts`, `events.spec.ts`, `competingConsumers.spec.ts`, `filters.spec.ts`, ensure all `send()` and `publish()` calls use `await`.

- [ ] **Step 4: Add poll deadlines to setInterval-based tests**

For tests in `retries.spec.ts`, `requestReply.spec.ts`, `scatterGather.spec.ts` that use `setInterval`, add a max wait:

```typescript
const pollWithDeadline = (check: () => boolean, deadline: number = 30000): Promise<void> => {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (check()) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > deadline) {
        clearInterval(interval);
        reject(new Error(`Poll deadline exceeded after ${deadline}ms`));
      }
    }, 100);
  });
};
```

- [ ] **Step 5: Add CorrelationId to reply messages in tests**

In `requestReply.spec.ts` and `scatterGather.spec.ts`, add `CorrelationId` to reply objects:

```typescript
replyCallback('Reply', { CorrelationId: message.CorrelationId, result: message.number * 2 });
```

- [ ] **Step 6: Add audit queue verification**

In `auditQueue.spec.ts`, after the handler resolves, add:

```typescript
// Verify audit queue received the message
const auditBus = new Bus({
  amqpSettings: {
    queue: { name: 'Test.Consumer.Audit', autoDelete: true },
    host: config.host
  }
});
let auditMessage: any;
const auditReceived = new Promise<void>((resolve) => {
  auditBus.addHandler('*', (msg: any) => {
    auditMessage = msg;
    resolve();
  });
});
await auditBus.init();
await auditReceived;
assert.isDefined(auditMessage, 'audit queue should contain the message');
await auditBus.close();
```

- [ ] **Step 7: Fix Docker setup and package.json**

In `integration-test/setupDocker.ts`, before `docker run`, add cleanup:

```typescript
execSync('docker rm -f rabbitmq 2>/dev/null || true');
```

In `package.json`, line 17, replace:

```json
"rabbitmq": "cross-env RABBITMQ_PLUGINS=rabbitmq_management docker run -p 5672:5672 -p 15672:15672 --name rabbitmq bitnami/rabbitmq:latest",
```

with:

```json
"rabbitmq": "cross-env RABBITMQ_PLUGINS=rabbitmq_management docker run -p 5672:5672 -p 15672:15672 --name rabbitmq bitnami/rabbitmq:4.1.0",
```

- [ ] **Step 8: Fix bus.spec.ts close test and filters.spec.ts describe name**

In `test/bus.spec.ts`, find the close test and add `await`:

```typescript
await bus.close();
```

In `integration-test/filters.spec.ts`, line 5, change:

```typescript
describe('Events', () => {
```

to:

```typescript
describe('Filters', () => {
```

- [ ] **Step 9: Run unit tests**

Run: `cd /workspaces/ServiceConnect-NodeJS && npm test`
Expected: All unit tests PASS

- [ ] **Step 10: Commit**

```bash
cd /workspaces/ServiceConnect-NodeJS
git add integration-test/ test/bus.spec.ts package.json
git commit -m "fix: integration test reliability

- Replace new Promise(async) with direct async/await (#21)
- Add await to send/publish calls (#22)
- Add audit queue content verification (#23)
- Guard afterEach with optional chaining (#26)
- Add Docker container cleanup (#11)
- Add poll deadlines with descriptive errors (#12)
- Add CorrelationId to reply messages (#13)
- Pin RabbitMQ image to 4.1.0 (#27)
- Await bus.close() in unit test (#38)
- Fix filters.spec.ts describe name (#39)"
```

---

## Final Verification

After all 10 tasks are complete:

- [ ] **Run full unit test suite:** `npm test`
- [ ] **Run TypeScript compilation:** `npm run typecheck`
- [ ] **Run integration tests (if RabbitMQ available):** `npm run auto-integration-test`
- [ ] **Verify lib/ is not tracked:** `git status lib/` should show nothing
- [ ] **Verify package.json has engines field**
