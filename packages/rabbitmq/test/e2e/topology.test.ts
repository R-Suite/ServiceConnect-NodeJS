import { randomUUID } from 'node:crypto';
import { Connection } from 'rabbitmq-client';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

describe('topology', () => {
  it('main queue has expected dead-letter args; retry queue has TTL', async () => {
    const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
    const queue = `q-topo-${randomUUID().slice(0, 8)}`;

    const { consumer, producer } = createRabbitMQTransport({
      url,
      consumer: { retryDelay: 1234 },
    });
    await consumer.start(queue, [], async () => ({
      success: true,
      notHandled: false,
      terminalFailure: false,
    }));

    // Reconnect with a separate client and re-declare with identical args; broker
    // returns OK only if the declared shape matches exactly.
    const probe = new Connection(url);
    await probe.queueDeclare({
      queue,
      durable: true,
      arguments: {
        'x-dead-letter-exchange': `${queue}.Retries.Exchange`,
        'x-dead-letter-routing-key': queue,
      },
    });
    await probe.queueDeclare({
      queue: `${queue}.Retries`,
      durable: true,
      arguments: {
        'x-message-ttl': 1234,
        'x-dead-letter-exchange': `${queue}.MainBack.Exchange`,
      },
    });
    await probe.close();

    expect(true).toBe(true); // no throw == success

    await consumer.stop();
    await producer[Symbol.asyncDispose]();
  });
});
