import assert from 'node:assert';
import { describe, expect, it, vi } from 'vitest';
import { createBus } from '../../src/bus.js';
import type { Message } from '../../src/message.js';
import { asMiddleware } from '../../src/pipeline/index.js';
import { fakeTransport } from '../../src/testing/fake-transport.js';

interface OrderCreated extends Message {
    orderId: string;
    total: number;
}

function makeEnvelope(typeName: string, message: object, extra: Record<string, unknown> = {}) {
    return {
        headers: {
            messageType: typeName,
            correlationId: 'cor-1',
            sourceAddress: 'q-other',
            requestMessageId: 'req-1',
            messageId: 'm-1',
            ...extra,
        },
        body: new TextEncoder().encode(JSON.stringify(message)),
    };
}

describe('Bus inbound integration', () => {
    it('delivered message reaches a registered handler with the correct message and context', async () => {
        const t = fakeTransport();
        const seen: Array<{ msg: OrderCreated; correlationId: string }> = [];
        const bus = createBus({ transport: t, queue: { name: 'q-self' } })
            .registerMessage<OrderCreated>('OrderCreated')
            .handle<OrderCreated>('OrderCreated', async (msg, ctx) => {
                seen.push({ msg, correlationId: ctx.correlationId });
            });
        await bus.start();
        const result = await t.deliver(
            makeEnvelope('OrderCreated', { correlationId: 'cor-1', orderId: 'O', total: 9 }),
        );
        expect(result).toEqual({ success: true, notHandled: false, terminalFailure: false });
        expect(seen).toHaveLength(1);
        const captured = seen[0];
        assert(captured !== undefined);
        expect(captured.msg.orderId).toBe('O');
        expect(captured.correlationId).toBe('cor-1');
    });

    it('beforeConsuming middleware runs before the handler', async () => {
        const t = fakeTransport();
        const order: string[] = [];
        const bus = createBus({ transport: t, queue: { name: 'q-self' } })
            .registerMessage<OrderCreated>('OrderCreated')
            .use(
                'beforeConsuming',
                asMiddleware(async (_c, next) => {
                    order.push('before');
                    await next();
                    order.push('before-post');
                }),
            )
            .handle<OrderCreated>('OrderCreated', async () => {
                order.push('handler');
            });
        await bus.start();
        await t.deliver(
            makeEnvelope('OrderCreated', { correlationId: 'cor-1', orderId: 'O', total: 9 }),
        );
        expect(order).toEqual(['before', 'before-post', 'handler']);
    });

    it('handler can reply via ctx.reply, hitting producer.send', async () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } })
            .registerMessage<OrderCreated>('OrderCreated')
            .registerMessage<Message>('OrderStatus')
            .handle<OrderCreated>('OrderCreated', async (msg, ctx) => {
                await ctx.reply<Message>('OrderStatus', { correlationId: msg.correlationId });
            });
        await bus.start();
        await t.deliver(
            makeEnvelope('OrderCreated', { correlationId: 'cor-1', orderId: 'O', total: 1 }),
        );
        const replyEntries = t.outbox.filter(
            (e) => e.operation === 'send' && e.typeName === 'OrderStatus',
        );
        expect(replyEntries).toHaveLength(1);
        const reply = replyEntries[0];
        assert(reply !== undefined);
        expect(reply.endpoint).toBe('q-other');
        expect(reply.headers.responseMessageId).toBe('req-1');
    });

    it('factory handler is invoked once per delivery', async () => {
        const t = fakeTransport();
        const factory = vi.fn(() => async () => {});
        const bus = createBus({ transport: t, queue: { name: 'q-self' } })
            .registerMessage<OrderCreated>('OrderCreated')
            .handle<OrderCreated>('OrderCreated', { factory });
        await bus.start();
        await t.deliver(
            makeEnvelope('OrderCreated', { correlationId: 'c', orderId: 'O', total: 1 }),
        );
        await t.deliver(
            makeEnvelope('OrderCreated', { correlationId: 'c', orderId: 'O', total: 1 }),
        );
        expect(factory).toHaveBeenCalledTimes(2);
    });

    it('after bus.stop(), in-flight ctx.signal fires', async () => {
        const t = fakeTransport();
        let captured: AbortSignal | undefined;
        const bus = createBus({ transport: t, queue: { name: 'q-self' } })
            .registerMessage<OrderCreated>('OrderCreated')
            .handle<OrderCreated>('OrderCreated', async (_msg, ctx) => {
                captured = ctx.signal;
            });
        await bus.start();
        await t.deliver(
            makeEnvelope('OrderCreated', { correlationId: 'c', orderId: 'O', total: 1 }),
        );
        expect(captured).toBeDefined();
        assert(captured !== undefined);
        expect(captured.aborted).toBe(false);
        await bus.stop();
        expect(captured.aborted).toBe(true);
    });
});
