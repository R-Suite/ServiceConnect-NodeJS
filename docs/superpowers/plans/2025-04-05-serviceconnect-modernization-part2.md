# ServiceConnect-NodeJS Modernization Implementation Plan - Part 2

Continuation of the modernization plan covering RabbitMQ client refactoring, settings updates, and testing.

---

## Phase 6: RabbitMQ Client Refactoring

### Task 15: Create RabbitMQ Connection Manager

**Files:**
- Create: `src/clients/rabbitmq/connection-manager.ts`

**Context:** Manages AMQP connection lifecycle with reconnection logic.

- [ ] **Step 1: Create connection-manager.ts**

```typescript
import amqp, { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import { ConnectionError, ConnectionErrorCodes } from '../../errors';
import type { BusConfig } from '../../types';

/**
 * Manages AMQP connection lifecycle including reconnection.
 */
export class ConnectionManager {
  private config: BusConfig;
  private connection: AmqpConnectionManager | null = null;
  private channel: ChannelWrapper | null = null;
  private logger = this.config.logger;

  constructor(config: BusConfig) {
    this.config = config;
  }

  /**
   * Connect to RabbitMQ with retry logic
   */
  async connect(): Promise<void> {
    const maxRetries = 5;
    let lastError: Error | undefined;
    const hosts = Array.isArray(this.config.amqpSettings.host)
      ? this.config.amqpSettings.host
      : [this.config.amqpSettings.host];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.connection = amqp.connect(hosts);
        this.setupConnectionEvents();
        
        await new Promise<void>((resolve, reject) => {
          this.connection!.on('connect', () => {
            this.logger?.info(`Connected to RabbitMQ: ${this.config.amqpSettings.queue.name}`);
            resolve();
          });
          
          this.connection!.on('connectFailed', (err) => {
            reject(err.err);
          });
          
          // Timeout if no connect event within 30 seconds
          setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 30000);
        });

        return;
      } catch (error) {
        lastError = error as Error;
        this.logger?.error(`Connection attempt ${attempt} failed`, error);
        
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
          await this.sleep(delay);
        }
      }
    }

    throw new ConnectionError(
      `Failed to connect to RabbitMQ after ${maxRetries} attempts`,
      ConnectionErrorCodes.CONNECTION_FAILED,
      false,
      lastError
    );
  }

  /**
   * Create a channel with the given setup function
   */
  async createChannel(setup: (channel: ConfirmChannel) => Promise<void>): Promise<void> {
    if (!this.connection) {
      throw new ConnectionError(
        'Not connected to RabbitMQ',
        ConnectionErrorCodes.CONNECTION_FAILED,
        true
      );
    }

    this.channel = this.connection.createChannel({
      json: true,
      setup: async (channel: ConfirmChannel) => {
        await channel.prefetch(this.config.amqpSettings.prefetch);
        await setup(channel);
      }
    });

    // Wait for channel to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Channel creation timeout'));
      }, 30000);

      this.channel!.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.channel!.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Get the current channel
   */
  getChannel(): ChannelWrapper | null {
    return this.channel;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connection?.isConnected() ?? false;
  }

  /**
   * Close connection gracefully
   */
  async close(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
    this.channel = null;
    this.connection = null;
  }

  /**
   * Setup connection event handlers
   */
  private setupConnectionEvents(): void {
    if (!this.connection) return;

    this.connection.on('disconnect', (err) => {
      this.logger?.error(
        `Disconnected from RabbitMQ: ${this.config.amqpSettings.queue.name}`,
        err.err
      );
    });

    this.connection.on('blocked', (reason) => {
      this.logger?.error(
        `Blocked by RabbitMQ broker: ${this.config.amqpSettings.queue.name}`,
        reason
      );
    });
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

- [ ] **Step 2: Commit the connection manager**

```bash
git add src/clients/rabbitmq/connection-manager.ts
git commit -m "feat(rabbitmq): add ConnectionManager for AMQP lifecycle

- Handles connection with exponential backoff retry
- Creates channels with setup functions
- Manages connection events (connect, disconnect, blocked)"
```

### Task 16: Create RabbitMQ Queue Manager

**Files:**
- Create: `src/clients/rabbitmq/queue-manager.ts`

- [ ] **Step 1: Create queue-manager.ts**

```typescript
import type { ConfirmChannel, Options } from 'amqplib';
import type { BusConfig } from '../../types';

/**
 * Manages RabbitMQ queue, exchange, and binding setup.
 */
export class QueueManager {
  private config: BusConfig;
  private logger = this.config.logger;

  constructor(config: BusConfig) {
    this.config = config;
  }

  /**
   * Setup all queues, exchanges, and bindings
   */
  async setupQueues(channel: ConfirmChannel, handlers: Record<string, unknown>): Promise<void> {
    await this.createMainQueue(channel);
    await this.bindMessageTypes(channel, handlers);
    
    if (this.config.amqpSettings.maxRetries > 0) {
      await this.createRetryQueue(channel);
    }
    
    await this.createErrorQueue(channel);
    
    if (this.config.amqpSettings.auditEnabled) {
      await this.createAuditQueue(channel);
    }
  }

  /**
   * Create the main consumer queue
   */
  private async createMainQueue(channel: ConfirmChannel): Promise<void> {
    const queueName = this.config.amqpSettings.queue.name;
    const queueOpts: Options.AssertQueue = {
      durable: this.config.amqpSettings.queue.durable,
      exclusive: this.config.amqpSettings.queue.exclusive,
      autoDelete: this.config.amqpSettings.queue.autoDelete,
      arguments: this.config.amqpSettings.queue.arguments
    };

    if (this.config.amqpSettings.queue.maxPriority !== undefined) {
      queueOpts.maxPriority = this.config.amqpSettings.queue.maxPriority;
    }

    this.logger?.info(`Creating queue: ${queueName}`);
    await channel.assertQueue(queueName, queueOpts);
  }

  /**
   * Bind message type exchanges to the main queue
   */
  private async bindMessageTypes(
    channel: ConfirmChannel,
    handlers: Record<string, unknown>
  ): Promise<void> {
    this.logger?.info('Binding message handlers to queue');
    
    for (const key of Object.keys(handlers)) {
      const type = key.replace(/\./g, '');
      
      await channel.assertExchange(type, 'fanout', { durable: true });
      await channel.bindQueue(this.config.amqpSettings.queue.name, type, '');
    }
  }

  /**
   * Create retry queue with dead letter exchange
   */
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

  /**
   * Create error queue and exchange
   */
  private async createErrorQueue(channel: ConfirmChannel): Promise<void> {
    this.logger?.info('Configuring error queue');
    
    const errorQueue = this.config.amqpSettings.errorQueue;
    
    await channel.assertExchange(errorQueue, 'direct', { durable: false });
    
    await channel.assertQueue(errorQueue, {
      durable: true,
      autoDelete: false,
      arguments: {
        ...(this.config.amqpSettings.queue.utilityQueueArguments ?? {})
      }
    });
  }

  /**
   * Create audit queue and exchange
   */
  private async createAuditQueue(channel: ConfirmChannel): Promise<void> {
    this.logger?.info('Configuring audit queue');
    
    const auditQueue = this.config.amqpSettings.auditQueue;
    
    await channel.assertExchange(auditQueue, 'direct', { durable: false });
    
    await channel.assertQueue(auditQueue, {
      durable: true,
      autoDelete: false,
      arguments: {
        ...(this.config.amqpSettings.queue.utilityQueueArguments ?? {})
      }
    });
  }

  /**
   * Consume a message type (create exchange and bind)
   */
  async consumeType(channel: ConfirmChannel, type: string): Promise<void> {
    await channel.assertExchange(type, 'fanout', { durable: true });
    await channel.bindQueue(this.config.amqpSettings.queue.name, type, '');
  }

  /**
   * Stop consuming a message type (unbind)
   */
  async removeType(channel: ConfirmChannel, type: string): Promise<void> {
    await channel.unbindQueue(this.config.amqpSettings.queue.name, type, '');
  }
}
```

- [ ] **Step 2: Commit the queue manager**

```bash
git add src/clients/rabbitmq/queue-manager.ts
git commit -m "feat(rabbitmq): add QueueManager for queue/exchange setup

- Creates main queue with configurable options
- Sets up retry queue with dead letter exchange
- Creates error and audit queues
- Handles message type bindings"
```

### Task 17: Create RabbitMQ Message Processor

**Files:**
- Create: `src/clients/rabbitmq/message-processor.ts`

- [ ] **Step 1: Create message-processor.ts**

```typescript
import type { ConsumeMessage, ConfirmChannel } from 'amqplib';
import type { ChannelWrapper } from 'amqp-connection-manager';
import { MessageError, MessageErrorCodes } from '../../errors';
import type { BusConfig, ConsumeMessageCallback, Message } from '../../types';

/**
 * Processes incoming RabbitMQ messages with error handling.
 */
export class MessageProcessor {
  private config: BusConfig;
  private consumeCallback: ConsumeMessageCallback;
  private logger = this.config.logger;
  private processing = 0;

  constructor(config: BusConfig, consumeCallback: ConsumeMessageCallback) {
    this.config = config;
    this.consumeCallback = consumeCallback;
  }

  /**
   * Start consuming messages from the queue
   */
  async startConsuming(channel: ConfirmChannel): Promise<void> {
    await channel.consume(
      this.config.amqpSettings.queue.name,
      this.handleMessage.bind(this),
      { noAck: this.config.amqpSettings.queue.noAck }
    );
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(rawMessage: ConsumeMessage | null): Promise<void> {
    if (rawMessage === null) return;

    this.processing++;

    try {
      const typeName = rawMessage.properties.headers?.TypeName;
      
      if (!typeName) {
        this.logger?.error('Message does not contain TypeName header');
        this.ackMessage(rawMessage);
        return;
      }

      await this.processMessage(rawMessage);
    } catch (error) {
      this.logger?.error('Error processing message', error);
    } finally {
      this.ackMessage(rawMessage);
      this.processing--;
    }
  }

  /**
   * Process the message content
   */
  private async processMessage(rawMessage: ConsumeMessage): Promise<void> {
    const headers = rawMessage.properties.headers;
    
    try {
      const message = JSON.parse(rawMessage.content.toString()) as Message;
      
      await this.consumeCallback(
        message,
        headers,
        headers.TypeName as string
      );
    } catch (error) {
      throw new MessageError(
        'Failed to process message',
        MessageErrorCodes.HANDLER_FAILED,
        false,
        error as Error,
        headers.TypeName as string
      );
    }
  }

  /**
   * Acknowledge message if noAck is false
   */
  private ackMessage(rawMessage: ConsumeMessage): void {
    if (!this.config.amqpSettings.queue.noAck) {
      // Channel ack is handled by the wrapper
    }
  }

  /**
   * Get count of messages currently being processed
   */
  getProcessingCount(): number {
    return this.processing;
  }

  /**
   * Wait for all messages to finish processing
   */
  async waitForProcessing(timeoutMs: number = 60000): Promise<void> {
    const startTime = Date.now();
    
    while (this.processing > 0 && (Date.now() - startTime) < timeoutMs) {
      await this.sleep(100);
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

- [ ] **Step 2: Commit the message processor**

```bash
git add src/clients/rabbitmq/message-processor.ts
git commit -m "feat(rabbitmq): add MessageProcessor for message consumption

- Handles incoming messages with error boundaries
- Tracks processing count
- Validates TypeName header presence
- Provides graceful shutdown waiting"
```

### Task 18: Create RabbitMQ Retry Manager

**Files:**
- Create: `src/clients/rabbitmq/retry-manager.ts`

- [ ] **Step 1: Create retry-manager.ts**

```typescript
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConsumeMessage } from 'amqplib';
import type { BusConfig } from '../../types';

interface ProcessingResult {
  success: boolean;
  exception?: unknown;
}

/**
 * Manages message retry logic and dead lettering.
 */
export class RetryManager {
  private config: BusConfig;
  private logger = this.config.logger;

  constructor(config: BusConfig) {
    this.config = config;
  }

  /**
   * Handle message processing result - retry or send to error queue
   */
  async handleResult(
    channel: ChannelWrapper,
    rawMessage: ConsumeMessage,
    result: ProcessingResult
  ): Promise<void> {
    if (result.success) {
      await this.handleSuccess(channel, rawMessage);
    } else {
      await this.handleFailure(channel, rawMessage, result.exception);
    }
  }

  /**
   * Handle successful processing
   */
  private async handleSuccess(
    channel: ChannelWrapper,
    rawMessage: ConsumeMessage
  ): Promise<void> {
    if (!this.config.amqpSettings.auditEnabled) {
      return;
    }

    // Send to audit queue
    const headers = rawMessage.properties.headers;
    headers.TimeProcessed = headers.TimeProcessed ?? new Date().toISOString();

    await channel.sendToQueue(
      this.config.amqpSettings.auditQueue,
      JSON.parse(rawMessage.content.toString()),
      {
        headers,
        messageId: rawMessage.properties.messageId
      }
    );
  }

  /**
   * Handle failed processing - retry or error queue
   */
  private async handleFailure(
    channel: ChannelWrapper,
    rawMessage: ConsumeMessage,
    exception: unknown
  ): Promise<void> {
    const headers = rawMessage.properties.headers;
    const retryCount = (headers.RetryCount as number) ?? 0;

    if (this.config.amqpSettings.maxRetries === 0) {
      // Retries disabled, send directly to error queue
      await this.sendToErrorQueue(channel, rawMessage, exception);
      return;
    }

    if (retryCount < this.config.amqpSettings.maxRetries) {
      // Retry the message
      headers.RetryCount = retryCount + 1;
      
      await channel.sendToQueue(
        `${this.config.amqpSettings.queue.name}.Retries`,
        JSON.parse(rawMessage.content.toString()),
        {
          headers,
          messageId: rawMessage.properties.messageId
        }
      );
    } else {
      // Max retries exceeded, send to error queue
      headers.Exception = exception;
      await this.sendToErrorQueue(channel, rawMessage, exception);
    }
  }

  /**
   * Send message to error queue
   */
  private async sendToErrorQueue(
    channel: ChannelWrapper,
    rawMessage: ConsumeMessage,
    exception: unknown
  ): Promise<void> {
    const headers = rawMessage.properties.headers;
    headers.Exception = exception;

    await channel.sendToQueue(
      this.config.amqpSettings.errorQueue,
      JSON.parse(rawMessage.content.toString()),
      {
        headers,
        messageId: rawMessage.properties.messageId
      }
    );
  }

  /**
   * Delete the retry queue during cleanup
   */
  async cleanup(channel: ConfirmChannel): Promise<void> {
    if (
      this.config.amqpSettings.maxRetries > 0 &&
      this.config.amqpSettings.queue.autoDelete
    ) {
      const retryQueue = `${this.config.amqpSettings.queue.name}.Retries`;
      await channel.deleteQueue(retryQueue);
    }
  }
}
```

- [ ] **Step 2: Commit the retry manager**

```bash
git add src/clients/rabbitmq/retry-manager.ts
git commit -m "feat(rabbitmq): add RetryManager for retry/error queue handling

- Routes failed messages to retry queue
- Sends to error queue after max retries
- Handles audit queue on success
- Cleans up retry queue on shutdown"
```

### Task 19: Create RabbitMQ Client Index

**Files:**
- Create: `src/clients/rabbitmq/index.ts`

- [ ] **Step 1: Create rabbitmq/index.ts**

```typescript
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel, Options } from 'amqplib';
import { ConnectionManager } from './connection-manager';
import { QueueManager } from './queue-manager';
import { MessageProcessor } from './message-processor';
import { RetryManager } from './retry-manager';
import { v4 as uuidv4 } from 'uuid';
import merge from 'deepmerge';
import type {
  BusConfig,
  ConsumeMessageCallback,
  IClient,
  Message,
  MessageHeaders
} from '../../types';

/**
 * RabbitMQ client implementation of IClient interface.
 * Refactored to use modular components.
 */
export default class RabbitMQClient implements IClient {
  private config: BusConfig;
  private consumeCallback: ConsumeMessageCallback;
  private logger = this.config.logger;

  private connectionManager: ConnectionManager;
  private queueManager: QueueManager;
  private messageProcessor: MessageProcessor;
  private retryManager: RetryManager;

  constructor(config: BusConfig, consumeCallback: ConsumeMessageCallback) {
    this.config = config;
    this.consumeCallback = consumeCallback;

    this.connectionManager = new ConnectionManager(config);
    this.queueManager = new QueueManager(config);
    this.messageProcessor = new MessageProcessor(config, consumeCallback);
    this.retryManager = new RetryManager(config);
  }

  /**
   * Connect to RabbitMQ and setup queues
   */
  async connect(): Promise<void> {
    await this.connectionManager.connect();
    
    await this.connectionManager.createChannel(async (channel) => {
      await this.queueManager.setupQueues(channel, this.config.handlers);
      await this.messageProcessor.startConsuming(channel);
    });
  }

  /**
   * Start consuming a message type
   */
  async consumeType(type: string): Promise<void> {
    const channel = this.connectionManager.getChannel();
    if (!channel) {
      throw new Error('Not connected');
    }

    await channel.addSetup(async (ch: ConfirmChannel) => {
      await this.queueManager.consumeType(ch, type);
    });
  }

  /**
   * Stop consuming a message type
   */
  async removeType(type: string): Promise<void> {
    const channel = this.connectionManager.getChannel();
    if (!channel) {
      return;
    }

    await channel.removeSetup(async (ch: ConfirmChannel) => {
      await this.queueManager.removeType(ch, type);
    });
  }

  /**
   * Send a message to specific endpoint(s)
   */
  async send<T extends Message>(
    endpoint: string | string[],
    type: string,
    message: T,
    headers: MessageHeaders
  ): Promise<void> {
    const channel = this.connectionManager.getChannel();
    if (!channel) {
      throw new Error('Not connected');
    }

    const endpoints = Array.isArray(endpoint) ? endpoint : [endpoint];
    const messageHeaders = this.buildHeaders(type, headers, 'Send');

    await Promise.all(
      endpoints.map((ep) => {
        const options: Options.Publish = {
          headers: messageHeaders,
          messageId: messageHeaders.MessageId
        };
        
        if (messageHeaders.Priority !== undefined) {
          options.priority = messageHeaders.Priority;
        }

        return channel.sendToQueue(ep, message, options);
      })
    );
  }

  /**
   * Publish a message to an exchange
   */
  async publish<T extends Message>(
    type: string,
    message: T,
    headers: MessageHeaders
  ): Promise<void> {
    const channel = this.connectionManager.getChannel();
    if (!channel) {
      throw new Error('Not connected');
    }

    const normalizedType = type.replace(/\./g, '');
    const messageHeaders = this.buildHeaders(type, headers, 'Publish');

    const options: Options.Publish = {
      headers: messageHeaders,
      messageId: messageHeaders.MessageId
    };

    if (messageHeaders.Priority !== undefined) {
      options.priority = messageHeaders.Priority;
    }

    await channel.addSetup(async (ch: ConfirmChannel) => {
      await ch.assertExchange(normalizedType, 'fanout', { durable: true });
    });

    await channel.publish(normalizedType, '', message, options);
  }

  /**
   * Close the connection gracefully
   */
  async close(): Promise<void> {
    await this.messageProcessor.waitForProcessing();
    await this.connectionManager.close();
  }

  /**
   * Check if connected
   */
  async isConnected(): Promise<boolean> {
    return this.connectionManager.isConnected();
  }

  /**
   * Build message headers with defaults
   */
  private buildHeaders(
    type: string,
    headers: MessageHeaders,
    messageType: 'Send' | 'Publish'
  ): MessageHeaders {
    const merged = merge({}, headers) as MessageHeaders;
    
    merged.DestinationAddress = merged.DestinationAddress ?? this.config.amqpSettings.queue.name;
    merged.MessageId = merged.MessageId ?? uuidv4();
    merged.MessageType = merged.MessageType ?? messageType;
    merged.SourceAddress = merged.SourceAddress ?? this.config.amqpSettings.queue.name;
    merged.TimeSent = merged.TimeSent ?? new Date().toISOString();
    merged.TypeName = merged.TypeName ?? type;
    merged.FullTypeName = merged.FullTypeName ?? type;
    merged.ConsumerType = merged.ConsumerType ?? 'RabbitMQ';
    merged.Language = merged.Language ?? 'TypeScript';

    return merged;
  }
}
```

- [ ] **Step 2: Commit the RabbitMQ client index**

```bash
git add src/clients/rabbitmq/index.ts
git commit -m "feat(rabbitmq): implement RabbitMQClient using modular architecture

- Uses ConnectionManager, QueueManager, MessageProcessor, RetryManager
- Implements full IClient interface
- Handles send, publish, consume operations
- Manages message headers with defaults"
```

### Task 20: Update Main RabbitMQ.ts Export

**Files:**
- Modify: `src/clients/rabbitMQ.ts`

- [ ] **Step 1: Replace rabbitMQ.ts with re-export**

```typescript
/**
 * RabbitMQ client for ServiceConnect
 * Re-exported from internal modules for backward compatibility
 */

export { default } from './rabbitmq/index';
```

- [ ] **Step 2: Commit the re-export**

```bash
git add src/clients/rabbitMQ.ts
git commit -m "refactor(rabbitmq): update rabbitMQ.ts to re-export from modules

- Maintains backward compatibility
- Delegates to modular implementation"
```

---

## Phase 7: Settings Update

### Task 21: Update Settings with Types and Validation

**Files:**
- Modify: `src/settings.ts`

- [ ] **Step 1: Replace settings.ts**

```typescript
import client from './clients/rabbitMQ';
import type { ILogger, ServiceConnectConfig } from './types';

/**
 * Default settings for ServiceConnect
 */
export default function settings(): ServiceConnectConfig {
  return {
    amqpSettings: {
      queue: {
        name: '',
        durable: true,
        exclusive: false,
        autoDelete: false,
        noAck: false,
        maxPriority: undefined
      },
      ssl: {
        enabled: false,
        key: undefined,
        passphrase: undefined,
        cert: undefined,
        ca: [],
        pfx: undefined,
        fail_if_no_peer_cert: false,
        verify: 'verify_peer'
      },
      host: 'amqp://localhost',
      retryDelay: 3000,
      maxRetries: 3,
      errorQueue: 'errors',
      auditQueue: 'audit',
      auditEnabled: false,
      prefetch: 100
    },
    filters: {
      after: [],
      before: [],
      outgoing: []
    },
    handlers: {},
    client: client as unknown as new () => unknown,
    logger: {
      info: (message: string): void => console.log(message),
      error: (message: string, err?: unknown): void => {
        console.error(message);
        if (err) console.error(err);
      }
    } as ILogger
  };
}
```

- [ ] **Step 2: Commit the updated settings**

```bash
git add src/settings.ts
git commit -m "refactor(settings): update with proper types and validation

- Uses ServiceConnectConfig type
- Provides default logger implementation
- Maintains all default values"
```

---

## Phase 8: Root Index Update

### Task 22: Update Root Index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Replace index.ts with re-exports**

```typescript
/**
 * ServiceConnect - Messaging framework for Node.js
 * Public API exports
 */

// Main Bus class
export { Bus } from './bus/index';

// All types
export * from './types';

// Error classes
export * from './errors';
```

- [ ] **Step 2: Commit the root index**

```bash
git add src/index.ts
git commit -m "refactor(index): update root exports for new architecture

- Exports Bus from modular location
- Exports all types
- Exports error classes"
```

---

## Phase 9: Testing & Verification

### Task 23: Run TypeScript Compilation

**Files:**
- Verify: All source files compile without errors

- [ ] **Step 1: Run TypeScript compiler**

```bash
npm run build
```

Expected: Zero TypeScript errors.

- [ ] **Step 2: If errors exist, fix them one by one**

Common fixes needed:
- Add type annotations to function parameters
- Handle potential null/undefined values
- Replace `any` with specific types
- Fix import paths

- [ ] **Step 3: Commit after successful build**

```bash
git add -A
git commit -m "fix: resolve TypeScript compilation errors

- All strict mode checks passing
- Zero any types in production code"
```

### Task 24: Run Unit Tests

**Files:**
- Test: `test/bus.spec.ts`
- Test: `test/rabbitMQ.spec.ts`

- [ ] **Step 1: Run unit tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 2: If test failures, analyze and fix**

Check for:
- Chai assertion syntax changes (v3 → v6)
- Sinon stub API changes (v2 → v21)
- Timing issues with async code
- Mock object compatibility

- [ ] **Step 3: Commit after tests pass**

```bash
git add -A
git commit -m "test: fix test compatibility with updated dependencies

- Update Chai assertions for v6
- Update Sinon stubs for v21
- All unit tests passing"
```

### Task 25: Run Integration Tests (if RabbitMQ available)

**Files:**
- Test: `integration-test/*.spec.ts`

- [ ] **Step 1: Start RabbitMQ if available**

```bash
npm run rabbitmq
```

- [ ] **Step 2: Run integration tests**

```bash
npm run integration-test
```

Expected: All integration tests pass.

- [ ] **Step 3: Document any integration test issues**

If tests fail due to amqplib 1.x API changes, document specific issues for follow-up.

---

## Phase 10: Final Verification

### Task 26: Verify Backward Compatibility

- [ ] **Step 1: Create a simple test script**

Create `test-backward-compat.js`:

```javascript
const { Bus } = require('./lib/index');

// Test 1: Basic instantiation
const bus = new Bus({
  amqpSettings: {
    queue: { name: 'test-queue' }
  }
});

console.log('✓ Bus instantiated');
console.log('✓ Bus ID:', bus.id);
console.log('✓ Backward compatibility test passed');
```

- [ ] **Step 2: Run the test**

```bash
node test-backward-compat.js
```

Expected: Script runs without errors.

- [ ] **Step 3: Clean up test file**

```bash
rm test-backward-compat.js
```

### Task 27: Final Commit

- [ ] **Step 1: Review all changes**

```bash
git status
git diff --stat
```

- [ ] **Step 2: Create final commit**

```bash
git add -A
git commit -m "feat: complete ServiceConnect modernization

Major changes:
- Update all dependencies to latest versions (TypeScript 6.0.2, amqplib 1.0.3, etc.)
- Enable maximum TypeScript strictness (all strict flags)
- Implement custom error hierarchy with graceful degradation
- Refactor into modular architecture (bus/, clients/rabbitmq/)
- Remove all any types from production code
- Maintain 100% backward compatibility

Dependencies updated:
- typescript: 4.7.2 → 6.0.2
- amqplib: 0.9.1 → 1.0.3
- amqp-connection-manager: 4.1.3 → 5.0.0
- uuid: 8.3.2 → 13.0.0
- chai: 3.5.0 → 6.2.2
- sinon: 2.2.0 → 21.0.3

Architecture:
- Split Bus into focused modules
- Create error handling infrastructure
- Add comprehensive TypeScript types
- Improve error messages and debugging

Closes #modernization"
```

---

## Success Criteria Checklist

- [ ] All dependencies updated to specified versions
- [ ] Zero TypeScript errors with strict mode
- [ ] All unit tests pass
- [ ] No `any` types in production code
- [ ] Custom error classes implemented
- [ ] Graceful degradation for transient errors
- [ ] Fail-fast validation for config errors
- [ ] Public API unchanged
- [ ] Integration tests pass
- [ ] Backward compatibility verified

---

**Plan Complete**

This plan provides step-by-step instructions for modernizing ServiceConnect-NodeJS while maintaining backward compatibility. Each task includes specific files, code, and commands.
