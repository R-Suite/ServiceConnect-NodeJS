import type { ConsumeResult } from '@serviceconnect/core';
import type { Connection, Consumer, ConsumerHandler, Publisher } from 'rabbitmq-client';
import { describe, expect, it, vi } from 'vitest';
import { createConsumer } from '../../src/consumer.js';
import { resolveConsumerOptions } from '../../src/options.js';

// Regression for the consumer `concurrency` option: it bounds how many messages the underlying
// rabbitmq-client Consumer processes at once. Unset must mean unbounded (rabbitmq-client default),
// so existing behaviour is unchanged.

function fakeConnection() {
    const dispatchPublisher = {
        send: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
    } as unknown as Publisher;
    const consumer = {
        close: vi.fn(async () => {}),
        on: vi.fn(),
        once: vi.fn((event: string, cb: () => void) => {
            if (event === 'ready') cb();
        }),
    } as unknown as Consumer;
    const connection = {
        queueDeclare: vi.fn(async () => undefined),
        exchangeDeclare: vi.fn(async () => undefined),
        queueBind: vi.fn(async () => undefined),
        createPublisher: vi.fn(() => dispatchPublisher),
        createConsumer: vi.fn((_props: object, _handler: ConsumerHandler) => consumer),
        close: vi.fn(async () => undefined),
        get ready() {
            return true;
        },
    } as unknown as Connection;
    return { connection };
}

const ok: ConsumeResult = { success: true, notHandled: false, terminalFailure: false };

describe('consumer concurrency option', () => {
    it('defaults to undefined (unbounded) when not configured', () => {
        expect(resolveConsumerOptions({ url: '' }).concurrency).toBeUndefined();
    });

    it('passes a configured concurrency through resolution', () => {
        expect(resolveConsumerOptions({ url: '', consumer: { concurrency: 1 } }).concurrency).toBe(
            1,
        );
    });

    it('forwards concurrency to the underlying Consumer when set', async () => {
        const { connection } = fakeConnection();
        const c = createConsumer(
            connection,
            resolveConsumerOptions({ url: '', consumer: { concurrency: 4 } }),
        );
        await c.start('q-self', [], async () => ok);
        const call = (connection.createConsumer as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(call?.[0]).toMatchObject({ concurrency: 4 });
    });

    it('omits concurrency when unset so rabbitmq-client stays unbounded', async () => {
        const { connection } = fakeConnection();
        const c = createConsumer(connection, resolveConsumerOptions({ url: '' }));
        await c.start('q-self', [], async () => ok);
        const call = (connection.createConsumer as ReturnType<typeof vi.fn>).mock.calls[0];
        expect('concurrency' in (call?.[0] ?? {})).toBe(false);
    });
});
