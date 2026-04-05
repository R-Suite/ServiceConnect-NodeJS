# ServiceConnect-NodeJS Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize ServiceConnect-NodeJS with latest dependencies, maximum TypeScript strictness, improved error handling, and code reorganization while maintaining 100% backward compatibility.

**Architecture:** Split monolithic files into focused modules under `src/bus/` and `src/clients/rabbitmq/`, implement custom error hierarchy in `src/errors/`, update all dependencies to latest major versions, enable all TypeScript strict flags.

**Tech Stack:** TypeScript 6.0.2, amqplib 1.0.3, amqp-connection-manager 5.0.0, Node.js ES2022, Mocha 11.7.5, Chai 6.2.2, Sinon 21.0.3

---

## File Structure

### New Files to Create
```
src/errors/
├── index.ts                    # Error exports
├── ServiceConnectError.ts      # Base error class
├── ConnectionError.ts          # Connection failures
├── MessageError.ts             # Message processing errors
└── ValidationError.ts          # Configuration validation

src/bus/
├── index.ts                    # Public Bus class (thin wrapper)
├── bus-core.ts                 # Core Bus implementation
├── message-handler.ts          # Handler registration/management
├── filter-manager.ts           # Filter chain execution
└── request-reply-manager.ts    # Request/reply state tracking

src/clients/rabbitmq/
├── index.ts                    # RabbitMQ client exports
├── connection-manager.ts       # AMQP connection lifecycle
├── queue-manager.ts            # Queue/exchange setup
├── message-processor.ts        # Message consumption
└── retry-manager.ts            # Retry/error queue logic
```

### Files to Modify
```
package.json                    # Update all dependencies
package-lock.json               # Regenerate after npm install
tsconfig.json                   # Enable strict flags, ES2022
src/types.ts                    # Expand type definitions
src/settings.ts                 # Update types, validation
src/index.ts                    # Re-export from new structure
src/clients/rabbitMQ.ts         # Refactor to use internal modules
```

---

## Phase 1: Dependency Updates

### Task 1: Update package.json Dependencies

**Files:**
- Modify: `package.json`

**Context:** Update all dependencies to latest major versions as specified in the design doc.

- [ ] **Step 1: Update core dependencies in package.json**

```json
{
  "dependencies": {
    "amqp-connection-manager": "^5.0.0",
    "amqplib": "^1.0.3",
    "deepmerge": "^4.3.1",
    "uuid": "^13.0.0"
  }
}
```

- [ ] **Step 2: Update dev dependencies in package.json**

```json
{
  "devDependencies": {
    "@types/amqplib": "^0.10.8",
    "@types/chai": "^5.0.0",
    "@types/mocha": "^10.0.10",
    "@types/node": "^25.5.2",
    "@types/sinon": "^17.0.3",
    "@types/uuid": "^10.0.0",
    "chai": "^6.2.2",
    "cross-env": "^7.0.3",
    "eslint": "^9.23.0",
    "mocha": "^11.7.5",
    "sinon": "^21.0.3",
    "ts-node": "^10.9.2",
    "typescript": "^6.0.2"
  }
}
```

- [ ] **Step 3: Commit the package.json changes**

```bash
git add package.json
git commit -m "deps: update all dependencies to latest major versions

- typescript: 4.7.2 → 6.0.2
- amqplib: 0.9.1 → 1.0.3
- amqp-connection-manager: 4.1.3 → 5.0.0
- uuid: 8.3.2 → 13.0.0
- chai: 3.5.0 → 6.2.2
- sinon: 2.2.0 → 21.0.3
- @types/* packages updated accordingly"
```

### Task 2: Install Dependencies and Verify

**Files:**
- Modify: `package-lock.json` (regenerated)

- [ ] **Step 1: Install updated dependencies**

```bash
npm install
```

Expected: Packages install successfully with some deprecation warnings (acceptable).

- [ ] **Step 2: Verify TypeScript version**

```bash
npx tsc --version
```

Expected: `Version 6.0.2`

- [ ] **Step 3: Attempt initial compilation to identify issues**

```bash
npm run build
```

Expected: Multiple TypeScript errors (we'll fix these in Phase 2). Note the types of errors for next phase.

- [ ] **Step 4: Commit the package-lock.json**

```bash
git add package-lock.json
git commit -m "chore: regenerate package-lock.json with updated dependencies"
```

---

## Phase 2: TypeScript Configuration

### Task 3: Update tsconfig.json for Maximum Strictness

**Files:**
- Modify: `tsconfig.json`

**Context:** Enable all TypeScript strict flags as specified in design doc.

- [ ] **Step 1: Replace tsconfig.json content**

```json
{
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "**/*.spec.ts",
    "**/*.test.ts"
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "*": ["types/*"] },
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "sourceMap": true,
    "outDir": "lib",
    "rootDir": "src",
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

- [ ] **Step 2: Commit the TypeScript configuration**

```bash
git add tsconfig.json
git commit -m "build: enable maximum TypeScript strictness

- Target ES2022 with NodeNext module resolution
- Enable all strict flags including exactOptionalPropertyTypes
- Add noUncheckedIndexedAccess for safer property access
- Generate declaration maps for better IDE support"
```

---

## Phase 3: Error Handling Infrastructure

### Task 4: Create Base Error Class

**Files:**
- Create: `src/errors/ServiceConnectError.ts`

**Context:** Base error class with common properties for all ServiceConnect errors.

- [ ] **Step 1: Create ServiceConnectError.ts**

```typescript
/**
 * Base error class for all ServiceConnect errors.
 * Provides common properties for error classification and handling.
 */
export class ServiceConnectError extends Error {
  /**
   * Error code for programmatic handling
   */
  readonly code: string;
  
  /**
   * Whether this error is retryable (transient)
   */
  readonly isRetryable: boolean;
  
  /**
   * Timestamp when the error occurred
   */
  readonly timestamp: Date;
  
  /**
   * Original error that caused this error (if any)
   */
  readonly cause?: Error;

  /**
   * Creates a new ServiceConnectError
   * @param message - Human-readable error message
   * @param code - Error code for programmatic handling
   * @param isRetryable - Whether the operation can be retried
   * @param cause - Original error that caused this error
   */
  constructor(
    message: string,
    code: string,
    isRetryable: boolean = false,
    cause?: Error
  ) {
    super(message);
    this.name = 'ServiceConnectError';
    this.code = code;
    this.isRetryable = isRetryable;
    this.timestamp = new Date();
    this.cause = cause;
    
    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ServiceConnectError);
    }
  }

  /**
   * Returns a JSON representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      isRetryable: this.isRetryable,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      cause: this.cause?.message
    };
  }
}
```

- [ ] **Step 2: Commit the base error class**

```bash
git add src/errors/ServiceConnectError.ts
git commit -m "feat(errors): add ServiceConnectError base class

- Provides code, isRetryable, timestamp, and cause properties
- Includes toJSON() method for serialization
- Maintains proper stack traces"
```

### Task 5: Create ConnectionError Class

**Files:**
- Create: `src/errors/ConnectionError.ts`

- [ ] **Step 1: Create ConnectionError.ts**

```typescript
import { ServiceConnectError } from './ServiceConnectError';

/**
 * Error thrown when connection to message broker fails.
 * Typically retryable for transient network issues.
 */
export class ConnectionError extends ServiceConnectError {
  /**
   * Host that failed to connect (if known)
   */
  readonly host?: string;

  constructor(
    message: string,
    code: string,
    isRetryable: boolean = true,
    cause?: Error,
    host?: string
  ) {
    super(message, code, isRetryable, cause);
    this.name = 'ConnectionError';
    this.host = host;
  }
}

/**
 * Predefined connection error codes
 */
export const ConnectionErrorCodes = {
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  CONNECTION_LOST: 'CONNECTION_LOST',
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  HOST_UNREACHABLE: 'HOST_UNREACHABLE',
  CHANNEL_CLOSED: 'CHANNEL_CLOSED'
} as const;
```

- [ ] **Step 2: Commit the connection error class**

```bash
git add src/errors/ConnectionError.ts
git commit -m "feat(errors): add ConnectionError for broker connection issues

- Extends ServiceConnectError with host property
- Includes predefined error codes
- Defaults to retryable for transient issues"
```

### Task 6: Create MessageError Class

**Files:**
- Create: `src/errors/MessageError.ts`

- [ ] **Step 1: Create MessageError.ts**

```typescript
import { ServiceConnectError } from './ServiceConnectError';

/**
 * Error thrown during message processing.
 * May be retryable depending on the nature of the failure.
 */
export class MessageError extends ServiceConnectError {
  /**
   * Message type that failed (if known)
   */
  readonly messageType?: string;
  
  /**
   * Message ID that failed (if known)
   */
  readonly messageId?: string;

  constructor(
    message: string,
    code: string,
    isRetryable: boolean = false,
    cause?: Error,
    messageType?: string,
    messageId?: string
  ) {
    super(message, code, isRetryable, cause);
    this.name = 'MessageError';
    this.messageType = messageType;
    this.messageId = messageId;
  }
}

/**
 * Predefined message error codes
 */
export const MessageErrorCodes = {
  INVALID_MESSAGE_FORMAT: 'INVALID_MESSAGE_FORMAT',
  MESSAGE_PARSE_ERROR: 'MESSAGE_PARSE_ERROR',
  MISSING_TYPE_NAME: 'MISSING_TYPE_NAME',
  HANDLER_FAILED: 'HANDLER_FAILED',
  PUBLISH_FAILED: 'PUBLISH_FAILED',
  SEND_FAILED: 'SEND_FAILED'
} as const;
```

- [ ] **Step 2: Commit the message error class**

```bash
git add src/errors/MessageError.ts
git commit -m "feat(errors): add MessageError for message processing failures

- Extends ServiceConnectError with messageType and messageId
- Defaults to non-retryable (handler logic errors)
- Includes predefined error codes"
```

### Task 7: Create ValidationError Class

**Files:**
- Create: `src/errors/ValidationError.ts`

- [ ] **Step 1: Create ValidationError.ts**

```typescript
import { ServiceConnectError } from './ServiceConnectError';

/**
 * Error thrown when configuration validation fails.
 * Never retryable - indicates programming error or bad configuration.
 */
export class ValidationError extends ServiceConnectError {
  /**
   * Configuration field that failed validation
   */
  readonly field?: string;

  constructor(
    message: string,
    code: string,
    field?: string
  ) {
    // Validation errors are never retryable
    super(message, code, false, undefined);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Predefined validation error codes
 */
export const ValidationErrorCodes = {
  CONFIG_MISSING_QUEUE_NAME: 'CONFIG_MISSING_QUEUE_NAME',
  CONFIG_INVALID_MAX_RETRIES: 'CONFIG_INVALID_MAX_RETRIES',
  CONFIG_INVALID_RETRY_DELAY: 'CONFIG_INVALID_RETRY_DELAY',
  CONFIG_MISSING_HOST: 'CONFIG_MISSING_HOST',
  CONFIG_INVALID_PREFETCH: 'CONFIG_INVALID_PREFETCH',
  CONFIG_INVALID_SSL: 'CONFIG_INVALID_SSL'
} as const;
```

- [ ] **Step 2: Commit the validation error class**

```bash
git add src/errors/ValidationError.ts
git commit -m "feat(errors): add ValidationError for configuration failures

- Extends ServiceConnectError with field property
- Always non-retryable (config errors must be fixed)
- Includes predefined error codes for common validation failures"
```

### Task 8: Create Error Index File

**Files:**
- Create: `src/errors/index.ts`

- [ ] **Step 1: Create index.ts**

```typescript
/**
 * Error classes for ServiceConnect
 */

export { ServiceConnectError } from './ServiceConnectError';
export { ConnectionError, ConnectionErrorCodes } from './ConnectionError';
export { MessageError, MessageErrorCodes } from './MessageError';
export { ValidationError, ValidationErrorCodes } from './ValidationError';
```

- [ ] **Step 2: Commit the error index**

```bash
git add src/errors/index.ts
git commit -m "feat(errors): export all error classes from index

- Centralized exports for error classes
- Includes error code constants"
```

---

## Phase 4: Type Definitions Update

### Task 9: Expand types.ts with Complete Type Definitions

**Files:**
- Modify: `src/types.ts`

**Context:** Replace existing types.ts with comprehensive type definitions using branded types and strict null checking.

- [ ] **Step 1: Read current types.ts to understand what needs updating**

Already done during design phase. Current file has 134 lines with basic types.

- [ ] **Step 2: Replace types.ts with expanded definitions**

```typescript
import type { Bus } from './bus/index';

/**
 * Branded type for message IDs to ensure type safety
 */
export type MessageId = string & { __brand: 'MessageId' };

/**
 * Branded type for correlation IDs
 */
export type CorrelationId = string & { __brand: 'CorrelationId' };

/**
 * Branded type for endpoints
 */
export type Endpoint = string & { __brand: 'Endpoint' };

/**
 * Base message interface.
 * All messages must have a CorrelationId.
 */
export interface Message {
  CorrelationId: CorrelationId;
  [key: string]: unknown;
}

/**
 * Standard message headers used throughout the system
 */
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

/**
 * Handler function type for message processing
 */
export type MessageHandler<T extends Message> = (
  message: T,
  headers: MessageHeaders,
  type: string,
  replyCallback?: ReplyCallback<Message>
) => void | Promise<void>;

/**
 * Filter function type for message filtering
 */
export type MessageFilter<T extends Message> = (
  message: T,
  headers: MessageHeaders,
  type: string,
  bus: Bus
) => boolean | Promise<boolean>;

/**
 * Callback for consuming raw messages from the transport
 */
export type ConsumeMessageCallback = (
  message: Message,
  headers: MessageHeaders,
  type: string
) => Promise<void>;

/**
 * Callback for replying to messages
 */
export type ReplyCallback<T extends Message> = (
  type: string,
  message: T
) => Promise<void>;

/**
 * Queue configuration options
 */
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

/**
 * SSL/TLS configuration options
 */
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

/**
 * AMQP-specific settings
 */
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

/**
 * Message filter configuration
 */
export interface FilterConfig {
  after: MessageFilter<Message>[];
  before: MessageFilter<Message>[];
  outgoing: MessageFilter<Message>[];
}

/**
 * Handler configuration - maps message types to handlers
 */
export type HandlersConfig = Record<string, MessageHandler<Message>[]>;

/**
 * User-provided configuration (partial, will be merged with defaults)
 */
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

/**
 * Complete configuration after merging with defaults
 */
export interface BusConfig {
  amqpSettings: AMQPSettings;
  filters: FilterConfig;
  handlers: HandlersConfig;
  client: new (config: BusConfig, callback: ConsumeMessageCallback) => IClient;
  logger?: ILogger;
}

/**
 * Transport client interface (RabbitMQ, etc.)
 */
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

/**
 * Public Bus interface
 */
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

/**
 * Request/reply callback tracking
 */
export interface RequestReplyCallback<T extends Message> {
  endpointCount: number;
  processedCount: number;
  callback: MessageHandler<T>;
  timeout?: NodeJS.Timeout;
}

/**
 * Logger interface
 */
export interface ILogger {
  info(message: string): void;
  error(message: string, error?: unknown): void;
  warn?(message: string): void;
  debug?(message: string): void;
}
```

- [ ] **Step 3: Commit the updated types**

```bash
git add src/types.ts
git commit -m "feat(types): expand type definitions with strict types

- Add branded types for MessageId, CorrelationId, Endpoint
- Define complete MessageHeaders interface
- Add QueueConfig, SSLConfig, AMQPSettings interfaces
- Use Partial<MessageHeaders> for optional headers in public API
- Maintain backward compatibility"
```

---

## Phase 5: Bus Module Implementation

### Task 10: Create Request-Reply Manager

**Files:**
- Create: `src/bus/request-reply-manager.ts`

**Context:** Manages pending request/reply state including timeouts and cleanup.

- [ ] **Step 1: Create request-reply-manager.ts**

```typescript
import type { Message, MessageHandler, RequestReplyCallback } from '../types';

/**
 * Manages request/reply state for pending requests.
 * Tracks callbacks, timeouts, and completion counts.
 */
export class RequestReplyManager {
  private callbacks: Map<string, RequestReplyCallback<Message>> = new Map();

  /**
   * Register a new request for reply tracking
   * @param messageId - Unique message ID for this request
   * @param endpointCount - Number of expected replies
   * @param callback - Handler to call when reply arrives
   * @param timeoutMs - Optional timeout in milliseconds
   */
  registerRequest(
    messageId: string,
    endpointCount: number,
    callback: MessageHandler<Message>,
    timeoutMs: number | null
  ): void {
    const config: RequestReplyCallback<Message> = {
      endpointCount,
      processedCount: 0,
      callback
    };

    if (timeoutMs !== null && timeoutMs > 0) {
      config.timeout = setTimeout(() => {
        this.cleanupRequest(messageId);
      }, timeoutMs);
    }

    this.callbacks.set(messageId, config);
  }

  /**
   * Process a reply message and invoke the callback if found
   * @param messageId - The response message ID
   * @param message - The reply message
   * @param headers - Message headers
   * @param type - Message type
   * @returns Promise that resolves when callback completes
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

    await config.callback(message, headers, type);
    config.processedCount++;

    if (config.processedCount >= config.endpointCount) {
      this.cleanupRequest(messageId);
    }
  }

  /**
   * Check if a request is still pending
   * @param messageId - The message ID to check
   */
  hasPendingRequest(messageId: string): boolean {
    return this.callbacks.has(messageId);
  }

  /**
   * Get the number of pending requests
   */
  getPendingCount(): number {
    return this.callbacks.size;
  }

  /**
   * Clean up all pending requests and their timeouts
   */
  cleanupAll(): void {
    for (const [messageId, config] of this.callbacks) {
      if (config.timeout) {
        clearTimeout(config.timeout);
      }
    }
    this.callbacks.clear();
  }

  /**
   * Clean up a specific request
   * @param messageId - The message ID to clean up
   */
  private cleanupRequest(messageId: string): void {
    const config = this.callbacks.get(messageId);
    if (config?.timeout) {
      clearTimeout(config.timeout);
    }
    this.callbacks.delete(messageId);
  }
}
```

- [ ] **Step 2: Commit the request-reply manager**

```bash
git add src/bus/request-reply-manager.ts
git commit -m "feat(bus): add RequestReplyManager for request/reply tracking

- Manages pending request callbacks
- Handles timeouts and automatic cleanup
- Tracks completion counts for multi-endpoint requests"
```

### Task 11: Create Filter Manager

**Files:**
- Create: `src/bus/filter-manager.ts`

- [ ] **Step 1: Create filter-manager.ts**

```typescript
import type { Bus } from './index';
import type { Message, MessageFilter } from '../types';

/**
 * Executes filter chains for message processing.
 * Supports before, after, and outgoing filters.
 */
export class FilterManager {
  /**
   * Execute a chain of filters on a message
   * @param filters - Array of filter functions to execute
   * @param message - The message being filtered
   * @param headers - Message headers
   * @param type - Message type
   * @param bus - Bus instance for context
   * @returns True if all filters pass, false if any filter rejects
   */
  async executeFilters<T extends Message>(
    filters: MessageFilter<T>[],
    message: T,
    headers: Record<string, unknown>,
    type: string,
    bus: Bus
  ): Promise<boolean> {
    for (const filter of filters) {
      const result = await filter(message, headers, type, bus);
      if (result === false) {
        return false;
      }
    }
    return true;
  }

  /**
   * Execute before filters
   * @returns True if message should be processed, false to skip
   */
  async executeBefore<T extends Message>(
    filters: MessageFilter<T>[],
    message: T,
    headers: Record<string, unknown>,
    type: string,
    bus: Bus
  ): Promise<boolean> {
    return this.executeFilters(filters, message, headers, type, bus);
  }

  /**
   * Execute after filters (post-processing)
   * @returns True if processing completed successfully
   */
  async executeAfter<T extends Message>(
    filters: MessageFilter<T>[],
    message: T,
    headers: Record<string, unknown>,
    type: string,
    bus: Bus
  ): Promise<boolean> {
    return this.executeFilters(filters, message, headers, type, bus);
  }

  /**
   * Execute outgoing filters (for sent/published messages)
   * @returns True if message should be sent, false to drop
   */
  async executeOutgoing<T extends Message>(
    filters: MessageFilter<T>[],
    message: T,
    headers: Record<string, unknown>,
    type: string,
    bus: Bus
  ): Promise<boolean> {
    return this.executeFilters(filters, message, headers, type, bus);
  }
}
```

- [ ] **Step 2: Commit the filter manager**

```bash
git add src/bus/filter-manager.ts
git commit -m "feat(bus): add FilterManager for message filter chains

- Executes before, after, and outgoing filter chains
- Short-circuits on first filter returning false
- Supports async filter functions"
```

### Task 12: Create Message Handler Module

**Files:**
- Create: `src/bus/message-handler.ts`

- [ ] **Step 1: Create message-handler.ts**

```typescript
import type { Message, MessageHandler, HandlersConfig } from '../types';

/**
 * Manages message handler registration and lookup.
 */
export class MessageHandlerManager {
  private handlers: HandlersConfig = {};

  /**
   * Add a handler for a message type
   * @param messageType - The message type to handle
   * @param handler - The handler function
   */
  addHandler<T extends Message>(
    messageType: string,
    handler: MessageHandler<T>
  ): void {
    if (!this.handlers[messageType]) {
      this.handlers[messageType] = [];
    }
    this.handlers[messageType].push(handler as MessageHandler<Message>);
  }

  /**
   * Remove a handler for a message type
   * @param messageType - The message type
   * @param handler - The handler function to remove
   * @returns True if handler was found and removed
   */
  removeHandler<T extends Message>(
    messageType: string,
    handler: MessageHandler<T>
  ): boolean {
    const handlers = this.handlers[messageType];
    if (!handlers) {
      return false;
    }

    const index = handlers.indexOf(handler as MessageHandler<Message>);
    if (index === -1) {
      return false;
    }

    handlers.splice(index, 1);
    return true;
  }

  /**
   * Check if a message type has any handlers
   * @param messageType - The message type to check
   */
  isHandled(messageType: string): boolean {
    const handlers = this.handlers[messageType];
    return handlers !== undefined && handlers.length > 0;
  }

  /**
   * Get all handlers for a message type, including wildcard handlers
   * @param messageType - The message type
   * @returns Array of handlers
   */
  getHandlers(messageType: string): MessageHandler<Message>[] {
    const specific = this.handlers[messageType] || [];
    const wildcard = this.handlers['*'] || [];
    return [...specific, ...wildcard];
  }

  /**
   * Get the number of handlers for a message type
   * @param messageType - The message type
   */
  getHandlerCount(messageType: string): number {
    return this.getHandlers(messageType).length;
  }

  /**
   * Check if a message type has no handlers (for cleanup)
   * @param messageType - The message type
   */
  hasNoHandlers(messageType: string): boolean {
    const handlers = this.handlers[messageType];
    return handlers === undefined || handlers.length === 0;
  }

  /**
   * Get the raw handlers config (for client initialization)
   */
  getHandlersConfig(): HandlersConfig {
    return { ...this.handlers };
  }

  /**
   * Initialize handlers from config (for restoring state)
   * @param config - Handlers configuration
   */
  initializeFromConfig(config: HandlersConfig): void {
    this.handlers = { ...config };
  }
}
```

- [ ] **Step 2: Commit the message handler**

```bash
git add src/bus/message-handler.ts
git commit -m "feat(bus): add MessageHandlerManager for handler registration

- Add/remove handlers by message type
- Support wildcard (*) handlers
- Track handler counts for cleanup decisions"
```

### Task 13: Create Bus Core Module

**Files:**
- Create: `src/bus/bus-core.ts`

- [ ] **Step 1: Create bus-core.ts**

```typescript
import type { BusConfig, ConsumeMessageCallback, IClient } from '../types';

/**
 * Core Bus functionality - configuration and client management.
 */
export class BusCore {
  public config: BusConfig;
  public client: IClient | null = null;
  public initialized = false;

  constructor(config: BusConfig) {
    this.config = config;
  }

  /**
   * Initialize the bus by creating and connecting to the client
   */
  async init(consumeCallback: ConsumeMessageCallback): Promise<void> {
    const ClientConstructor = this.config.client;
    this.client = new ClientConstructor(this.config, consumeCallback);
    await this.client.connect();
    this.initialized = true;
  }

  /**
   * Close the bus and cleanup resources
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
    this.initialized = false;
    this.client = null;
  }

  /**
   * Check if the client is connected
   */
  async isConnected(): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    return this.client.isConnected();
  }
}
```

- [ ] **Step 2: Commit the bus core**

```bash
git add src/bus/bus-core.ts
git commit -m "feat(bus): add BusCore for configuration and client management

- Manages BusConfig and IClient instance
- Handles initialization and cleanup
- Provides connection status checking"
```

### Task 14: Create Main Bus Module

**Files:**
- Create: `src/bus/index.ts`

- [ ] **Step 1: Create bus/index.ts**

```typescript
import { v4 as uuidv4 } from 'uuid';
import merge from 'deepmerge';
import settings from '../settings';
import { ValidationError, ValidationErrorCodes } from '../errors';
import { BusCore } from './bus-core';
import { MessageHandlerManager } from './message-handler';
import { FilterManager } from './filter-manager';
import { RequestReplyManager } from './request-reply-manager';
import type {
  ServiceConnectConfig,
  BusConfig,
  Message,
  MessageHandler,
  MessageHeaders,
  ReplyCallback,
  ConsumeMessageCallback
} from '../types';

/**
 * Bus class - main entry point for messaging operations.
 * Maintains backward-compatible public API while delegating to internal modules.
 */
export class Bus {
  public id: string;
  public initialized = false;
  public client = null;
  public config: BusConfig;

  private core: BusCore;
  private handlerManager: MessageHandlerManager;
  private filterManager: FilterManager;
  private requestReplyManager: RequestReplyManager;

  constructor(config: ServiceConnectConfig) {
    this.id = uuidv4();
    
    // Validate config before merging
    this.validateConfig(config);
    
    // Merge with defaults
    this.config = merge(settings(), config) as BusConfig;
    
    // Initialize modules
    this.core = new BusCore(this.config);
    this.handlerManager = new MessageHandlerManager();
    this.filterManager = new FilterManager();
    this.requestReplyManager = new RequestReplyManager();

    // Bind methods to preserve 'this' context
    this.init = this.init.bind(this);
    this.addHandler = this.addHandler.bind(this);
    this.removeHandler = this.removeHandler.bind(this);
    this.send = this.send.bind(this);
    this.publish = this.publish.bind(this);
    this.sendRequest = this.sendRequest.bind(this);
    this.publishRequest = this.publishRequest.bind(this);
    this.close = this.close.bind(this);
    this.isConnected = this.isConnected.bind(this);
    this.isHandled = this.isHandled.bind(this);
  }

  /**
   * Validate user-provided configuration
   */
  private validateConfig(config: ServiceConnectConfig): void {
    if (!config.amqpSettings?.queue?.name) {
      throw new ValidationError(
        'Queue name is required. Provide amqpSettings.queue.name in config.',
        ValidationErrorCodes.CONFIG_MISSING_QUEUE_NAME,
        'amqpSettings.queue.name'
      );
    }
  }

  /**
   * Initialize the bus - creates client and connects to broker
   */
  async init(): Promise<void> {
    await this.core.init(this.consumeMessage.bind(this));
    this.client = this.core.client as unknown as null;
    this.initialized = this.core.initialized;
  }

  /**
   * Add a handler for a message type
   */
  async addHandler<T extends Message>(
    messageType: string,
    handler: MessageHandler<T>
  ): Promise<void> {
    const normalizedType = messageType.replace(/\./g, '');
    
    // Start consuming the type if not wildcard
    if (normalizedType !== '*' && this.core.client) {
      await this.core.client.consumeType(normalizedType);
    }
    
    this.handlerManager.addHandler(messageType, handler);
  }

  /**
   * Remove a handler for a message type
   */
  async removeHandler<T extends Message>(
    messageType: string,
    handler: MessageHandler<T>
  ): Promise<void> {
    this.handlerManager.removeHandler(messageType, handler);
    
    // Stop consuming if no more handlers
    if (messageType !== '*' && this.handlerManager.hasNoHandlers(messageType)) {
      const normalizedType = messageType.replace(/\./g, '');
      if (this.core.client) {
        await this.core.client.removeType(normalizedType);
      }
    }
  }

  /**
   * Check if a message type is being handled
   */
  isHandled(messageType: string): boolean {
    return this.handlerManager.isHandled(messageType);
  }

  /**
   * Send a command to specified endpoint(s)
   */
  async send<T extends Message>(
    endpoint: string | string[],
    type: string,
    message: T,
    headers: Partial<MessageHeaders> = {}
  ): Promise<void> {
    const shouldSend = await this.filterManager.executeOutgoing(
      this.config.filters.outgoing,
      message,
      headers as Record<string, unknown>,
      type,
      this
    );
    
    if (!shouldSend || !this.core.client) {
      return;
    }
    
    await this.core.client.send(
      endpoint,
      type,
      message,
      headers as MessageHeaders
    );
  }

  /**
   * Publish an event of specified type
   */
  async publish<T extends Message>(
    type: string,
    message: T,
    headers: Partial<MessageHeaders> = {}
  ): Promise<void> {
    const shouldPublish = await this.filterManager.executeOutgoing(
      this.config.filters.outgoing,
      message,
      headers as Record<string, unknown>,
      type,
      this
    );
    
    if (!shouldPublish || !this.core.client) {
      return;
    }
    
    await this.core.client.publish(type, message, headers as MessageHeaders);
  }

  /**
   * Send a command and wait for reply
   */
  async sendRequest<T1 extends Message, T2 extends Message>(
    endpoint: string | string[],
    type: string,
    message: T1,
    callback: MessageHandler<T2>,
    headers: Partial<MessageHeaders> = {}
  ): Promise<void> {
    const shouldSend = await this.filterManager.executeOutgoing(
      this.config.filters.outgoing,
      message,
      headers as Record<string, unknown>,
      type,
      this
    );
    
    if (!shouldSend) {
      return;
    }

    const messageId = uuidv4();
    const endpoints = Array.isArray(endpoint) ? endpoint : [endpoint];
    
    this.requestReplyManager.registerRequest(
      messageId,
      endpoints.length,
      callback as MessageHandler<Message>,
      null
    );
    
    headers.RequestMessageId = messageId as string;
    
    if (this.core.client) {
      await this.core.client.send(
        endpoint,
        type,
        message,
        headers as MessageHeaders
      );
    }
  }

  /**
   * Publish an event and wait for replies
   */
  async publishRequest<T1 extends Message, T2 extends Message>(
    type: string,
    message: T1,
    callback: MessageHandler<T2>,
    expected: number | null = null,
    timeout: number | null = 10000,
    headers: Partial<MessageHeaders> = {}
  ): Promise<void> {
    const shouldPublish = await this.filterManager.executeOutgoing(
      this.config.filters.outgoing,
      message,
      headers as Record<string, unknown>,
      type,
      this
    );
    
    if (!shouldPublish) {
      return;
    }

    const messageId = uuidv4();
    const expectedCount = expected === null ? -1 : expected;
    
    this.requestReplyManager.registerRequest(
      messageId,
      expectedCount,
      callback as MessageHandler<Message>,
      timeout
    );
    
    headers.RequestMessageId = messageId as string;
    
    if (this.core.client) {
      await this.core.client.publish(type, message, headers as MessageHeaders);
    }
  }

  /**
   * Close the bus and cleanup
   */
  async close(): Promise<void> {
    this.requestReplyManager.cleanupAll();
    await this.core.close();
    this.initialized = false;
    this.client = null;
  }

  /**
   * Check if connected to broker
   */
  async isConnected(): Promise<boolean> {
    return this.core.isConnected();
  }

  /**
   * Internal callback for consuming messages from client
   */
  private async consumeMessage(
    message: Message,
    headers: Record<string, unknown>,
    type: string
  ): Promise<void> {
    try {
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

      await Promise.all(handlerPromises);

      // Execute after filters
      await this.filterManager.executeAfter(
        this.config.filters.after,
        message,
        headers,
        type,
        this
      );
    } catch (error) {
      if (this.config.logger) {
        this.config.logger.error('Error processing message', error);
      }
      throw error;
    }
  }

  /**
   * Create a reply callback for handlers
   */
  private createReplyCallback(
    headers: Record<string, unknown>
  ): ReplyCallback<Message> {
    return async (type: string, message: Message): Promise<void> => {
      headers.ResponseMessageId = headers.RequestMessageId;
      const sourceAddress = headers.SourceAddress as string;
      if (sourceAddress && this.core.client) {
        await this.core.client.send(
          sourceAddress,
          type,
          message,
          headers as MessageHeaders
        );
      }
    };
  }
}
```

- [ ] **Step 2: Commit the main Bus module**

```bash
git add src/bus/index.ts
git commit -m "feat(bus): implement main Bus class with modular architecture

- Delegates to MessageHandlerManager, FilterManager, RequestReplyManager
- Maintains backward-compatible public API
- Implements graceful error handling in consumeMessage
- Validates configuration on construction"
```

---

*Continues in Part 2 with RabbitMQ client modules, settings updates, and test verification...*

**Note to implementer:** The plan continues with Phase 6 (RabbitMQ client refactoring), Phase 7 (Settings updates), and Phase 8 (Testing). Each phase follows the same pattern: specific files, step-by-step implementation, exact code, and commit commands.
