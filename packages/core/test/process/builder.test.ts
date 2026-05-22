import { describe, expect, it } from 'vitest';
import { createBus } from '../../src/bus.js';
import type { Message } from '../../src/message.js';
import type { ProcessData } from '../../src/persistence/saga-store.js';
import type { ITimeoutStore } from '../../src/persistence/timeout-store.js';
import type { ProcessContext, ProcessHandler } from '../../src/process/handler.js';
import { fakeTransport } from '../../src/testing/fake-transport.js';
import { memorySagaStore } from '../helpers/memory-stubs.js';

interface OrderState extends ProcessData {
  status: 'pending' | 'paid';
}

interface OrderCreated extends Message {
  orderId: string;
}

interface PaymentReceived extends Message {
  orderId: string;
}

class OnOrderCreated implements ProcessHandler<OrderState, OrderCreated> {
  async handle(_msg: OrderCreated, data: OrderState, _ctx: ProcessContext): Promise<void> {
    data.status = 'pending';
  }
  correlate(msg: OrderCreated): string {
    return msg.orderId;
  }
}

class OnPaymentReceived implements ProcessHandler<OrderState, PaymentReceived> {
  async handle(_msg: PaymentReceived, data: OrderState, ctx: ProcessContext): Promise<void> {
    data.status = 'paid';
    ctx.markComplete();
  }
  correlate(msg: PaymentReceived): string {
    return msg.orderId;
  }
}

const stubTimeoutStore: ITimeoutStore = {
  async schedule(r) {
    return { id: 'stub', ...r };
  },
  async claimDue() {
    return [];
  },
  async delete() {},
};

describe('Process builder on Bus', () => {
  it('registerProcessData + registerProcess + startsWith + handles chain', () => {
    const bus = createBus({ transport: fakeTransport(), queue: { name: 'q' } });
    bus
      .registerProcessData<OrderState>('OrderState')
      .registerProcess('OrderProcess', {
        store: memorySagaStore(),
        timeoutStore: stubTimeoutStore,
      })
      .startsWith<OrderCreated>('OrderCreated', new OnOrderCreated())
      .handles<PaymentReceived>('PaymentReceived', new OnPaymentReceived());

    expect(bus.processRegistry.registrationsFor('OrderCreated')).toHaveLength(1);
    expect(bus.processRegistry.registrationsFor('PaymentReceived')).toHaveLength(1);
  });

  it('startsWith/handles auto-register message types in the message-type registry', () => {
    const bus = createBus({ transport: fakeTransport(), queue: { name: 'q' } });
    bus
      .registerProcessData<OrderState>('OrderState')
      .registerProcess('OrderProcess', {
        store: memorySagaStore(),
        timeoutStore: stubTimeoutStore,
      })
      .startsWith<OrderCreated>('OrderCreated', new OnOrderCreated());

    expect(bus.messageRegistry.resolve('OrderCreated')).toBeDefined();
  });

  it('registerProcess with an unknown explicit dataType throws', () => {
    const bus = createBus({ transport: fakeTransport(), queue: { name: 'q' } });
    expect(() =>
      bus.registerProcess('OrderProcess', {
        dataType: 'UnknownState',
        store: memorySagaStore(),
        timeoutStore: stubTimeoutStore,
      }),
    ).toThrow(/not registered/i);
  });

  it('registerProcess with no dataType nor prior registerProcessData throws', () => {
    const bus = createBus({ transport: fakeTransport(), queue: { name: 'q' } });
    expect(() =>
      bus.registerProcess('OrderProcess', {
        store: memorySagaStore(),
        timeoutStore: stubTimeoutStore,
      }),
    ).toThrow(/registerProcessData/i);
  });
});
