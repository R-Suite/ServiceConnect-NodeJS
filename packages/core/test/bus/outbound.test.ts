import assert from 'node:assert';
import { describe, expect, it, vi } from 'vitest';
import { createBus } from '../../src/bus.js';
import { OutgoingFiltersBlockedError } from '../../src/errors.js';
import type { Message } from '../../src/message.js';
import { FilterAction, asFilter, asMiddleware } from '../../src/pipeline/index.js';
import { fakeTransport } from '../../src/testing/fake-transport.js';

interface Foo extends Message {
    v: number;
}

describe('Bus outbound', () => {
    it('publish() calls producer.publish with serialized body and stamped headers', async () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } }).registerMessage<Foo>(
            'Foo',
        );
        await bus.publish<Foo>('Foo', { correlationId: 'cor-1', v: 42 });
        expect(t.outbox).toHaveLength(1);
        const entry = t.outbox[0];
        assert(entry !== undefined, 'expected outbox[0] to be defined');
        expect(entry.operation).toBe('publish');
        expect(entry.typeName).toBe('Foo');
        const decoded = JSON.parse(new TextDecoder().decode(entry.body));
        expect(decoded).toEqual({ correlationId: 'cor-1', v: 42 });
        expect(entry.headers.messageType).toBe('Foo');
        expect(entry.headers.correlationId).toBe('cor-1');
        expect(entry.headers.sourceAddress).toBe('q-self');
        expect(entry.headers.messageId).toBeDefined();
        expect(entry.headers.timeSent).toBeDefined();
    });

    it('publish() preserves caller-supplied headers; framework keys win on collision', async () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } }).registerMessage<Foo>(
            'Foo',
        );
        await bus.publish<Foo>(
            'Foo',
            { correlationId: 'cor-1', v: 1 },
            { headers: { custom: 'v', messageType: 'Override' } },
        );
        const entry = t.outbox[0];
        assert(entry !== undefined, 'expected outbox[0] to be defined');
        expect(entry.headers.custom).toBe('v');
        // Framework keys (messageType, correlationId, sourceAddress, messageId, timeSent)
        // are stamped AFTER caller headers, so the framework value wins.
        expect(entry.headers.messageType).toBe('Foo');
    });

    it('publish() passes routingKey to producer when supplied', async () => {
        const t = fakeTransport({ supportsRoutingKey: true });
        const bus = createBus({ transport: t, queue: { name: 'q-self' } }).registerMessage<Foo>(
            'Foo',
        );
        await bus.publish<Foo>('Foo', { correlationId: 'cor-1', v: 1 }, { routingKey: 'rk' });
        const rkEntry = t.outbox[0];
        assert(rkEntry !== undefined, 'expected outbox[0] to be defined');
        expect(rkEntry.routingKey).toBe('rk');
    });

    it('send() calls producer.send with endpoint', async () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } }).registerMessage<Foo>(
            'Foo',
        );
        await bus.send<Foo>('Foo', { correlationId: 'cor-1', v: 1 }, { endpoint: 'q-target' });
        const entry = t.outbox[0];
        assert(entry !== undefined, 'expected outbox[0] to be defined');
        expect(entry.operation).toBe('send');
        expect(entry.endpoint).toBe('q-target');
    });

    it('sendToMany() calls producer.send once per endpoint', async () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } }).registerMessage<Foo>(
            'Foo',
        );
        await bus.sendToMany<Foo>('Foo', { correlationId: 'cor-1', v: 1 }, ['q-a', 'q-b', 'q-c']);
        expect(t.outbox).toHaveLength(3);
        expect(t.outbox.map((e) => e.endpoint)).toEqual(['q-a', 'q-b', 'q-c']);
    });

    it('outgoing filter Stop on publish throws OutgoingFiltersBlockedError', async () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } }).registerMessage<Foo>(
            'Foo',
        );
        bus.use(
            'outgoing',
            asFilter(() => FilterAction.Stop),
        );
        await expect(
            bus.publish<Foo>('Foo', { correlationId: 'cor-1', v: 1 }),
        ).rejects.toBeInstanceOf(OutgoingFiltersBlockedError);
        expect(t.outbox).toHaveLength(0);
    });

    it('outgoing filter Stop on send throws OutgoingFiltersBlockedError', async () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } }).registerMessage<Foo>(
            'Foo',
        );
        bus.use(
            'outgoing',
            asFilter(() => FilterAction.Stop),
        );
        await expect(
            bus.send<Foo>('Foo', { correlationId: 'cor-1', v: 1 }, { endpoint: 'q-target' }),
        ).rejects.toBeInstanceOf(OutgoingFiltersBlockedError);
    });

    it('outgoing middleware throw propagates to caller; producer NOT called', async () => {
        const t = fakeTransport();
        const publishSpy = vi.spyOn(t.producer, 'publish');
        const bus = createBus({ transport: t, queue: { name: 'q-self' } }).registerMessage<Foo>(
            'Foo',
        );
        bus.use(
            'outgoing',
            asMiddleware(async () => {
                throw new Error('mw-boom');
            }),
        );
        await expect(bus.publish<Foo>('Foo', { correlationId: 'cor-1', v: 1 })).rejects.toThrow(
            'mw-boom',
        );
        expect(publishSpy).not.toHaveBeenCalled();
    });

    it('outgoing middleware can mutate envelope.headers before next()', async () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } }).registerMessage<Foo>(
            'Foo',
        );
        bus.use(
            'outgoing',
            asMiddleware(async (ctx, next) => {
                ctx.envelope.headers.added = 'by-mw';
                await next();
            }),
        );
        await bus.publish<Foo>('Foo', { correlationId: 'cor-1', v: 1 });
        const mwEntry = t.outbox[0];
        assert(mwEntry !== undefined, 'expected outbox[0] to be defined');
        expect(mwEntry.headers.added).toBe('by-mw');
    });

    it('publish() of an unregistered type throws', async () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } });
        await expect(bus.publish('Unregistered', { correlationId: 'c' })).rejects.toThrow(
            /not registered/,
        );
    });
});
