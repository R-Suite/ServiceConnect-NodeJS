import type { ConsumeResult, Envelope } from '@serviceconnect/core';
import type {
    AsyncMessage,
    Connection,
    Consumer,
    ConsumerHandler,
    Publisher,
} from 'rabbitmq-client';
import { describe, expect, it, vi } from 'vitest';
import { createConsumer } from '../../src/consumer.js';
import { resolveConsumerOptions } from '../../src/options.js';

function fakeConnection() {
    const dispatchPublisher = {
        send: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
    } as unknown as Publisher;
    let consumerHandler: ConsumerHandler | undefined;
    const consumer = {
        close: vi.fn(async () => {}),
        on: vi.fn(),
        // once('ready', cb) is called by start() to wait for broker subscription;
        // in the unit test the fake consumer is immediately ready, so invoke cb synchronously.
        once: vi.fn((event: string, cb: () => void) => {
            if (event === 'ready') cb();
        }),
    } as unknown as Consumer;
    const connection = {
        queueDeclare: vi.fn(async () => undefined),
        exchangeDeclare: vi.fn(async () => undefined),
        queueBind: vi.fn(async () => undefined),
        createPublisher: vi.fn(() => dispatchPublisher),
        createConsumer: vi.fn((_props: object, handler: ConsumerHandler) => {
            consumerHandler = handler;
            return consumer;
        }),
        close: vi.fn(async () => undefined),
        get ready() {
            return true;
        },
    } as unknown as Connection;
    return { connection, dispatchPublisher, consumer, getHandler: () => consumerHandler };
}

const okResult: ConsumeResult = { success: true, notHandled: false, terminalFailure: false };

function fakeAsyncMessage(headers: Record<string, unknown> = {}): AsyncMessage {
    return {
        body: Buffer.from('{}'),
        headers,
        routingKey: 'q-self',
    } as unknown as AsyncMessage;
}

describe('createConsumer', () => {
    it('start() declares topology and binds queue to every messageType exchange', async () => {
        const { connection } = fakeConnection();
        const consumer = createConsumer(connection, resolveConsumerOptions({ url: '' }));
        await consumer.start('q-self', ['OrderCreated', 'OrderShipped'], async () => okResult);
        expect(connection.queueDeclare).toHaveBeenCalled();
        expect(connection.exchangeDeclare).toHaveBeenCalledWith(
            expect.objectContaining({ exchange: 'OrderCreated', type: 'fanout' }),
        );
        expect(connection.exchangeDeclare).toHaveBeenCalledWith(
            expect.objectContaining({ exchange: 'OrderShipped', type: 'fanout' }),
        );
        expect(connection.queueBind).toHaveBeenCalledWith(
            expect.objectContaining({ exchange: 'OrderCreated', queue: 'q-self' }),
        );
        expect(connection.queueBind).toHaveBeenCalledWith(
            expect.objectContaining({ exchange: 'OrderShipped', queue: 'q-self' }),
        );
    });

    it('start() opens a rabbitmq-client Consumer with the configured prefetch', async () => {
        const { connection } = fakeConnection();
        const consumer = createConsumer(
            connection,
            resolveConsumerOptions({ url: '', consumer: { prefetch: 25 } }),
        );
        await consumer.start('q-self', [], async () => okResult);
        expect(connection.createConsumer).toHaveBeenCalled();
        const call = (connection.createConsumer as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(call?.[0]).toMatchObject({ queue: 'q-self', qos: { prefetchCount: 25 } });
    });

    it('start() throws if called twice', async () => {
        const { connection } = fakeConnection();
        const consumer = createConsumer(connection, resolveConsumerOptions({ url: '' }));
        await consumer.start('q-self', [], async () => okResult);
        await expect(consumer.start('q-self', [], async () => okResult)).rejects.toThrow(
            /already/i,
        );
    });

    it('start() throws if called after stop()', async () => {
        const { connection } = fakeConnection();
        const consumer = createConsumer(connection, resolveConsumerOptions({ url: '' }));
        await consumer.start('q-self', [], async () => okResult);
        await consumer.stop();
        await expect(consumer.start('q-self', [], async () => okResult)).rejects.toThrow(
            /stopped/i,
        );
    });

    it('on success: invokes callback with mapped Envelope and acks (no republish)', async () => {
        const { connection, dispatchPublisher, getHandler } = fakeConnection();
        let captured: Envelope | undefined;
        const consumer = createConsumer(connection, resolveConsumerOptions({ url: '' }));
        await consumer.start('q-self', [], async (envelope) => {
            captured = envelope;
            return okResult;
        });
        await getHandler()?.(fakeAsyncMessage({ MessageType: 'Foo' }));
        expect(captured?.headers.MessageType).toBe('Foo');
        expect(dispatchPublisher.send).not.toHaveBeenCalled();
    });

    it('on handler failure with retries left: republishes to retry exchange with incremented RetryCount', async () => {
        const { connection, dispatchPublisher, getHandler } = fakeConnection();
        const consumer = createConsumer(
            connection,
            resolveConsumerOptions({ url: '', consumer: { maxRetries: 3 } }),
        );
        await consumer.start('q-self', [], async () => ({
            success: false,
            notHandled: false,
            terminalFailure: false,
            error: new Error('boom'),
        }));
        await getHandler()?.(fakeAsyncMessage({ RetryCount: 0 }));
        expect(dispatchPublisher.send).toHaveBeenCalledOnce();
        const call = (dispatchPublisher.send as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(call?.[0]).toMatchObject({
            exchange: '',
            routingKey: 'q-self.Retries',
        });
        expect(call?.[0]?.headers?.RetryCount).toBe(1);
    });

    it('on terminal failure: republishes to error queue with Exception header', async () => {
        const { connection, dispatchPublisher, getHandler } = fakeConnection();
        const consumer = createConsumer(connection, resolveConsumerOptions({ url: '' }));
        await consumer.start('q-self', [], async () => ({
            success: false,
            notHandled: false,
            terminalFailure: true,
            error: new Error('bad json'),
        }));
        await getHandler()?.(fakeAsyncMessage());
        expect(dispatchPublisher.send).toHaveBeenCalledOnce();
        const call = (dispatchPublisher.send as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(call?.[0]).toMatchObject({ exchange: 'errors', routingKey: '' });
        expect(call?.[0]?.headers?.Exception).toContain('bad json');
        expect(call?.[0]?.headers?.TerminalFailure).toBe('true');
    });

    it('on retries exhausted: republishes to error queue with finalRetryCount', async () => {
        const { connection, dispatchPublisher, getHandler } = fakeConnection();
        const consumer = createConsumer(
            connection,
            resolveConsumerOptions({ url: '', consumer: { maxRetries: 3 } }),
        );
        await consumer.start('q-self', [], async () => ({
            success: false,
            notHandled: false,
            terminalFailure: false,
            error: new Error('still broken'),
        }));
        await getHandler()?.(fakeAsyncMessage({ RetryCount: 2 }));
        const call = (dispatchPublisher.send as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(call?.[0]).toMatchObject({ exchange: 'errors', routingKey: '' });
        expect(call?.[0]?.headers?.RetryCount).toBe(3);
    });

    it('on success with auditEnabled: also republishes to the audit queue', async () => {
        const { connection, dispatchPublisher, getHandler } = fakeConnection();
        const consumer = createConsumer(
            connection,
            resolveConsumerOptions({ url: '', consumer: { auditEnabled: true } }),
        );
        await consumer.start('q-self', [], async () => okResult);
        await getHandler()?.(fakeAsyncMessage());
        expect(dispatchPublisher.send).toHaveBeenCalledOnce();
        const call = (dispatchPublisher.send as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(call?.[0]).toMatchObject({ exchange: 'audit', routingKey: '' });
    });

    it('stop() aborts the per-message AbortSignal and closes the underlying consumer', async () => {
        const { connection, consumer, getHandler } = fakeConnection();
        let capturedSignal: AbortSignal | undefined;
        const c = createConsumer(connection, resolveConsumerOptions({ url: '' }));
        await c.start('q-self', [], async (_env, signal) => {
            capturedSignal = signal;
            return okResult;
        });
        // Deliver one message to capture the signal that handlers see.
        await getHandler()?.(fakeAsyncMessage());
        expect(capturedSignal).toBeDefined();
        expect(capturedSignal?.aborted).toBe(false);

        await c.stop();
        expect(consumer.close).toHaveBeenCalled();
        expect(c.isStopped).toBe(true);
        expect(capturedSignal?.aborted).toBe(true);
    });

    it('snapshot() reports counts and lifecycle state', async () => {
        const { connection, getHandler } = fakeConnection();
        const consumer = createConsumer(connection, resolveConsumerOptions({ url: '' }));
        expect(consumer.snapshot().queueName).toBeNull();
        await consumer.start('q-self', [], async () => okResult);
        expect(consumer.snapshot().queueName).toBe('q-self');
        expect(consumer.snapshot().consumedCount).toBe(0);
        await getHandler()?.(fakeAsyncMessage());
        expect(consumer.snapshot().consumedCount).toBe(1);
        expect(consumer.snapshot().lastConsumedAt).not.toBeNull();
    });
});
