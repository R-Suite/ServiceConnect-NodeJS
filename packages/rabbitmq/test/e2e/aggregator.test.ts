import { randomUUID } from 'node:crypto';
import { Aggregator, type Message, createBus } from '@serviceconnect/core';
import { memoryAggregatorStore } from '@serviceconnect/persistence-memory';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

interface Foo extends Message {
    v: number;
}

class SizeFlushAgg extends Aggregator<Foo> {
    public batches: (readonly Foo[])[] = [];
    batchSize(): number {
        return 3;
    }
    timeout(): number {
        return 60_000;
    }
    async execute(messages: readonly Foo[]): Promise<void> {
        this.batches.push(messages);
    }
}

class TimeoutFlushAgg extends Aggregator<Foo> {
    public batches: (readonly Foo[])[] = [];
    batchSize(): number {
        return 100;
    }
    timeout(): number {
        return 300;
    }
    async execute(messages: readonly Foo[]): Promise<void> {
        this.batches.push(messages);
    }
}

describe('E2E aggregator', () => {
    it('size-flush: reaching batchSize triggers execute', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const queue = `q-agg-${randomUUID().slice(0, 8)}`;
        const typeName = `Foo-${randomUUID().slice(0, 8)}`;
        const agg = new SizeFlushAgg();

        const bus = createBus({
            transport: createRabbitMQTransport({ url }),
            queue: { name: queue },
            aggregatorFlushIntervalMs: 100,
        });
        bus.registerAggregator<Foo>(typeName, agg, { store: memoryAggregatorStore() });

        await bus.start();
        for (let i = 0; i < 3; i++) {
            await bus.publish<Foo>(typeName, { correlationId: 'c', v: i });
        }
        const start = Date.now();
        while (agg.batches.length === 0 && Date.now() - start < 8000) {
            await new Promise((r) => setTimeout(r, 50));
        }
        expect(agg.batches).toHaveLength(1);
        expect(agg.batches[0]?.map((m) => m.v).sort()).toEqual([0, 1, 2]);

        await bus.stop();
    });

    it('timeout-flush: lease expiry drains the partial buffer', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const queue = `q-agg-${randomUUID().slice(0, 8)}`;
        const typeName = `Foo-${randomUUID().slice(0, 8)}`;
        const agg = new TimeoutFlushAgg();

        const bus = createBus({
            transport: createRabbitMQTransport({ url }),
            queue: { name: queue },
            aggregatorFlushIntervalMs: 100,
        });
        bus.registerAggregator<Foo>(typeName, agg, { store: memoryAggregatorStore() });

        await bus.start();
        await bus.publish<Foo>(typeName, { correlationId: 'c', v: 1 });
        await bus.publish<Foo>(typeName, { correlationId: 'c', v: 2 });

        const start = Date.now();
        while (agg.batches.length === 0 && Date.now() - start < 5000) {
            await new Promise((r) => setTimeout(r, 100));
        }
        expect(agg.batches).toHaveLength(1);
        expect(agg.batches[0]?.length).toBeGreaterThanOrEqual(2);

        await bus.stop();
    });
});
