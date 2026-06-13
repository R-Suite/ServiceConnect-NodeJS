import { randomUUID } from 'node:crypto';
import { type Bus, createBus } from '@serviceconnect/core';
import { createRabbitMQTransport } from '@serviceconnect/rabbitmq';
import type { PersistenceBundle } from '../persistence/index.js';

export interface BusPair {
    readonly alpha: Bus;
    readonly beta: Bus;
    readonly alphaQueue: string;
    readonly betaQueue: string;
    dispose(): Promise<void>;
}

export interface BusPairOptions {
    readonly brokerUrl: string;
    readonly persistence: PersistenceBundle;
    readonly queuePrefix?: string;
    readonly timeoutPollIntervalMs?: number;
    readonly aggregatorFlushIntervalMs?: number;
}

export async function createBusPair(options: BusPairOptions): Promise<BusPair> {
    const prefix = options.queuePrefix ?? `stress-${randomUUID().slice(0, 6)}`;
    const alphaQueue = `${prefix}-alpha`;
    const betaQueue = `${prefix}-beta`;

    const alpha = createBus({
        transport: createRabbitMQTransport({ url: options.brokerUrl }),
        queue: { name: alphaQueue },
        timeoutPollIntervalMs: options.timeoutPollIntervalMs ?? 100,
        aggregatorFlushIntervalMs: options.aggregatorFlushIntervalMs ?? 100,
    });

    const beta = createBus({
        transport: createRabbitMQTransport({ url: options.brokerUrl }),
        queue: { name: betaQueue },
        timeoutPollIntervalMs: options.timeoutPollIntervalMs ?? 100,
        aggregatorFlushIntervalMs: options.aggregatorFlushIntervalMs ?? 100,
    });

    return {
        alpha,
        beta,
        alphaQueue,
        betaQueue,
        async dispose() {
            await Promise.allSettled([alpha.stop(), beta.stop()]);
            await options.persistence.dispose();
        },
    };
}
