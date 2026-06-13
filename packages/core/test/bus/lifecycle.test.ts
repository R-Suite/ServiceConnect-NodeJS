import { describe, expect, it, vi } from 'vitest';
import { createBus } from '../../src/bus.js';
import type { Message } from '../../src/message.js';
import { fakeTransport } from '../../src/testing/fake-transport.js';

interface Foo extends Message {
    v: number;
}

describe('Bus lifecycle', () => {
    it('createBus returns a Bus that starts as not-started, not-stopped', () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } });
        expect(bus.queue).toBe('q-self');
        expect(bus.isStarted).toBe(false);
        expect(bus.isStopped).toBe(false);
    });

    it('start() calls consumer.start with the registered message type list', async () => {
        const t = fakeTransport();
        const startSpy = vi.spyOn(t.consumer, 'start');
        const bus = createBus({ transport: t, queue: { name: 'q-self' } });
        bus.registerMessage<Foo>('Foo');
        bus.registerMessage<Foo>('Bar');
        await bus.start();
        expect(startSpy).toHaveBeenCalledOnce();
        const call = startSpy.mock.calls[0];
        expect(call).toBeDefined();
        const [queue, types] = call ?? (['', []] as [string, readonly string[], ...unknown[]]);

        expect(queue).toBe('q-self');
        expect([...types].sort()).toEqual(['Bar', 'Foo']);
        expect(bus.isStarted).toBe(true);
    });

    it('start() is idempotent', async () => {
        const t = fakeTransport();
        const startSpy = vi.spyOn(t.consumer, 'start');
        const bus = createBus({ transport: t, queue: { name: 'q-self' } });
        await bus.start();
        await bus.start();
        expect(startSpy).toHaveBeenCalledOnce();
    });

    it('stop() calls consumer.stop and flips isStopped', async () => {
        const t = fakeTransport();
        const stopSpy = vi.spyOn(t.consumer, 'stop');
        const bus = createBus({ transport: t, queue: { name: 'q-self' } });
        await bus.start();
        await bus.stop();
        expect(stopSpy).toHaveBeenCalledOnce();
        expect(bus.isStopped).toBe(true);
    });

    it('after stop(), start() throws', async () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } });
        await bus.start();
        await bus.stop();
        await expect(bus.start()).rejects.toThrow(/stopped/);
    });

    it('[Symbol.asyncDispose] runs stop()', async () => {
        const t = fakeTransport();
        const stopSpy = vi.spyOn(t.consumer, 'stop');
        {
            const bus = createBus({ transport: t, queue: { name: 'q-self' } });
            await bus.start();
            await bus[Symbol.asyncDispose]();
        }
        expect(stopSpy).toHaveBeenCalledOnce();
    });

    it('registerMessage, handle, use all return `this` for chaining', () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } });
        const r1 = bus.registerMessage<Foo>('Foo');
        expect(r1).toBe(bus);
        const r2 = bus.handle<Foo>('Foo', async () => {});
        expect(r2).toBe(bus);
    });

    it('handle throws MessageTypeNotRegisteredError if the type is not registered', () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } });
        expect(() => bus.handle<Foo>('Foo', async () => {})).toThrow(/not registered/);
    });

    it('isHandled reflects registration', () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } });
        bus.registerMessage<Foo>('Foo');
        expect(bus.isHandled('Foo')).toBe(false);
        bus.handle<Foo>('Foo', async () => {});
        expect(bus.isHandled('Foo')).toBe(true);
    });

    it('unhandle removes a handler', () => {
        const t = fakeTransport();
        const bus = createBus({ transport: t, queue: { name: 'q-self' } });
        bus.registerMessage<Foo>('Foo');
        const h = async () => {};
        bus.handle<Foo>('Foo', h);
        bus.unhandle<Foo>('Foo', h);
        expect(bus.isHandled('Foo')).toBe(false);
    });
});
