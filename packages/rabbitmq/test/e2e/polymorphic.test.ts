import { randomUUID } from 'node:crypto';
import { type Message, createBus, createMessageTypeRegistry } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

interface DomainEvent extends Message {
  source: string;
}
interface OrderShipped extends DomainEvent {
  orderId: string;
}

describe('E2E polymorphic', () => {
  it('subscriber to base type receives derived messages via e2e binding', async () => {
    const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
    const auditQueue = `q-audit-${randomUUID().slice(0, 8)}`;
    const baseType = `DomainEvent-${randomUUID().slice(0, 8)}`;
    const derivedType = `OrderShipped-${randomUUID().slice(0, 8)}`;

    const publisherRegistry = createMessageTypeRegistry();
    publisherRegistry.register<DomainEvent>(baseType);
    publisherRegistry.register<OrderShipped>(derivedType, { parents: [baseType] });
    const publisherTransport = createRabbitMQTransport({
      url,
      parentsOf: (n) => publisherRegistry.parentsOf(n),
    });
    const publisher = createBus({
      transport: publisherTransport,
      registry: publisherRegistry,
      queue: { name: `q-pub-${randomUUID().slice(0, 8)}` },
    });

    const subscriberRegistry = createMessageTypeRegistry();
    subscriberRegistry.register<DomainEvent>(baseType);
    subscriberRegistry.register<OrderShipped>(derivedType, { parents: [baseType] });

    const received: DomainEvent[] = [];
    const subscriber = createBus({
      transport: createRabbitMQTransport({
        url,
        parentsOf: (n) => subscriberRegistry.parentsOf(n),
      }),
      registry: subscriberRegistry,
      queue: { name: auditQueue },
    }).handle<DomainEvent>(baseType, async (msg) => {
      received.push(msg);
    });

    await subscriber.start();
    await publisher.start();

    await new Promise((r) => setTimeout(r, 200));

    await publisher.publish<OrderShipped>(derivedType, {
      correlationId: 'c-1',
      source: 'test',
      orderId: 'ORD-1',
    } as OrderShipped);

    const start = Date.now();
    while (received.length === 0 && Date.now() - start < 5000) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(received).toHaveLength(1);
    expect((received[0] as OrderShipped).orderId).toBe('ORD-1');

    await publisher.stop();
    await subscriber.stop();
  });
});
