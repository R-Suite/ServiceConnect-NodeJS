import type { Bus, ITransportProducer } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
import { producerConnectivity } from '../src/producer.js';

function busWithProducer(isHealthy: boolean): Bus {
  const producer: ITransportProducer = {
    get isHealthy() {
      return isHealthy;
    },
    supportsRoutingKey: false,
    maxMessageSize: Number.POSITIVE_INFINITY,
    async publish() {},
    async send() {},
    async sendBytes() {},
    async [Symbol.asyncDispose]() {},
  };
  return { producer } as unknown as Bus;
}

describe('producerConnectivity', () => {
  it('returns healthy when producer.isHealthy === true', async () => {
    const check = producerConnectivity(busWithProducer(true));
    const result = await check();
    expect(result.status).toBe('healthy');
  });

  it('returns unhealthy when producer.isHealthy === false', async () => {
    const check = producerConnectivity(busWithProducer(false));
    const result = await check();
    expect(result.status).toBe('unhealthy');
    expect(result.description).toMatch(/producer/i);
  });
});
