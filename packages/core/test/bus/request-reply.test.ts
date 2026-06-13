import { describe, expect, it, vi } from 'vitest';
import { createBus } from '../../src/bus.js';
import type { Envelope } from '../../src/envelope.js';
import {
    ArgumentError,
    ArgumentOutOfRangeError,
    InvalidOperationError,
    MessageTypeNotRegisteredError,
    RequestTimeoutError,
} from '../../src/errors.js';
import type { Message } from '../../src/message.js';
import { fakeTransport } from '../../src/testing/fake-transport.js';

interface Req extends Message {
    q: string;
}
interface Rep extends Message {
    a: string;
}

/**
 * Drain the microtask queue enough times for the bus async pipeline to complete.
 * Uses only Promise.resolve() so it is safe with vi.useFakeTimers().
 */
async function drainMicrotasks(): Promise<void> {
    for (let i = 0; i < 8; i++) await Promise.resolve();
}

async function findRequestSent(t: ReturnType<typeof fakeTransport>): Promise<{
    body: Uint8Array;
    headers: Readonly<Record<string, string>>;
}> {
    await drainMicrotasks();
    const entry = t.outbox.find((e) => e.operation === 'send' || e.operation === 'publish');
    if (!entry) throw new Error('no outbound request found');
    return entry;
}

describe('Bus request-reply', () => {
    it('sendRequest round-trips via fakeTransport: outbound request + simulated reply', async () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } })
            .registerMessage<Req>('Req')
            .registerMessage<Rep>('Rep');
        await bus.start();

        const promise = bus.sendRequest<Req, Rep>(
            'Req',
            { correlationId: 'cor-1', q: 'hi' },
            { endpoint: 'q-target', timeoutMs: 5000 },
        );

        const outbound = await findRequestSent(t);
        expect(outbound.headers.messageType).toBe('Req');
        const requestMessageId = outbound.headers.requestMessageId;
        expect(typeof requestMessageId).toBe('string');

        const replyEnvelope: Envelope = {
            headers: {
                messageType: 'Rep',
                correlationId: 'cor-1',
                responseMessageId: requestMessageId,
            },
            body: new TextEncoder().encode(JSON.stringify({ correlationId: 'cor-1', a: 'pong' })),
        };
        await t.deliver(replyEnvelope);

        const reply = await promise;
        expect(reply.a).toBe('pong');

        await bus.stop();
    });

    it('sendRequest rejects with RequestTimeoutError when no reply arrives', async () => {
        vi.useFakeTimers();
        try {
            const t = fakeTransport();
            const bus = createBus({ transport: t, queue: { name: 'q-self' } }).registerMessage<Req>(
                'Req',
            );
            await bus.start();

            const promise = bus.sendRequest<Req, Rep>(
                'Req',
                { correlationId: 'c', q: 'hi' },
                { endpoint: 'q-target', timeoutMs: 100 },
            );

            vi.advanceTimersByTime(101);
            await expect(promise).rejects.toBeInstanceOf(RequestTimeoutError);

            await bus.stop();
        } finally {
            vi.useRealTimers();
        }
    });

    it('sendRequest throws ArgumentOutOfRangeError when timeoutMs is missing or zero', async () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } }).registerMessage<Req>(
            'Req',
        );
        await bus.start();
        await expect(
            bus.sendRequest<Req, Rep>(
                'Req',
                { correlationId: 'c', q: 'x' },
                {
                    endpoint: 'q-target',
                    timeoutMs: 0,
                },
            ),
        ).rejects.toBeInstanceOf(ArgumentOutOfRangeError);
        await bus.stop();
    });

    it('sendRequest throws MessageTypeNotRegisteredError for unregistered types', async () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } });
        await bus.start();
        await expect(
            bus.sendRequest<Req, Rep>(
                'Unknown',
                { correlationId: 'c', q: 'x' },
                {
                    endpoint: 'q-target',
                    timeoutMs: 5000,
                },
            ),
        ).rejects.toBeInstanceOf(MessageTypeNotRegisteredError);
        await bus.stop();
    });

    it('sendRequest wraps send failures and rethrows the original transport error', async () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } }).registerMessage<Req>(
            'Req',
        );
        await bus.start();

        const sendSpy = vi.spyOn(t.producer, 'send').mockRejectedValue(new Error('transport down'));
        await expect(
            bus.sendRequest<Req, Rep>(
                'Req',
                { correlationId: 'c', q: 'x' },
                {
                    endpoint: 'q-target',
                    timeoutMs: 5000,
                },
            ),
        ).rejects.toThrow('transport down');
        expect(sendSpy).toHaveBeenCalledOnce();

        await bus.stop();
    });

    it('sendRequestMulti rejects with RequestTimeoutError + partialReplies when expected count not met', async () => {
        vi.useFakeTimers();
        try {
            const t = fakeTransport();
            const bus = createBus({ transport: t, queue: { name: 'q-self' } })
                .registerMessage<Req>('Req')
                .registerMessage<Rep>('Rep');
            await bus.start();

            const promise = bus.sendRequestMulti<Req, Rep>(
                'Req',
                { correlationId: 'c', q: 'x' },
                { endpoint: 'q-target', timeoutMs: 200, expectedReplyCount: 3 },
            );
            // Catch immediately to avoid unhandled-rejection warnings while we drive the test.
            const settled = promise.catch((e) => e as RequestTimeoutError);

            const outbound = await findRequestSent(t);
            const requestMessageId = outbound.headers.requestMessageId;
            const replyEnvelope: Envelope = {
                headers: { messageType: 'Rep', responseMessageId: requestMessageId },
                body: new TextEncoder().encode(JSON.stringify({ correlationId: 'c', a: '1' })),
            };
            await t.deliver(replyEnvelope);

            vi.advanceTimersByTime(201);
            const err = await settled;
            expect(err).toBeInstanceOf(RequestTimeoutError);
            expect(err.partialReplies).toHaveLength(1);

            await bus.stop();
        } finally {
            vi.useRealTimers();
        }
    });

    it('publishRequest rejects with ArgumentError when options.endpoint is set', async () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } }).registerMessage<Req>(
            'Req',
        );
        await bus.start();
        await expect(
            bus.publishRequest<Req, Rep>('Req', { correlationId: 'c', q: 'x' }, () => {}, {
                endpoint: 'q-target',
                timeoutMs: 5000,
            }),
        ).rejects.toBeInstanceOf(ArgumentError);
        await bus.stop();
    });

    it('publishRequest calls onReply per matching reply and resolves at expectedReplyCount', async () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } })
            .registerMessage<Req>('Req')
            .registerMessage<Rep>('Rep');
        await bus.start();

        const seen: Rep[] = [];
        const promise = bus.publishRequest<Req, Rep>(
            'Req',
            { correlationId: 'c', q: 'x' },
            (r) => {
                seen.push(r);
            },
            { timeoutMs: 5000, expectedReplyCount: 2 },
        );

        const outbound = await findRequestSent(t);
        const requestMessageId = outbound.headers.requestMessageId;
        const replyEnvelope = (a: string): Envelope => ({
            headers: { messageType: 'Rep', responseMessageId: requestMessageId },
            body: new TextEncoder().encode(JSON.stringify({ correlationId: 'c', a })),
        });
        await t.deliver(replyEnvelope('1'));
        await t.deliver(replyEnvelope('2'));

        await expect(promise).resolves.toBeUndefined();
        expect(seen.map((r) => r.a)).toEqual(['1', '2']);

        await bus.stop();
    });

    it('bus.stop() rejects in-flight requests with InvalidOperationError', async () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } }).registerMessage<Req>(
            'Req',
        );
        await bus.start();

        const promise = bus.sendRequest<Req, Rep>(
            'Req',
            { correlationId: 'c', q: 'x' },
            { endpoint: 'q-target', timeoutMs: 5000 },
        );
        const reject = promise.catch((e) => e);

        await bus.stop();
        const err = await reject;
        expect(err).toBeInstanceOf(InvalidOperationError);
        expect((err as Error).message).toMatch(/stopped/);
    });
});
