import { describe, expect, it } from 'vitest';
import { createBus } from '../../src/bus.js';
import { MessageTypeNotRegisteredError, RoutingSlipDestinationError } from '../../src/errors.js';
import type { Message } from '../../src/message.js';
import { ROUTING_SLIP_HEADER } from '../../src/routing/slip.js';
import { fakeTransport } from '../../src/testing/fake-transport.js';

interface OrderCreated extends Message {
  orderId: string;
}

describe('Bus.route', () => {
  it('publishes the message via producer.send with the RoutingSlip header set to remaining destinations', async () => {
    const transport = fakeTransport();
    const bus = createBus({ transport, queue: { name: 'q' } }).registerMessage<OrderCreated>(
      'OrderCreated',
    );
    await bus.start();
    await bus.route<OrderCreated>('OrderCreated', { correlationId: 'c-1', orderId: 'o-1' }, [
      'inventory-queue',
      'payment-queue',
      'shipping-queue',
    ]);
    await bus.stop();

    const sends = transport.outbox.filter((e) => e.operation === 'send');
    expect(sends).toHaveLength(1);
    expect(sends[0]?.endpoint).toBe('inventory-queue');
    const slipHeader = sends[0]?.headers?.[ROUTING_SLIP_HEADER];
    expect(slipHeader).toBeDefined();
    expect(JSON.parse(String(slipHeader))).toEqual(['payment-queue', 'shipping-queue']);
  });

  it('rejects an empty destinations array', async () => {
    const bus = createBus({
      transport: fakeTransport(),
      queue: { name: 'q' },
    }).registerMessage<OrderCreated>('OrderCreated');
    await bus.start();
    await expect(
      bus.route<OrderCreated>('OrderCreated', { correlationId: 'c', orderId: 'o' }, []),
    ).rejects.toBeInstanceOf(RoutingSlipDestinationError);
    await bus.stop();
  });

  it('rejects when any destination is invalid', async () => {
    const bus = createBus({
      transport: fakeTransport(),
      queue: { name: 'q' },
    }).registerMessage<OrderCreated>('OrderCreated');
    await bus.start();
    await expect(
      bus.route<OrderCreated>('OrderCreated', { correlationId: 'c', orderId: 'o' }, [
        'ok-queue',
        'amq.bad',
      ]),
    ).rejects.toBeInstanceOf(RoutingSlipDestinationError);
    await bus.stop();
  });

  it('rejects unregistered message type', async () => {
    const bus = createBus({ transport: fakeTransport(), queue: { name: 'q' } });
    await bus.start();
    await expect(
      bus.route('Unregistered', { correlationId: 'c' } as Message, ['q1']),
    ).rejects.toBeInstanceOf(MessageTypeNotRegisteredError);
    await bus.stop();
  });
});
