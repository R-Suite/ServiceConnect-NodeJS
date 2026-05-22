import { randomUUID } from 'node:crypto';
import type { Envelope } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

describe('reconnect', () => {
  it('continues delivering messages after a publisher restart', async () => {
    const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
    const queue = `q-rc-${randomUUID().slice(0, 8)}`;
    const type = `T-${randomUUID().slice(0, 8)}`;

    const { consumer } = createRabbitMQTransport({ url });
    const received: Envelope[] = [];
    await consumer.start(queue, [type], async (envelope) => {
      received.push(envelope);
      return { success: true, notHandled: false, terminalFailure: false };
    });

    // First producer: publish, then dispose.
    {
      const { producer } = createRabbitMQTransport({ url });
      await producer.publish(type, new TextEncoder().encode('{"v":1}'));
      await producer[Symbol.asyncDispose]();
    }

    // Second producer (independent connection): publish again.
    {
      const { producer } = createRabbitMQTransport({ url });
      await producer.publish(type, new TextEncoder().encode('{"v":2}'));
      await producer[Symbol.asyncDispose]();
    }

    const start = Date.now();
    while (received.length < 2 && Date.now() - start < 10_000) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(received).toHaveLength(2);

    await consumer.stop();
  });
});
