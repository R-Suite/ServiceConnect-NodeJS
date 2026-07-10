import { randomUUID } from 'node:crypto';
import { type Message, createBus } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

interface Chunk extends Message {
    v: number;
}

describe('E2E streaming', () => {
    it('1000-chunk round-trip preserves order', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const senderQ = `q-stream-s-${randomUUID().slice(0, 8)}`;
        const receiverQ = `q-stream-r-${randomUUID().slice(0, 8)}`;
        const typeName = `Chunk-${randomUUID().slice(0, 8)}`;

        const sender = createBus({
            transport: createRabbitMQTransport({ url }),
            queue: { name: senderQ },
        }).registerMessage<Chunk>(typeName);

        const collected: Chunk[] = [];
        const receiver = createBus({
            transport: createRabbitMQTransport({ url }),
            queue: { name: receiverQ },
        })
            .registerMessage<Chunk>(typeName)
            .handleStream<Chunk>(typeName, async (stream) => {
                for await (const chunk of stream) collected.push(chunk);
            });

        await sender.start();
        await receiver.start();
        await new Promise((r) => setTimeout(r, 150));

        const s = await sender.openStream<Chunk>(receiverQ, typeName);
        for (let i = 0; i < 1000; i++) {
            await s.sendChunk({ correlationId: 'c', v: i });
        }
        await s.complete();

        const start = Date.now();
        while (collected.length < 1000 && Date.now() - start < 30_000) {
            await new Promise((r) => setTimeout(r, 100));
        }
        expect(collected).toHaveLength(1000);
        expect(collected.map((c) => c.v)).toEqual(Array.from({ length: 1000 }, (_, i) => i));

        await sender.stop();
        await receiver.stop();
    }, 60_000);

    it('fault propagates to the receiver via StreamFaultedError', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const senderQ = `q-stream-s-${randomUUID().slice(0, 8)}`;
        const receiverQ = `q-stream-r-${randomUUID().slice(0, 8)}`;
        const typeName = `Chunk-${randomUUID().slice(0, 8)}`;

        const sender = createBus({
            transport: createRabbitMQTransport({ url }),
            queue: { name: senderQ },
        }).registerMessage<Chunk>(typeName);

        let caught: unknown;
        const receiver = createBus({
            transport: createRabbitMQTransport({ url }),
            queue: { name: receiverQ },
        })
            .registerMessage<Chunk>(typeName)
            .handleStream<Chunk>(typeName, async (stream) => {
                try {
                    for await (const _c of stream) void _c;
                } catch (err) {
                    caught = err;
                }
            });

        await sender.start();
        await receiver.start();
        await new Promise((r) => setTimeout(r, 150));

        const s = await sender.openStream<Chunk>(receiverQ, typeName);
        await s.sendChunk({ correlationId: 'c', v: 1 });
        await s.fault('upstream-broken');

        const start = Date.now();
        while (!caught && Date.now() - start < 5000) {
            await new Promise((r) => setTimeout(r, 100));
        }
        expect(caught).toBeInstanceOf(Error);
        expect((caught as Error).message).toContain('upstream-broken');

        await sender.stop();
        await receiver.stop();
    });
});
