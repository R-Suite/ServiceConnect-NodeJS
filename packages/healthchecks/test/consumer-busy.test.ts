import type { Bus, ITransportConsumer } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
import { consumerBusy } from '../src/consumer.js';

function bus(state: { isConnected: boolean; lastConsumedAt?: Date }): Bus {
  const consumer: ITransportConsumer = {
    get isConnected() {
      return state.isConnected;
    },
    get isCancelledByBroker() {
      return false;
    },
    get isStopped() {
      return false;
    },
    async start() {},
    async stop() {},
    async [Symbol.asyncDispose]() {},
  };
  return { consumer, lastConsumedAt: state.lastConsumedAt } as unknown as Bus;
}

describe('consumerBusy', () => {
  it('returns healthy when lastConsumedAt is recent', async () => {
    const result = await consumerBusy(bus({ isConnected: true, lastConsumedAt: new Date() }), {
      graceMs: 5000,
    })();
    expect(result.status).toBe('healthy');
  });

  it('returns healthy when lastConsumedAt is undefined (bootstrap)', async () => {
    const result = await consumerBusy(bus({ isConnected: true }), { graceMs: 5000 })();
    expect(result.status).toBe('healthy');
    expect(result.description).toMatch(/no messages consumed yet/i);
  });

  it('returns degraded when lastConsumedAt exceeds graceMs and consumer is connected', async () => {
    const result = await consumerBusy(
      bus({ isConnected: true, lastConsumedAt: new Date(Date.now() - 10_000) }),
      { graceMs: 1000 },
    )();
    expect(result.status).toBe('degraded');
  });

  it('returns unhealthy when consumer is disconnected regardless of lastConsumedAt', async () => {
    const result = await consumerBusy(bus({ isConnected: false, lastConsumedAt: new Date() }), {
      graceMs: 5000,
    })();
    expect(result.status).toBe('unhealthy');
  });
});
