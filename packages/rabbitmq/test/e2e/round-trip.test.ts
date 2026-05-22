import { randomUUID } from 'node:crypto';
import type { ConsumeResult, Envelope } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

const successResult: ConsumeResult = { success: true, notHandled: false, terminalFailure: false };

describe('round-trip', () => {
  it('publish to a fanout exchange is delivered to a bound consumer', async () => {
    const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
    const queue = `q-rt-${randomUUID().slice(0, 8)}`;
    const type = `T-${randomUUID().slice(0, 8)}`;

    const { producer, consumer } = createRabbitMQTransport({ url });

    const received: Envelope[] = [];
    await consumer.start(queue, [type], async (envelope) => {
      received.push(envelope);
      return successResult;
    });

    await producer.publish(type, new TextEncoder().encode(JSON.stringify({ v: 1 })));

    const start = Date.now();
    while (received.length === 0 && Date.now() - start < 5000) {
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(received).toHaveLength(1);
    const decoded = JSON.parse(new TextDecoder().decode(received[0]?.body));
    expect(decoded).toEqual({ v: 1 });

    await consumer.stop();
    await producer[Symbol.asyncDispose]();
  });

  it('send to a queue endpoint delivers to that specific queue with MessageType header', async () => {
    const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
    const queue = `q-rt-${randomUUID().slice(0, 8)}`;

    const { producer, consumer } = createRabbitMQTransport({ url });

    const received: Envelope[] = [];
    await consumer.start(queue, [], async (envelope) => {
      received.push(envelope);
      return successResult;
    });

    await producer.send(queue, 'OrderCreated', new TextEncoder().encode('{}'));

    const start = Date.now();
    while (received.length === 0 && Date.now() - start < 5000) {
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(received).toHaveLength(1);
    expect(received[0]?.headers.MessageType).toBe('OrderCreated');

    await consumer.stop();
    await producer[Symbol.asyncDispose]();
  });
});
