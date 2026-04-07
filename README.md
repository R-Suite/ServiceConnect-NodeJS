# ServiceConnect

A simple, easy-to-use asynchronous messaging framework for Node.js. It provides a clean interface for common messaging patterns over RabbitMQ (AMQP).

## What is ServiceConnect?

ServiceConnect is a messaging framework that simplifies building distributed systems using message-based communication. It abstracts away the complexity of RabbitMQ while providing powerful patterns like commands, events, and request/reply.

## Installation

```bash
npm install service-connect
```

## Quick Start

```typescript
import { Bus } from 'service-connect';

const consumer = new Bus({
  amqpSettings: {
    host: 'amqp://localhost',
    queue: { name: 'my-queue' }
  }
});

await consumer.init();

await consumer.addHandler('OrderCreated', async (message) => {
  console.log('Received:', message);
});

await consumer.close();
```

## Messaging Patterns

### 1. Commands (Point-to-Point)

Send commands to specific endpoints:

```typescript
const sender = new Bus({
  amqpSettings: {
    host: 'amqp://localhost',
    queue: { name: 'sender-queue' }
  }
});

await sender.init();

// Send to a single endpoint
await sender.send('processor-queue', 'ProcessOrder', { CorrelationId: 'abc', orderId: 123 });

// Send to multiple endpoints
await sender.send(['processor-queue', 'audit-queue'], 'ProcessOrder', { CorrelationId: 'abc', orderId: 123 });
```

### 2. Events (Publish/Subscribe)

Publish events that multiple consumers can receive:

```typescript
const publisher = new Bus({
  amqpSettings: {
    host: 'amqp://localhost',
    queue: { name: 'publisher-queue' }
  }
});

await publisher.init();

// Publish an event (all subscribers receive it)
await publisher.publish('OrderCreated', { CorrelationId: 'abc', orderId: 123, total: 99.99 });
```

### 3. Request/Reply

Send a command and wait for a response:

```typescript
const client = new Bus({
  amqpSettings: {
    host: 'amqp://localhost',
    queue: { name: 'client-queue' }
  }
});

const service = new Bus({
  amqpSettings: {
    host: 'amqp://localhost',
    queue: { name: 'service-queue' }
  }
});

await client.init();
await service.init();

// Handle the request
await service.addHandler('GetOrderStatus', async (message, headers, type, reply) => {
  const status = { CorrelationId: message.CorrelationId, orderId: message.orderId, status: 'processing' };
  await reply('OrderStatus', status);
});

// Send request and get response
await client.sendRequest(
  'service-queue',
  'GetOrderStatus',
  { CorrelationId: 'abc', orderId: 123 },
  async (response) => {
    console.log('Got response:', response);
  }
);
```

### 4. Scatter/Gather

Publish an event and collect multiple responses:

```typescript
const aggregator = new Bus({
  amqpSettings: {
    host: 'amqp://localhost',
    queue: { name: 'aggregator-queue' }
  }
});

await aggregator.init();

// Publish request and wait for up to 5 responses within 10 seconds
await aggregator.publishRequest(
  'PriceRequest',
  { CorrelationId: 'abc', productId: 'ABC' },
  async (response) => {
    console.log('Received quote:', response);
  },
  5,  // expected responses
  10000  // timeout in ms
);
```

## Configuration

```typescript
const bus = new Bus({
  amqpSettings: {
    host: 'amqp://localhost',  // or ['amqp://host1', 'amqp://host2'] for HA
    queue: {
      name: 'my-queue',
      durable: true,
      exclusive: false,
      autoDelete: false,
      maxPriority: 10  // optional priority queue support
    },
    prefetch: 100,  // messages to prefetch
    maxRetries: 3,  // retry failed messages
    retryDelay: 3000,  // ms between retries
    errorQueue: 'errors',
    auditQueue: 'audit',
    auditEnabled: false,
    // Connection settings
    connectionTimeout: 30000,
    connectionRetryDelay: 30000,
    connectionMaxRetries: 5,
    defaultRequestTimeout: 10000
  },
  // Custom logger
  logger: {
    info: (msg) => console.log(msg),
    error: (msg, err) => console.error(msg, err)
  },
  // Message filters
  filters: {
    before: [],   // executed before handlers
    after: [],    // executed after handlers
    outgoing: []  // executed before send/publish
  }
});
```

## Features

- **Commands** - Point-to-point messaging for request/response style communication
- **Events** - Publish/subscribe for one-way notifications
- **Request/Reply** - RPC-style communication with timeout support
- **Scatter/Gather** - Collect multiple responses to a single request
- **Wildcard Handlers** - Handle multiple message types with one handler using `*`
- **Message Filters** - Hook into message pipeline (before, after, outgoing)
- **Automatic Retries** - Failed messages are retried with configurable delays
- **Audit Queue** - Track successfully processed messages
- **Error Queue** - Failed messages are sent to an error queue after retries exhausted
- **Priority Queues** - Support for message priority
- **Competing Consumers** - Multiple consumers can share a queue for load balancing
- **SSL/TLS** - Secure connections with SSL configuration

## API Reference

### Bus Class

| Method | Description |
|--------|-------------|
| `init()` | Initialize connection to RabbitMQ |
| `addHandler(type, handler)` | Register a message handler |
| `removeHandler(type, handler)` | Unregister a handler |
| `send(endpoint, type, message)` | Send a command |
| `publish(type, message)` | Publish an event |
| `sendRequest(endpoint, type, message, callback)` | Send and wait for reply |
| `publishRequest(type, message, callback, expected, timeout)` | Publish and gather responses |
| `close()` | Close connection gracefully |
| `isConnected()` | Check connection status |

## Error Handling

ServiceConnect provides custom error classes:

```typescript
import { 
  ConnectionError, 
  MessageError, 
  ValidationError 
} from 'service-connect';

try {
  await bus.init();
} catch (err) {
  if (err instanceof ConnectionError) {
    console.log('Connection failed:', err.message);
  }
}
```

## Testing

```bash
# Run unit tests
npm test

# Run integration tests (requires RabbitMQ)
npm run integration-test
```

## License

MIT
