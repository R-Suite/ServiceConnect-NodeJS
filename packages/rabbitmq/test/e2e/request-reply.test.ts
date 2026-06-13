import { randomUUID } from 'node:crypto';
import { type Message, RequestTimeoutError, createBus } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

interface Req extends Message {
    q: string;
}
interface Rep extends Message {
    a: string;
}

describe('E2E request-reply', () => {
    it('single sendRequest round-trip across two buses', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const requesterQueue = `q-req-${randomUUID().slice(0, 8)}`;
        const responderQueue = `q-rsp-${randomUUID().slice(0, 8)}`;

        const requester = createBus({
            transport: createRabbitMQTransport({ url }),
            queue: { name: requesterQueue },
        })
            .registerMessage<Req>('Req')
            .registerMessage<Rep>('Rep');

        const responder = createBus({
            transport: createRabbitMQTransport({ url }),
            queue: { name: responderQueue },
        })
            .registerMessage<Req>('Req')
            .registerMessage<Rep>('Rep')
            .handle<Req>('Req', async (msg, ctx) => {
                await ctx.reply<Rep>('Rep', {
                    correlationId: msg.correlationId,
                    a: `pong:${msg.q}`,
                });
            });

        await requester.start();
        await responder.start();

        const reply = await requester.sendRequest<Req, Rep>(
            'Req',
            { correlationId: 'c-1', q: 'hello' },
            { endpoint: responderQueue, timeoutMs: 5000 },
        );
        expect(reply.a).toBe('pong:hello');

        await requester.stop();
        await responder.stop();
    });

    it('sendRequest rejects with RequestTimeoutError when no responder', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const requesterQueue = `q-req-${randomUUID().slice(0, 8)}`;
        const nonexistentEndpoint = `q-missing-${randomUUID().slice(0, 8)}`;

        const requester = createBus({
            transport: createRabbitMQTransport({ url }),
            queue: { name: requesterQueue },
        }).registerMessage<Req>('Req');

        await requester.start();
        await expect(
            requester.sendRequest<Req, Rep>(
                'Req',
                { correlationId: 'c', q: 'x' },
                { endpoint: nonexistentEndpoint, timeoutMs: 500 },
            ),
        ).rejects.toBeInstanceOf(RequestTimeoutError);

        await requester.stop();
    });

    it('sendRequestMulti early-completes at expectedReplyCount', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const requesterQueue = `q-mreq-${randomUUID().slice(0, 8)}`;
        const reqType = `Req-${randomUUID().slice(0, 8)}`;
        const repType = `Rep-${randomUUID().slice(0, 8)}`;

        const requester = createBus({
            transport: createRabbitMQTransport({ url }),
            queue: { name: requesterQueue },
        })
            .registerMessage<Req>(reqType)
            .registerMessage<Rep>(repType);

        const responders = await Promise.all(
            [0, 1, 2].map(async (i) => {
                const queue = `q-mr${i}-${randomUUID().slice(0, 8)}`;
                const responder = createBus({
                    transport: createRabbitMQTransport({ url }),
                    queue: { name: queue },
                })
                    .registerMessage<Req>(reqType)
                    .registerMessage<Rep>(repType)
                    .handle<Req>(reqType, async (msg, ctx) => {
                        await ctx.reply<Rep>(repType, {
                            correlationId: msg.correlationId,
                            a: `r${i}`,
                        });
                    });
                await responder.start();
                return responder;
            }),
        );

        await requester.start();
        const replies = await requester.sendRequestMulti<Req, Rep>(
            reqType,
            { correlationId: 'c', q: 'x' },
            { timeoutMs: 5000, expectedReplyCount: 3 },
        );
        expect(replies).toHaveLength(3);
        expect(new Set(replies.map((r) => r.a))).toEqual(new Set(['r0', 'r1', 'r2']));

        await requester.stop();
        for (const responder of responders) {
            await responder.stop();
        }
    });

    it('sendRequestMulti times out with partial replies when expectedReplyCount exceeds responders', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const requesterQueue = `q-preq-${randomUUID().slice(0, 8)}`;
        const reqType = `Req-${randomUUID().slice(0, 8)}`;
        const repType = `Rep-${randomUUID().slice(0, 8)}`;

        const requester = createBus({
            transport: createRabbitMQTransport({ url }),
            queue: { name: requesterQueue },
        })
            .registerMessage<Req>(reqType)
            .registerMessage<Rep>(repType);

        const responderQueue = `q-pr-${randomUUID().slice(0, 8)}`;
        const responder = createBus({
            transport: createRabbitMQTransport({ url }),
            queue: { name: responderQueue },
        })
            .registerMessage<Req>(reqType)
            .registerMessage<Rep>(repType)
            .handle<Req>(reqType, async (msg, ctx) => {
                await ctx.reply<Rep>(repType, { correlationId: msg.correlationId, a: 'only' });
            });

        await responder.start();
        await requester.start();

        const err = await requester
            .sendRequestMulti<Req, Rep>(
                reqType,
                { correlationId: 'c', q: 'x' },
                { timeoutMs: 1500, expectedReplyCount: 3 },
            )
            .catch((e) => e as RequestTimeoutError);
        expect(err).toBeInstanceOf(RequestTimeoutError);
        expect(err.partialReplies).toHaveLength(1);

        await requester.stop();
        await responder.stop();
    });

    it('publishRequest invokes onReply per matching reply', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const requesterQueue = `q-pubreq-${randomUUID().slice(0, 8)}`;
        const reqType = `Req-${randomUUID().slice(0, 8)}`;
        const repType = `Rep-${randomUUID().slice(0, 8)}`;

        const requester = createBus({
            transport: createRabbitMQTransport({ url }),
            queue: { name: requesterQueue },
        })
            .registerMessage<Req>(reqType)
            .registerMessage<Rep>(repType);

        const responders = await Promise.all(
            [0, 1].map(async (i) => {
                const queue = `q-pubr${i}-${randomUUID().slice(0, 8)}`;
                const responder = createBus({
                    transport: createRabbitMQTransport({ url }),
                    queue: { name: queue },
                })
                    .registerMessage<Req>(reqType)
                    .registerMessage<Rep>(repType)
                    .handle<Req>(reqType, async (msg, ctx) => {
                        await ctx.reply<Rep>(repType, {
                            correlationId: msg.correlationId,
                            a: `p${i}`,
                        });
                    });
                await responder.start();
                return responder;
            }),
        );

        await requester.start();

        const seen: string[] = [];
        await requester.publishRequest<Req, Rep>(
            reqType,
            { correlationId: 'c', q: 'x' },
            (r) => {
                seen.push(r.a);
            },
            { timeoutMs: 3000, expectedReplyCount: 2 },
        );
        expect(seen.sort()).toEqual(['p0', 'p1']);

        await requester.stop();
        for (const responder of responders) {
            await responder.stop();
        }
    });
});
