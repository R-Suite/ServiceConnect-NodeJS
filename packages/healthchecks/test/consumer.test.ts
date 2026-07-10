import type { Bus, ITransportConsumer } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
import { consumerConnectivity } from '../src/consumer.js';

function busWithConsumer(state: {
    isConnected: boolean;
    isCancelledByBroker?: boolean;
}): Bus {
    const consumer: ITransportConsumer = {
        get isConnected() {
            return state.isConnected;
        },
        get isCancelledByBroker() {
            return state.isCancelledByBroker ?? false;
        },
        get isStopped() {
            return false;
        },
        async start() {},
        async stop() {},
        async [Symbol.asyncDispose]() {},
    };
    return { consumer } as unknown as Bus;
}

describe('consumerConnectivity', () => {
    it('returns healthy when consumer is connected and not cancelled', async () => {
        const result = await consumerConnectivity(busWithConsumer({ isConnected: true }))();
        expect(result.status).toBe('healthy');
    });

    it('returns unhealthy when consumer is disconnected', async () => {
        const result = await consumerConnectivity(busWithConsumer({ isConnected: false }))();
        expect(result.status).toBe('unhealthy');
    });

    it('returns unhealthy when consumer is cancelled by broker', async () => {
        const result = await consumerConnectivity(
            busWithConsumer({ isConnected: true, isCancelledByBroker: true }),
        )();
        expect(result.status).toBe('unhealthy');
    });
});
