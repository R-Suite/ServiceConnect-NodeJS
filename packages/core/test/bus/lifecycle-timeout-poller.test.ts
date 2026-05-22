import { describe, expect, it } from 'vitest';
import { createBus } from '../../src/bus.js';
import type { Message } from '../../src/message.js';
import type { ProcessData } from '../../src/persistence/saga-store.js';
import type { ProcessContext, ProcessHandler } from '../../src/process/handler.js';
import { fakeTransport } from '../../src/testing/fake-transport.js';
import { memorySagaStore } from '../helpers/memory-stubs.js';
import { memoryTimeoutStore } from '../helpers/memory-timeout-stub.js';

interface OrderState extends ProcessData {
  status: string;
}

interface OrderCreated extends Message {
  orderId: string;
}

class OnOrderCreated implements ProcessHandler<OrderState, OrderCreated> {
  async handle(_msg: OrderCreated, _data: OrderState, ctx: ProcessContext): Promise<void> {
    await ctx.requestTimeout('Late', new Date(Date.now() - 1));
  }
  correlate(msg: OrderCreated): string {
    return msg.orderId;
  }
}

function envelope<T extends object>(
  messageType: string,
  body: T,
): {
  headers: { messageType: string; correlationId: string };
  body: Uint8Array;
} {
  return {
    headers: { messageType, correlationId: 'c' },
    body: new TextEncoder().encode(JSON.stringify(body)),
  };
}

describe('Bus lifecycle wires TimeoutPoller', () => {
  it('scheduled timeouts are published as messages after bus.start()', async () => {
    const transport = fakeTransport();
    const timeoutStore = memoryTimeoutStore();
    const bus = createBus({
      transport,
      queue: { name: 'q' },
      timeoutPollIntervalMs: 10,
    });

    bus
      .registerProcessData<OrderState>('OrderState')
      .registerProcess('OrderProcess', { store: memorySagaStore(), timeoutStore })
      .startsWith<OrderCreated>('OrderCreated', new OnOrderCreated());

    await bus.start();

    await transport.deliver(envelope('OrderCreated', { correlationId: 'c', orderId: 'o-1' }));

    await new Promise((r) => setTimeout(r, 100));

    const published = transport.outbox;
    expect(published.some((p) => p.typeName === 'Late')).toBe(true);

    await bus.stop();
  });

  it('bus.stop awaits the in-flight poller tick and is idempotent', async () => {
    const bus = createBus({
      transport: fakeTransport(),
      queue: { name: 'q' },
      timeoutPollIntervalMs: 10,
    });

    bus.registerProcessData<OrderState>('OrderState').registerProcess('OrderProcess', {
      store: memorySagaStore(),
      timeoutStore: memoryTimeoutStore(),
    });

    await bus.start();
    await bus.stop();
    await bus.stop();
  });
});
