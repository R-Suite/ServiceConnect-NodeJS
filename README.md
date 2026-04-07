# ServiceConnect

An opinionated messaging framework for Node.js over RabbitMQ. It manages queue infrastructure, message routing, retries, dead-lettering, and auditing so your application code only deals with sending and handling messages.

## Why ServiceConnect?

Building distributed systems on RabbitMQ means dealing with exchange declarations, queue bindings, dead-letter routing, retry delays, consumer prefetch, connection recovery, and message serialization — before you write a single line of business logic.

ServiceConnect handles all of that. You configure a `Bus`, call `init()`, and start sending and receiving messages. The library:

- **Creates and manages all RabbitMQ infrastructure** on connect — queues, exchanges, bindings, retry queues, error queues, and audit queues
- **Automatically recovers** from connection drops and channel closures, re-establishing all bindings
- **Routes failed messages** through a retry queue with configurable delay and max attempts, then to a dead-letter (error) queue
- **Copies successful messages** to an audit queue when auditing is enabled
- **Supports four messaging patterns** out of the box: commands, events, request/reply, and scatter/gather

## Installation

```bash
npm install service-connect
```

Requires Node.js >= 18 and a running RabbitMQ instance.

## Quick Start

```typescript
import { Bus } from 'service-connect';

// Create a consumer
const consumer = new Bus({
  amqpSettings: {
    host: 'amqp://localhost',
    queue: { name: 'order-service' }
  }
});

await consumer.init();

await consumer.addHandler('OrderCreated', async (message, headers, type) => {
  console.log('Order received:', message.orderId);
});
```

```typescript
// Create a producer and publish an event
const producer = new Bus({
  amqpSettings: {
    host: 'amqp://localhost',
    queue: { name: 'api-gateway' }
  }
});

await producer.init();
await producer.publish('OrderCreated', { CorrelationId: 'abc-123', orderId: 42 });
```

## How It Works

### What Happens on `init()`

When you call `bus.init()`, ServiceConnect establishes a connection to RabbitMQ and creates all the infrastructure your service needs:

```
RabbitMQ Broker
+----------------------------------------------------------+
|                                                          |
|  Queue: "order-service"           (your main queue)      |
|  Queue: "order-service.Retries"   (retry delay queue)    |
|  Queue: "errors"                  (dead-letter queue)    |
|  Queue: "audit"                   (if auditing enabled)  |
|                                                          |
|  Exchange: "order-service.Retries.DeadLetter" (direct)   |
|    bound to → "order-service" queue                      |
|                                                          |
|  Exchange: "errors" (direct)                             |
|  Exchange: "audit" (direct, if auditing enabled)         |
|                                                          |
+----------------------------------------------------------+
```

The retry queue is configured with an `x-message-ttl` matching your `retryDelay` setting and a dead-letter exchange that routes expired messages back to your main queue — this is how delayed retries work without polling.

### Exchange Bindings for Events

When you subscribe to a message type (via `addHandler` or `handlers` config), ServiceConnect creates a **fanout exchange** named after that type and binds your queue to it:

```
Exchange: "OrderCreated" (fanout)
  ├── bound to → "order-service" queue
  ├── bound to → "notification-service" queue
  └── bound to → "analytics-service" queue
```

Publishing an event sends the message to the exchange. Every queue bound to that exchange receives a copy. This is how pub/sub works — publishers don't need to know about subscribers, and adding a new subscriber is just binding another queue.

Commands (`send`) bypass exchanges entirely and go straight to the target queue by name.

### Message Flow

Every message follows this lifecycle:

```
Producer                           Consumer
   |                                  |
   |  send/publish                    |
   |─────────────────────────────────>|
   |                                  |  handler called
   |                                  |
   |                          success?|
   |                         ┌── yes ─┤
   |                         │        │── nack (requeue=false)
   |                    ack  │   no ──┤
   |                         │        │  retries left?
   |               ┌─────────┘   yes ─┤── send to retry queue
   |               │                  │      (waits retryDelay ms,
   |               │             no ──┤       then re-delivered)
   |               │                  │
   |         audit enabled?           │── send to error queue
   |          yes ─┤                  |
   |               │── copy to        |
   |               │   audit queue    |
   |               │                  |
   |          no ──┤                  |
   |               └──── done         |
```

**On success:** The message is acknowledged. If auditing is enabled, a copy is sent to the audit queue with a `TimeProcessed` header.

**On failure:** The `RetryCount` header is checked against `maxRetries`. If retries remain, the message is sent to the retry queue (which holds it for `retryDelay` ms via TTL, then dead-letters it back to your main queue). If retries are exhausted, the message goes to the error queue with an `Exception` header containing the error details.

**On shutdown:** Messages that arrive while the bus is closing are nacked with `requeue=true`, so RabbitMQ delivers them to another consumer.

### Automatic Reconnection

ServiceConnect uses `amqp-connection-manager` under the hood, which handles connection recovery transparently. If the connection drops:

1. The library automatically reconnects with exponential backoff
2. All channel setup functions (queue declarations, exchange bindings, consumer registrations) are re-executed
3. Your handlers resume processing without any application-level intervention

Initial connection uses configurable retry logic (`connectionMaxRetries`, `connectionRetryDelay`, `connectionTimeout`).

## Messaging Patterns

### Commands (Point-to-Point)

Send a message directly to a named queue. Exactly one consumer processes it.

```typescript
// Send to one endpoint
await sender.send('order-processor', 'ProcessOrder', {
  CorrelationId: 'abc-123',
  orderId: 42
});

// Send to multiple endpoints
await sender.send(
  ['order-processor', 'audit-recorder'],
  'ProcessOrder',
  { CorrelationId: 'abc-123', orderId: 42 }
);
```

### Events (Publish/Subscribe)

Publish a message to a fanout exchange. Every subscriber gets a copy.

```typescript
// Publisher
await publisher.publish('OrderCreated', {
  CorrelationId: 'abc-123',
  orderId: 42,
  total: 99.99
});

// Subscriber (different service)
await consumer.addHandler('OrderCreated', async (message) => {
  console.log('New order:', message.orderId);
});
```

### Request/Reply

Send a command and receive a response routed back to your queue.

```typescript
// Service handles request and replies
await service.addHandler('GetOrderStatus', async (message, headers, type, reply) => {
  const status = await lookupOrder(message.orderId);
  await reply('OrderStatusResponse', {
    CorrelationId: message.CorrelationId,
    status
  });
});

// Client sends request and processes reply
await client.sendRequest(
  'order-service',
  'GetOrderStatus',
  { CorrelationId: 'abc-123', orderId: 42 },
  async (response) => {
    console.log('Order status:', response.status);
  }
);
```

Reply routing works through message headers: the request includes a `RequestMessageId` and the sender's `SourceAddress`. The responder sends the reply back to that address with a `ResponseMessageId` matching the original request. ServiceConnect correlates the reply and invokes your callback.

### Scatter/Gather

Publish a request to multiple subscribers and collect responses. Useful for aggregation (e.g. price quotes from multiple suppliers).

```typescript
await aggregator.publishRequest(
  'PriceRequest',
  { CorrelationId: 'abc-123', productId: 'WIDGET-X' },
  async (response, headers) => {
    if (headers.timedOut) {
      console.log('Collection period ended');
      return;
    }
    console.log('Received quote:', response.price);
  },
  5,      // expected number of responses (or -1 for unknown)
  10000   // timeout in ms
);
```

The callback fires once per response. When the expected count is reached or the timeout elapses, a final call is made with `headers.timedOut = true`. Duplicate responses from the same source are deduplicated automatically.

## Configuration

```typescript
const bus = new Bus({
  amqpSettings: {
    // Connection
    host: 'amqp://localhost',           // string or string[] for HA
    connectionTimeout: 30000,           // ms to wait for initial connection
    connectionRetryDelay: 30000,        // max ms between connection retries
    connectionMaxRetries: 5,            // attempts before giving up

    // Queue
    queue: {
      name: 'my-service',              // REQUIRED - your service's queue name
      durable: true,                    // survive broker restart (default: true)
      exclusive: false,                 // single-consumer only (default: false)
      autoDelete: false,                // delete when last consumer disconnects
      noAck: false,                     // auto-ack messages (default: false)
      maxPriority: 10,                  // enable priority queue (optional)
    },

    // Retry & error handling
    maxRetries: 3,                      // retry attempts before dead-lettering
    retryDelay: 3000,                   // ms to hold messages in retry queue
    errorQueue: 'errors',               // dead-letter queue name

    // Auditing
    auditEnabled: false,                // copy successful messages to audit queue
    auditQueue: 'audit',                // audit queue name

    // Consumer
    prefetch: 100,                      // messages to prefetch per consumer
    defaultRequestTimeout: 10000,       // ms timeout for request/reply

    // SSL/TLS (optional)
    ssl: {
      enabled: false,
      cert: Buffer,                     // client certificate
      key: Buffer,                      // client key
      ca: Buffer,                       // CA certificate
      pfx: Buffer,                      // alternative: PKCS12 bundle
      passphrase: 'secret',
      verify: 'verify_peer',            // 'verify_peer' | 'verify_none'
    }
  },

  // Message filters (optional)
  filters: {
    before: [beforeFilter],             // run before handlers — return false to skip
    after: [afterFilter],               // run after handlers
    outgoing: [outgoingFilter],         // run before send/publish — return false to suppress
  },

  // Static handlers (alternative to addHandler)
  handlers: {
    'OrderCreated': [handler1, handler2],
    '*': [wildcardHandler],             // receives ALL message types
  },

  // Logger (optional — defaults to console)
  logger: {
    info: (msg) => log.info(msg),
    error: (msg, err) => log.error(msg, err),
  }
});
```

### Defaults

| Setting | Default |
|---------|---------|
| `host` | `amqp://localhost` |
| `durable` | `true` |
| `exclusive` | `false` |
| `autoDelete` | `false` |
| `noAck` | `false` |
| `prefetch` | `100` |
| `maxRetries` | `3` |
| `retryDelay` | `3000` |
| `errorQueue` | `errors` |
| `auditQueue` | `audit` |
| `auditEnabled` | `false` |
| `connectionTimeout` | `30000` |
| `connectionRetryDelay` | `30000` |
| `connectionMaxRetries` | `5` |
| `defaultRequestTimeout` | `10000` |

## Key Concepts

### Messages

Every message must include a `CorrelationId` string for tracing:

```typescript
await bus.send('target', 'MyType', {
  CorrelationId: 'unique-trace-id',
  // ... your payload
});
```

ServiceConnect automatically attaches headers to every message: `MessageId`, `TypeName`, `SourceAddress`, `DestinationAddress`, `TimeSent`, and others. These are available in handler callbacks via the `headers` parameter.

### Handlers

Register handlers dynamically after `init()`:

```typescript
const handler = async (message, headers, type, reply) => { /* ... */ };

await bus.addHandler('OrderCreated', handler);
await bus.removeHandler('OrderCreated', handler);
```

Multiple handlers can be registered for the same type. The `*` wildcard matches all types.

### Filters

Filters intercept messages at three points in the pipeline:

- **`before`** — runs before handlers. Return `false` to skip the message (it will still be acked).
- **`after`** — runs after handlers complete. Errors here are logged but don't cause nacks.
- **`outgoing`** — runs before `send`/`publish`. Return `false` to suppress sending.

```typescript
const rateLimiter = async (message, headers, type, bus) => {
  return !isRateLimited(type);  // false = skip/suppress
};
```

### Competing Consumers

Multiple instances of the same service (same queue name) automatically share the workload. RabbitMQ distributes messages round-robin across consumers. Use `prefetch: 1` for fair dispatch when message processing times vary.

### Graceful Shutdown

`bus.close()` signals the consumer to stop accepting new messages, waits for in-flight messages to finish processing, then closes the channel and connection. Messages that arrive during shutdown are nacked with `requeue=true` so another consumer picks them up.

## Error Classes

```typescript
import { ConnectionError, MessageError, ValidationError } from 'service-connect';

// ConnectionError — connection failures, not connected
// MessageError    — handler failures, invalid message format
// ValidationError — invalid configuration, missing queue name, etc.
```

Each error includes a `code` property for programmatic handling and a `retryable` flag indicating whether the operation might succeed on retry.

## API Reference

| Method | Description |
|--------|-------------|
| `new Bus(config)` | Create a bus instance (validates config, does not connect) |
| `init()` | Connect to RabbitMQ and create all infrastructure |
| `addHandler(type, handler)` | Subscribe to a message type |
| `removeHandler(type, handler)` | Unsubscribe a specific handler |
| `isHandled(type)` | Check if any handlers exist for a type |
| `send(endpoint, type, message, headers?)` | Send a command to a queue |
| `publish(type, message, headers?)` | Publish an event to a fanout exchange |
| `sendRequest(endpoint, type, message, callback, headers?)` | Send and wait for a reply |
| `publishRequest(type, message, callback, expected?, timeout?, headers?)` | Publish and gather replies |
| `close()` | Graceful shutdown |
| `isConnected()` | Check connection status |

## Testing

```bash
# Unit tests
npm test

# Integration tests (requires RabbitMQ on localhost:5672)
RABBITMQ_URL="amqp://guest:guest@localhost" npm run integration-test

# Integration tests with auto-managed Docker RabbitMQ
npm run auto-integration-test
```

## License

MIT
