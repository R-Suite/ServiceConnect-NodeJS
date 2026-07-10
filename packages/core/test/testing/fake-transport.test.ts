import { describe, expect, it } from 'vitest';
import type { Envelope } from '../../src/envelope.js';
import { fakeTransport } from '../../src/testing/fake-transport.js';
import type { ConsumeResult } from '../../src/transport.js';

const success: ConsumeResult = { success: true, notHandled: false, terminalFailure: false };

describe('fakeTransport', () => {
    it('producer.publish records to the outbox', async () => {
        const t = fakeTransport();
        await t.producer.publish('Foo', new Uint8Array([1, 2, 3]), { headers: { h: 'v' } });
        expect(t.outbox).toHaveLength(1);
        const entry = t.outbox[0];
        expect(entry?.operation).toBe('publish');
        expect(entry?.typeName).toBe('Foo');
        expect(entry?.body).toEqual(new Uint8Array([1, 2, 3]));
        expect(entry?.headers).toEqual({ h: 'v' });
    });

    it('producer.send records endpoint', async () => {
        const t = fakeTransport();
        await t.producer.send('q-target', 'Foo', new Uint8Array([1]));
        const entry = t.outbox[0];
        expect(entry?.operation).toBe('send');
        expect(entry?.endpoint).toBe('q-target');
    });

    it('producer.sendBytes records as sendBytes operation', async () => {
        const t = fakeTransport();
        await t.producer.sendBytes('q-target', 'Stream', new Uint8Array([7]));
        const entry = t.outbox[0];
        expect(entry?.operation).toBe('sendBytes');
    });

    it('producer.publish honours supportsRoutingKey: false (default) by ignoring routingKey', async () => {
        const t = fakeTransport();
        expect(t.producer.supportsRoutingKey).toBe(false);
        await t.producer.publish('Foo', new Uint8Array(), { routingKey: 'rk' });
        expect(t.outbox[0]?.routingKey).toBeUndefined();
    });

    it('producer.publish records routingKey when supportsRoutingKey is true', async () => {
        const t = fakeTransport({ supportsRoutingKey: true });
        await t.producer.publish('Foo', new Uint8Array(), { routingKey: 'rk' });
        expect(t.outbox[0]?.routingKey).toBe('rk');
    });

    it('producer reports maxMessageSize from options', async () => {
        const t = fakeTransport({ maxMessageSize: 4096 });
        expect(t.producer.maxMessageSize).toBe(4096);
    });

    it('consumer.start registers the callback; deliver() invokes it and returns the result', async () => {
        const t = fakeTransport();
        let captured: Envelope | undefined;
        await t.consumer.start('q', ['Foo'], async (env) => {
            captured = env;
            return success;
        });
        const envelope: Envelope = { headers: { messageType: 'Foo' }, body: new Uint8Array([9]) };
        const result = await t.deliver(envelope);
        expect(captured).toBe(envelope);
        expect(result).toEqual(success);
    });

    it('deliver before start throws', async () => {
        const t = fakeTransport();
        await expect(t.deliver({ headers: {}, body: new Uint8Array() })).rejects.toThrow(/start/);
    });

    it('cancelByBroker flips isCancelledByBroker and isConnected to false', async () => {
        const t = fakeTransport();
        await t.consumer.start('q', ['Foo'], async () => success);
        expect(t.consumer.isCancelledByBroker).toBe(false);
        expect(t.consumer.isConnected).toBe(true);
        t.cancelByBroker();
        expect(t.consumer.isCancelledByBroker).toBe(true);
        expect(t.consumer.isConnected).toBe(false);
    });

    it('disconnect / reconnect toggles isConnected without flipping isCancelledByBroker', async () => {
        const t = fakeTransport();
        await t.consumer.start('q', ['Foo'], async () => success);
        t.disconnect();
        expect(t.consumer.isConnected).toBe(false);
        expect(t.consumer.isCancelledByBroker).toBe(false);
        t.reconnect();
        expect(t.consumer.isConnected).toBe(true);
    });

    it('consumer.stop sets isStopped true permanently', async () => {
        const t = fakeTransport();
        await t.consumer.start('q', ['Foo'], async () => success);
        await t.consumer.stop();
        expect(t.consumer.isStopped).toBe(true);
    });

    it('disposing producer/consumer is idempotent', async () => {
        const t = fakeTransport();
        await t.consumer.start('q', ['Foo'], async () => success);
        await t.producer[Symbol.asyncDispose]();
        await t.producer[Symbol.asyncDispose]();
        await t.consumer[Symbol.asyncDispose]();
        await t.consumer[Symbol.asyncDispose]();
    });
});
