import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createBus } from '../../src/bus.js';
import { OutgoingFiltersBlockedError } from '../../src/errors.js';
import type { Message } from '../../src/message.js';
import { FilterAction, asFilter, asMiddleware } from '../../src/pipeline/index.js';
import { fakeTransport } from '../../src/testing/fake-transport.js';

// Regression for bus.ts route(): routing-slip sends must traverse the outgoing
// filter/middleware pipeline exactly like publish/send/sendToMany — so header
// mutation and FilterAction.Stop apply to the first routing-slip hop too.

interface OrderCreated extends Message {
    orderId: string;
}

describe('route() runs the outgoing filter pipeline', () => {
    it('applies header-mutating outgoing middleware to the routed send', async () => {
        const t = fakeTransport();
        const bus = createBus({
            transport: t,
            queue: { name: `q-${randomUUID()}` },
        }).registerMessage<OrderCreated>('OrderCreated');
        bus.use(
            'outgoing',
            asMiddleware(async (ctx, next) => {
                ctx.envelope.headers['x-stamped-by-outgoing'] = 'yes';
                await next();
            }),
        );
        await bus.start();

        await bus.route<OrderCreated>(
            'OrderCreated',
            { correlationId: 'c-route', orderId: 'o-route' },
            ['inventory-queue', 'payment-queue'],
        );
        await bus.stop();

        const routeEntry = t.outbox.find((e) => e.operation === 'send');
        expect(routeEntry).toBeDefined();
        expect(routeEntry?.headers['x-stamped-by-outgoing']).toBe('yes');
    });

    it('honours a Stop outgoing filter: route() throws and emits nothing', async () => {
        const t = fakeTransport();
        const bus = createBus({
            transport: t,
            queue: { name: `q-${randomUUID()}` },
        }).registerMessage<OrderCreated>('OrderCreated');
        bus.use(
            'outgoing',
            asFilter(() => FilterAction.Stop),
        );
        await bus.start();

        await expect(
            bus.route<OrderCreated>(
                'OrderCreated',
                { correlationId: 'c-route', orderId: 'o-route' },
                ['inventory-queue', 'payment-queue'],
            ),
        ).rejects.toBeInstanceOf(OutgoingFiltersBlockedError);
        await bus.stop();

        expect(t.outbox.filter((e) => e.operation === 'send')).toHaveLength(0);
    });
});
