import { describe, expect, it } from 'vitest';
import type { Message } from '../../src/message.js';
import type { ProcessData } from '../../src/persistence/saga-store.js';
import type { ProcessHandler } from '../../src/process/handler.js';
import { ProcessRegistry } from '../../src/process/registry.js';

interface OrderState extends ProcessData {
  status: 'pending' | 'paid';
}

interface OrderCreated extends Message {
  orderId: string;
}

class OnOrderCreated implements ProcessHandler<OrderState, OrderCreated> {
  async handle(): Promise<void> {}
  correlate(msg: OrderCreated): string {
    return msg.orderId;
  }
}

describe('ProcessRegistry', () => {
  it('registerProcess + startsWith records a starting registration', () => {
    const r = new ProcessRegistry();
    r.registerDataType('OrderState');
    r.registerProcess('OrderProcess', { dataType: 'OrderState' });
    r.startsWith('OrderProcess', 'OrderCreated', new OnOrderCreated());

    const regs = r.registrationsFor('OrderCreated');
    expect(regs).toHaveLength(1);
    expect(regs[0]?.isStart).toBe(true);
    expect(regs[0]?.dataType).toBe('OrderState');
  });

  it('handles records a non-starting registration', () => {
    const r = new ProcessRegistry();
    r.registerDataType('OrderState');
    r.registerProcess('OrderProcess', { dataType: 'OrderState' });
    r.handles('OrderProcess', 'PaymentReceived', new OnOrderCreated());

    const regs = r.registrationsFor('PaymentReceived');
    expect(regs).toHaveLength(1);
    expect(regs[0]?.isStart).toBe(false);
  });

  it('registrationsFor returns empty for unregistered message types', () => {
    const r = new ProcessRegistry();
    expect(r.registrationsFor('NeverRegistered')).toEqual([]);
  });

  it('multiple processes can register against the same message type', () => {
    const r = new ProcessRegistry();
    r.registerDataType('A');
    r.registerDataType('B');
    r.registerProcess('ProcessA', { dataType: 'A' });
    r.registerProcess('ProcessB', { dataType: 'B' });
    r.startsWith('ProcessA', 'Shared', new OnOrderCreated());
    r.handles('ProcessB', 'Shared', new OnOrderCreated());

    const regs = r.registrationsFor('Shared');
    expect(regs).toHaveLength(2);
    expect(regs.map((reg) => reg.processName).sort()).toEqual(['ProcessA', 'ProcessB']);
  });

  it('registerProcess for an unknown data type throws', () => {
    const r = new ProcessRegistry();
    expect(() => r.registerProcess('Unknown', { dataType: 'NotRegistered' })).toThrow(
      /not registered/i,
    );
  });

  it('startsWith on an unknown process name throws', () => {
    const r = new ProcessRegistry();
    expect(() => r.startsWith('Missing', 'X', new OnOrderCreated())).toThrow(/not registered/i);
  });

  it('lastRegisteredDataType returns the most recent registerDataType call', () => {
    const r = new ProcessRegistry();
    expect(r.lastRegisteredDataType()).toBeUndefined();
    r.registerDataType('First');
    expect(r.lastRegisteredDataType()).toBe('First');
    r.registerDataType('Second');
    expect(r.lastRegisteredDataType()).toBe('Second');
  });
});
