import { randomUUID } from 'node:crypto';
import { type Message, RoutingSlipDestinationError, createBus } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

interface Step extends Message {
  payload: string;
}

describe('E2E routing slip', () => {
  it('three-hop slip is forwarded through each queue in order', async () => {
    const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
    const q1 = `q-rs1-${randomUUID().slice(0, 8)}`;
    const q2 = `q-rs2-${randomUUID().slice(0, 8)}`;
    const q3 = `q-rs3-${randomUUID().slice(0, 8)}`;
    const typeName = `Step-${randomUUID().slice(0, 8)}`;

    const visits: string[] = [];
    const bus1 = createBus({
      transport: createRabbitMQTransport({ url }),
      queue: { name: q1 },
    })
      .registerMessage<Step>(typeName)
      .handle<Step>(typeName, async () => {
        visits.push('q1');
      });
    const bus2 = createBus({
      transport: createRabbitMQTransport({ url }),
      queue: { name: q2 },
    })
      .registerMessage<Step>(typeName)
      .handle<Step>(typeName, async () => {
        visits.push('q2');
      });
    const bus3 = createBus({
      transport: createRabbitMQTransport({ url }),
      queue: { name: q3 },
    })
      .registerMessage<Step>(typeName)
      .handle<Step>(typeName, async () => {
        visits.push('q3');
      });

    await bus1.start();
    await bus2.start();
    await bus3.start();

    const starter = createBus({
      transport: createRabbitMQTransport({ url }),
      queue: { name: `q-rs-starter-${randomUUID().slice(0, 8)}` },
    }).registerMessage<Step>(typeName);
    await starter.start();

    await starter.route<Step>(typeName, { correlationId: 'c', payload: 'hello' }, [q1, q2, q3]);

    const start = Date.now();
    while (visits.length < 3 && Date.now() - start < 8000) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(visits).toEqual(['q1', 'q2', 'q3']);

    await starter.stop();
    await bus1.stop();
    await bus2.stop();
    await bus3.stop();
  });

  it('Bus.route rejects an invalid destination up-front', async () => {
    const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
    const typeName = `Step-${randomUUID().slice(0, 8)}`;
    const bus = createBus({
      transport: createRabbitMQTransport({ url }),
      queue: { name: `q-rs-bad-${randomUUID().slice(0, 8)}` },
    }).registerMessage<Step>(typeName);
    await bus.start();
    await expect(
      bus.route<Step>(typeName, { correlationId: 'c', payload: 'x' }, ['ok-queue', 'amq.bad']),
    ).rejects.toBeInstanceOf(RoutingSlipDestinationError);
    await bus.stop();
  });
});
