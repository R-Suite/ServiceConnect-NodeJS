import { describe, expect, it } from 'vitest';
import { createBus } from '../../src/bus.js';
import type { Envelope } from '../../src/envelope.js';
import type { Message } from '../../src/message.js';
import { fakeTransport } from '../../src/testing/fake-transport.js';

interface Chunk extends Message {
    v: number;
}

function envelopeFromOutbox(entry: {
    body: Uint8Array;
    headers: Readonly<Record<string, string>>;
}): Envelope {
    return {
        body: entry.body,
        headers: { messageType: 'Chunk', correlationId: 'c', ...entry.headers },
    };
}

describe('Web Streams adapter', () => {
    it('openWritableStream returns a WritableStream<T> that writes chunks via the sender', async () => {
        const transport = fakeTransport();
        const collected: Chunk[] = [];
        const bus = createBus({ transport, queue: { name: 'q' } })
            .registerMessage<Chunk>('Chunk')
            .handleStream<Chunk>('Chunk', async (stream) => {
                for await (const chunk of stream) collected.push(chunk);
            });
        await bus.start();

        const ws = bus.openWritableStream<Chunk>('q', 'Chunk');
        const writer = ws.getWriter();
        await writer.write({ correlationId: 'c', v: 1 });
        await writer.write({ correlationId: 'c', v: 2 });
        await writer.close();

        const sends = transport.outbox.filter((e) => e.operation === 'send');
        for (const s of sends) {
            await transport.deliver(envelopeFromOutbox(s));
        }
        await new Promise((r) => setTimeout(r, 30));

        expect(collected.map((c) => c.v)).toEqual([1, 2]);
        await bus.stop();
    });

    it('writer.abort faults the stream', async () => {
        const transport = fakeTransport();
        let caught: unknown;
        const bus = createBus({ transport, queue: { name: 'q' } })
            .registerMessage<Chunk>('Chunk')
            .handleStream<Chunk>('Chunk', async (stream) => {
                try {
                    for await (const _ of stream) void _;
                } catch (err) {
                    caught = err;
                }
            });
        await bus.start();

        const ws = bus.openWritableStream<Chunk>('q', 'Chunk');
        const writer = ws.getWriter();
        await writer.write({ correlationId: 'c', v: 1 });
        await writer.abort('aborted');

        const sends = transport.outbox.filter((e) => e.operation === 'send');
        for (const s of sends) {
            await transport.deliver(envelopeFromOutbox(s));
        }
        await new Promise((r) => setTimeout(r, 30));

        expect(caught).toBeInstanceOf(Error);
        expect((caught as Error).message).toContain('aborted');
        await bus.stop();
    });
});
