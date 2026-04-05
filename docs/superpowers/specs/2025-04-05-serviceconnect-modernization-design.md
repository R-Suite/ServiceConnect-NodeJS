# ServiceConnect-NodeJS Modernization Design

**Date:** 2025-04-05  
**Author:** OpenCode  
**Status:** Approved  
**Approach:** Comprehensive Refactor (Approach 2)

---

## Executive Summary

This design document outlines a comprehensive modernization and refactoring of the ServiceConnect-NodeJS messaging framework. The project has accumulated technical debt over time, with outdated dependencies (TypeScript 4.7.2, amqplib 0.9.1), loose TypeScript typing (extensive use of `any`), inconsistent error handling, and large monolithic files.

**Goals:**
- Aggressively update all dependencies to latest major versions
- Implement maximum TypeScript strictness with proper type safety
- Improve error handling with graceful degradation for transient issues and fail-fast for unrecoverable errors
- Refactor code organization while maintaining 100% backward compatibility
- Remove all `any` types and implement proper error boundaries

**Non-Goals:**
- Change the public API surface (exports remain unchanged)
- Modify existing test files (tests must continue to pass)
- Add new features beyond what's required for refactoring
- Support for additional protocols beyond RabbitMQ/AMQP

---

## 1. Dependency Updates

### Core Dependencies

| Package | Current | Updated To | Notes |
|---------|---------|------------|-------|
| `typescript` | 4.7.2 | **6.0.2** | Major bump - latest features |
| `amqplib` | 0.9.1 | **1.0.3** | ⚠️ **Major version bump** - API changes expected |
| `amqp-connection-manager` | 4.1.3 | **5.0.0** | ⚠️ **Major version bump** - reconnection handling changes |
| `uuid` | 8.3.2 | **13.0.0** | Several major versions ahead |
| `deepmerge` | 4.2.2 | 4.3.1 | Patch update |

### Dev Dependencies

| Package | Current | Updated To |
|---------|---------|------------|
| `@types/node` | 17.0.36 | **25.5.2** |
| `@types/amqplib` | 0.8.2 | **0.10.8** |
| `mocha` | 11.0.1 | **11.7.5** |
| `chai` | 3.5.0 | **6.2.2** | ⚠️ Major bump |
| `sinon` | 2.2.0 | **21.0.3** | ⚠️ Major bump |
| `ts-node` | 10.8.0 | 10.9.2 |
| `eslint` | 9.17.0 | 9.23.0 |

### Breaking Changes to Address

1. **amqplib 1.0.3**: Review all AMQP channel operations for API changes
2. **amqp-connection-manager 5.0.0**: Update connection event handling, channel wrapper usage
3. **TypeScript 6.0.2**: Leverage new type inference features
4. **Chai 6.x**: Update assertion syntax if needed
5. **Sinon 21.x**: Verify stub/spy APIs remain compatible

---

## 2. TypeScript Configuration

### Updated tsconfig.json

```json
{
  "include": ["src/**/*"],
  "exclude": ["**/*.spec.ts", "**/*.test.ts"],
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "lib",
    "rootDir": "src",
    "sourceMap": true,
    "declaration": true,
    "declarationMap": true,
    
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  }
}
```

### Type Safety Improvements

1. **Remove all `any` types** - Replace with proper interfaces or unknown with type guards
2. **Add branded types** for type-safe IDs:
   ```typescript
   type MessageId = string & { __brand: 'MessageId' };
   type CorrelationId = string & { __brand: 'CorrelationId' };
   ```
3. **Explicit null/undefined handling** - Use `strictNullChecks` to force null checks
4. **Discriminated unions** for message states where appropriate
5. **Function type precision** - Explicit return types on all public methods

---

## 3. Code Architecture

### New Directory Structure

```
src/
├── index.ts              # Public API exports (unchanged interface)
├── types.ts              # Centralized type definitions (expanded)
├── settings.ts           # Configuration defaults
├── errors/               # Custom error classes
│   ├── index.ts          # Error exports
│   ├── ServiceConnectError.ts    # Base error class
│   ├── ConnectionError.ts        # Connection issues
│   ├── MessageError.ts           # Message processing errors
│   └── ValidationError.ts        # Configuration validation
├── bus/                  # Bus implementation modules
│   ├── index.ts          # Main Bus class (thin wrapper)
│   ├── bus-core.ts       # Core Bus logic
│   ├── message-handler.ts    # Handler registration/lookup
│   ├── filter-manager.ts     # Filter chain execution
│   └── request-reply-manager.ts  # Request/reply state management
└── clients/
    ├── rabbitMQ.ts       # Public RabbitMQ client API (unchanged)
    └── rabbitmq/         # Internal RabbitMQ modules
        ├── index.ts      # Module exports
        ├── connection-manager.ts   # Connection lifecycle
        ├── queue-manager.ts        # Queue/exchange setup
        ├── message-processor.ts    # Message consumption logic
        └── retry-manager.ts        # Retry/error queue handling
```

### Public API Contract

The `src/index.ts` file must maintain backward compatibility:

```typescript
// src/index.ts
export { Bus } from './bus/index';
export * from './types';
// All existing exports preserved
```

**Interface Requirements:**
- `Bus` class constructor signature unchanged
- All public methods (`init`, `addHandler`, `removeHandler`, `send`, `publish`, `sendRequest`, `publishRequest`, `close`, `isConnected`, `isHandled`) maintain same signatures
- All type exports from `types.ts` remain available

### Module Responsibilities

#### Bus Modules

1. **bus/index.ts** - Thin orchestrator that:
   - Exports the public `Bus` class
   - Delegates to internal modules
   - Maintains backward-compatible interface

2. **bus/bus-core.ts** - Core Bus logic:
   - Configuration initialization with deepmerge
   - Client instantiation
   - Connection lifecycle management

3. **bus/message-handler.ts** - Handler management:
   - `addHandler()` implementation
   - `removeHandler()` implementation
   - `isHandled()` logic
   - Handler lookup for message dispatch

4. **bus/filter-manager.ts** - Filter chain:
   - Execute `before` filters
   - Execute `after` filters
   - Execute `outgoing` filters
   - Short-circuit on `false` return

5. **bus/request-reply-manager.ts** - Request/reply state:
   - Track pending requests
   - Handle timeouts
   - Match responses to requests
   - Cleanup completed requests

#### RabbitMQ Client Modules

1. **clients/rabbitmq/index.ts** - Module coordination:
   - Exports RabbitMQ client class
   - Initializes sub-modules

2. **clients/rabbitmq/connection-manager.ts** - Connection handling:
   - Connect to AMQP broker(s)
   - Handle connection events (connect, disconnect, blocked)
   - Manage reconnection with exponential backoff
   - Channel creation

3. **clients/rabbitmq/queue-manager.ts** - Queue setup:
   - Create main queue
   - Create retry queue with dead-letter exchange
   - Create error queue
   - Create audit queue (if enabled)
   - Bind queues to exchanges

4. **clients/rabbitmq/message-processor.ts** - Message handling:
   - Consume messages from queue
   - Parse message content
   - Call consume callback
   - Ack/nack messages
   - Handle processing errors

5. **clients/rabbitmq/retry-manager.ts** - Retry logic:
   - Determine if message should retry
   - Send to retry queue
   - Track retry count
   - Send to error queue after max retries

---

## 4. Error Handling Strategy

### Error Classification

| Category | Examples | Strategy |
|----------|----------|----------|
| **Transient** | Network timeout, Connection lost, Broker unavailable | Graceful degradation with retry |
| **Configuration** | Invalid queue name, Missing credentials, Bad SSL config | Fail-fast during initialization |
| **Message Processing** | Handler throws, Invalid message format | Send to retry/error queue, continue processing |
| **Fatal** | Out of memory, Unrecoverable connection failure | Fail-fast, close connection |

### Custom Error Hierarchy

```typescript
// Base error class
class ServiceConnectError extends Error {
  readonly code: string;
  readonly isRetryable: boolean;
  readonly timestamp: Date;
  readonly cause?: Error;
  
  constructor(
    message: string,
    code: string,
    isRetryable: boolean = false,
    cause?: Error
  );
}

// Specific error types
class ConnectionError extends ServiceConnectError {
  // Connection failures, timeouts, etc.
}

class MessageError extends ServiceConnectError {
  // Message parsing, processing failures
}

class ValidationError extends ServiceConnectError {
  // Configuration validation failures
}
```

### Error Handling Patterns

#### 1. Connection Management (Graceful Degradation)

```typescript
async connect(): Promise<void> {
  const maxRetries = 5;
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await this.attemptConnection();
      this.logger.info('Connected successfully');
      return;
    } catch (error) {
      lastError = error as Error;
      this.logger.error(`Connection attempt ${attempt} failed`, error);
      
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        await this.sleep(delay);
      }
    }
  }
  
  throw new ConnectionError(
    `Failed to connect after ${maxRetries} attempts`,
    'CONNECTION_FAILED',
    false,
    lastError
  );
}
```

#### 2. Message Processing (Graceful Degradation)

```typescript
async _consumeMessage(rawMessage: ConsumeMessage | null): Promise<void> {
  if (rawMessage === null) return;
  
  this.processing++;
  
  try {
    if (!rawMessage.properties.headers?.TypeName) {
      this.logger.error('Message missing TypeName header');
      // Ack to prevent infinite loop
      this.channel?.ack(rawMessage);
      return;
    }
    
    await this._processMessage(rawMessage);
    
  } catch (error) {
    this.logger.error('Error processing message', error);
    
    if (error instanceof ServiceConnectError && error.isRetryable) {
      await this.sendToRetryQueue(rawMessage);
    } else {
      await this.sendToErrorQueue(rawMessage, error as Error);
    }
  } finally {
    if (!this.config.amqpSettings.queue.noAck) {
      this.channel?.ack(rawMessage);
    }
    this.processing--;
  }
}
```

#### 3. Configuration Validation (Fail-Fast)

```typescript
validateConfig(config: ServiceConnectConfig): void {
  if (!config.amqpSettings?.queue?.name) {
    throw new ValidationError(
      'Queue name is required. Provide amqpSettings.queue.name in config.',
      'CONFIG_MISSING_QUEUE_NAME',
      false
    );
  }
  
  if (config.amqpSettings.maxRetries < 0) {
    throw new ValidationError(
      'maxRetries must be non-negative',
      'CONFIG_INVALID_MAX_RETRIES',
      false
    );
  }
  
  // Additional validation...
}
```

---

## 5. Type Definitions (types.ts)

### Expanded Type Definitions

```typescript
// Branded types for type-safe IDs
export type MessageId = string & { __brand: 'MessageId' };
export type CorrelationId = string & { __brand: 'CorrelationId' };
export type Endpoint = string & { __brand: 'Endpoint' };

// Base message type
export interface Message {
  CorrelationId: CorrelationId;
  [key: string]: unknown;
}

// Message headers
export interface MessageHeaders {
  DestinationAddress?: string;
  MessageId?: MessageId;
  MessageType?: 'Send' | 'Publish';
  SourceAddress?: string;
  TimeSent?: string;
  TypeName?: string;
  FullTypeName?: string;
  ConsumerType?: string;
  Language?: string;
  RequestMessageId?: MessageId;
  ResponseMessageId?: MessageId;
  Priority?: number;
  RetryCount?: number;
  Exception?: unknown;
  TimeReceived?: string;
  TimeProcessed?: string;
  DestinationMachine?: string;
  [key: string]: unknown;
}

// Handler and filter types
export type MessageHandler<T extends Message> = (
  message: T,
  headers: MessageHeaders,
  type: string,
  replyCallback?: ReplyCallback<Message>
) => void | Promise<void>;

export type MessageFilter<T extends Message> = (
  message: T,
  headers: MessageHeaders,
  type: string,
  bus: Bus
) => boolean | Promise<boolean>;

export type ConsumeMessageCallback = (
  message: Message,
  headers: MessageHeaders,
  type: string
) => Promise<void>;

export type ReplyCallback<T extends Message> = (
  type: string,
  message: T
) => Promise<void>;

// Configuration types
export interface QueueConfig {
  name: string;
  durable?: boolean;
  exclusive?: boolean;
  autoDelete?: boolean;
  noAck?: boolean;
  maxPriority?: number;
  arguments?: Record<string, unknown>;
  retryQueueArguments?: Record<string, unknown>;
  utilityQueueArguments?: Record<string, unknown>;
}

export interface SSLConfig {
  enabled?: boolean;
  key?: string;
  passphrase?: string;
  cert?: string;
  ca?: string[];
  pfx?: string;
  fail_if_no_peer_cert?: boolean;
  verify?: string;
}

export interface AMQPSettings {
  queue: QueueConfig;
  ssl?: SSLConfig;
  host: string | string[];
  retryDelay: number;
  maxRetries: number;
  errorQueue: string;
  auditQueue: string;
  auditEnabled: boolean;
  prefetch: number;
}

export interface FilterConfig {
  after: MessageFilter<Message>[];
  before: MessageFilter<Message>[];
  outgoing: MessageFilter<Message>[];
}

export type HandlersConfig = Record<string, MessageHandler<Message>[]>;

export interface ServiceConnectConfig {
  amqpSettings: {
    queue: QueueConfig;
    ssl?: SSLConfig;
    host?: string | string[];
    retryDelay?: number;
    maxRetries?: number;
    errorQueue?: string;
    auditQueue?: string;
    auditEnabled?: boolean;
    prefetch?: number;
  };
  filters?: Partial<FilterConfig>;
  handlers?: HandlersConfig;
  client?: new (config: BusConfig, callback: ConsumeMessageCallback) => IClient;
  logger?: ILogger;
}

export interface BusConfig {
  amqpSettings: AMQPSettings;
  filters: FilterConfig;
  handlers: HandlersConfig;
  client: new (config: BusConfig, callback: ConsumeMessageCallback) => IClient;
  logger?: ILogger;
}

// Client interface
export interface IClient {
  connect(): Promise<void>;
  consumeType(type: string): Promise<void>;
  removeType(type: string): Promise<void>;
  send<T extends Message>(
    endpoint: string | string[],
    type: string,
    message: T,
    headers: MessageHeaders
  ): Promise<void>;
  publish<T extends Message>(
    type: string,
    message: T,
    headers: MessageHeaders
  ): Promise<void>;
  close(): Promise<void>;
  isConnected(): Promise<boolean>;
}

// Bus interface
export interface IBus {
  init(): Promise<void>;
  addHandler<T extends Message>(type: string, callback: MessageHandler<T>): Promise<void>;
  removeHandler<T extends Message>(type: string, callback: MessageHandler<T>): Promise<void>;
  isHandled(type: string): boolean;
  send<T extends Message>(
    endpoint: string | string[],
    type: string,
    message: T,
    headers?: Partial<MessageHeaders>
  ): Promise<void>;
  publish<T extends Message>(
    type: string,
    message: T,
    headers?: Partial<MessageHeaders>
  ): Promise<void>;
  sendRequest<T1 extends Message, T2 extends Message>(
    endpoint: string | string[],
    type: string,
    message: T1,
    callback: MessageHandler<T2>,
    headers?: Partial<MessageHeaders>
  ): Promise<void>;
  publishRequest<T1 extends Message, T2 extends Message>(
    type: string,
    message: T1,
    callback: MessageHandler<T2>,
    expected?: number | null,
    timeout?: number | null,
    headers?: Partial<MessageHeaders>
  ): Promise<void>;
  close(): Promise<void>;
  isConnected(): Promise<boolean>;
  client: IClient | null;
  initialized: boolean;
}

// Request/reply tracking
export interface RequestReplyCallback<T extends Message> {
  endpointCount: number;
  processedCount: number;
  callback: MessageHandler<T>;
  timeout?: NodeJS.Timeout;
}

// Logger interface
export interface ILogger {
  info(message: string): void;
  error(message: string, error?: unknown): void;
  warn?(message: string): void;
  debug?(message: string): void;
}
```

---

## 6. Testing Strategy

### Test Compatibility Requirements

1. **Existing test files must pass without modification:**
   - `test/bus.spec.ts` (1207 lines)
   - `test/rabbitMQ.spec.ts` (948 lines)

2. **Test compatibility measures:**
   - Maintain exact same public API
   - Preserve all public method signatures
   - Keep behavior identical for existing functionality
   - Ensure sinon stubs continue to work

### Test Updates (if needed)

If dependency updates require test changes:
- Update Chai assertion syntax for v6 compatibility
- Update Sinon stub APIs for v21 compatibility
- Keep test logic and expectations identical

### New Tests to Add

1. **Error handling tests:**
   - Custom error class behavior
   - Retry logic error paths
   - Connection failure scenarios

2. **Integration test updates:**
   - Verify compatibility with new amqplib version
   - Test reconnection behavior

---

## 7. Implementation Phases

### Phase 1: Dependency Update (1-2 days)
- Update all package.json dependencies
- Resolve any immediate compatibility issues
- Run existing tests to identify breaking changes

### Phase 2: Type System Overhaul (2-3 days)
- Update tsconfig.json with strict settings
- Fix all TypeScript errors
- Replace all `any` types
- Add branded types where appropriate

### Phase 3: Error Handling (2 days)
- Create error class hierarchy
- Implement error classification logic
- Add graceful degradation for transient errors
- Add fail-fast validation

### Phase 4: Code Reorganization (3-4 days)
- Create new directory structure
- Split monolithic files into modules
- Maintain public API compatibility
- Ensure all tests pass

### Phase 5: Testing & Verification (2 days)
- Run full test suite
- Verify integration tests
- Test error scenarios
- Performance verification

---

## 8. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking changes in amqplib 1.x | High | Test all RabbitMQ operations thoroughly, maintain compatibility layer |
| Breaking changes in amqp-connection-manager 5.x | High | Review migration guide, test reconnection scenarios |
| TypeScript strict mode breaks existing code | Medium | Gradual enablement, fix errors incrementally |
| Test failures due to Chai/Sinon updates | Medium | Update test syntax while preserving logic |
| Performance regression | Low | Benchmark before/after, optimize hot paths |
| Public API incompatibility | Critical | Comprehensive test coverage, API compatibility layer |

---

## 9. Success Criteria

1. **All dependencies updated** to specified versions
2. **Zero TypeScript errors** with strict mode enabled
3. **All existing tests pass** without modification
4. **No `any` types** in production code
5. **Custom error classes** implemented and used
6. **Graceful degradation** for transient connection issues
7. **Fail-fast validation** for configuration errors
8. **Public API unchanged** - existing code using library requires no changes
9. **Code coverage maintained** or improved
10. **Integration tests pass** with actual RabbitMQ

---

## 10. Appendix: Migration Notes

### amqplib 0.9.1 → 1.0.3

Review the following areas for API changes:
- Channel creation and confirmation
- Message publishing options
- Queue assertion parameters

### amqp-connection-manager 4.1.3 → 5.0.0

Key changes to verify:
- Event emitter patterns
- Channel wrapper setup functions
- Connection retry logic

### Chai 3.5.0 → 6.2.2

Potential syntax changes:
- Assertion chain methods
- Expect/should API

### Sinon 2.2.0 → 21.0.3

Verify compatibility:
- Stub creation API
- Spy behavior
- Fake timers (if used)

---

**End of Design Document**
