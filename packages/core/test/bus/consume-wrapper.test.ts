import { describe, expect, it, vi } from 'vitest';
import { createBus } from '../../src/bus.js';
import { fakeTransport } from '../../src/testing/fake-transport.js';
import type { ConsumeCallback, ConsumeResult, Envelope } from '../../src/transport.js';

const successResult: ConsumeResult = { success: true, notHandled: false, terminalFailure: false };

describe('BusOptions.consumeWrapper', () => {
  it('wraps the dispatcher callback when present', async () => {
    const transport = fakeTransport();
    const spy = vi.fn(
      (next: ConsumeCallback): ConsumeCallback =>
        async (env: Envelope, signal: AbortSignal) => {
          return next(env, signal);
        },
    );
    const bus = createBus({
      transport,
      queue: { name: 'q' },
      consumeWrapper: spy,
    }).registerMessage('Foo');

    await bus.start();
    expect(spy).toHaveBeenCalledOnce();

    await transport.deliver({
      headers: { messageType: 'Foo', correlationId: 'c' },
      body: new TextEncoder().encode('{}'),
    });

    await bus.stop();
  });

  it('passes the dispatcher through unchanged when consumeWrapper is omitted', async () => {
    const transport = fakeTransport();
    const bus = createBus({ transport, queue: { name: 'q' } }).registerMessage('Foo');
    await bus.start();
    const result = await transport.deliver({
      headers: { messageType: 'Foo', correlationId: 'c' },
      body: new TextEncoder().encode('{}'),
    });
    expect(result).toBeDefined();
    await bus.stop();
  });
});

describe('Bus.lastConsumedAt', () => {
  it('is undefined before any message is consumed', async () => {
    const transport = fakeTransport();
    const bus = createBus({ transport, queue: { name: 'q' } }).registerMessage('Foo');
    await bus.start();
    expect(bus.lastConsumedAt).toBeUndefined();
    await bus.stop();
  });

  it('updates to a recent Date after a message is consumed', async () => {
    const transport = fakeTransport();
    const bus = createBus({ transport, queue: { name: 'q' } }).registerMessage('Foo');
    await bus.start();
    const before = Date.now();
    await transport.deliver({
      headers: { messageType: 'Foo', correlationId: 'c' },
      body: new TextEncoder().encode('{}'),
    });
    expect(bus.lastConsumedAt).toBeInstanceOf(Date);
    expect(bus.lastConsumedAt?.getTime()).toBeGreaterThanOrEqual(before);
    await bus.stop();
  });
});

describe('Bus.consumer / Bus.producer exposure', () => {
  it('exposes the underlying transport producer + consumer on the public surface', async () => {
    const transport = fakeTransport();
    const bus = createBus({ transport, queue: { name: 'q' } });
    expect(bus.producer).toBe(transport.producer);
    expect(bus.consumer).toBe(transport.consumer);
  });
});

void successResult;
