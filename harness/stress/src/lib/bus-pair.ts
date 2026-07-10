import { randomUUID } from 'node:crypto';
import { type Bus, createBus, createMessageTypeRegistry } from '@serviceconnect/core';
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

    // Share each bus's registry with its transport so the producer's polymorphic multi-publish can
    // resolve a derived type's ancestor exchanges (parentsOf). Without this, a published derived
    // message only reaches its own exchange, not a base-type subscriber.
    const alphaRegistry = createMessageTypeRegistry();
    const betaRegistry = createMessageTypeRegistry();

    const alpha = createBus({
        transport: createRabbitMQTransport({
            url: options.brokerUrl,
            parentsOf: (n) => alphaRegistry.parentsOf(n),
        }),
        registry: alphaRegistry,
        queue: { name: alphaQueue },
        timeoutPollIntervalMs: options.timeoutPollIntervalMs ?? 100,
        aggregatorFlushIntervalMs: options.aggregatorFlushIntervalMs ?? 100,
    });

    const beta = createBus({
        transport: createRabbitMQTransport({
            url: options.brokerUrl,
            parentsOf: (n) => betaRegistry.parentsOf(n),
        }),
        registry: betaRegistry,
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
