import { randomUUID } from 'node:crypto';
import type { ConsumeResult, Envelope } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

describe('retry path', () => {
    it('handler failure routes through retry queue until maxRetries, then to error queue', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const queue = `q-retry-${randomUUID().slice(0, 8)}`;
        const errorQueue = `errors-${randomUUID().slice(0, 8)}`;

        const { producer, consumer } = createRabbitMQTransport({
            url,
            consumer: { maxRetries: 2, retryDelay: 250, errorQueue },
        });

        const attempts: Envelope[] = [];
        const failResult: ConsumeResult = {
            success: false,
            notHandled: false,
            terminalFailure: false,
            error: new Error('boom'),
        };
        await consumer.start(queue, [], async (envelope) => {
            attempts.push(envelope);
            return failResult;
        });

        await producer.send(queue, 'Foo', new TextEncoder().encode('{}'));

        const start = Date.now();
        while (attempts.length < 2 && Date.now() - start < 10_000) {
            await new Promise((r) => setTimeout(r, 100));
        }
        expect(attempts).toHaveLength(2);

        // After max retries, the message should land on errorQueue. Open a second
        // consumer to drain the error queue.
        const { consumer: errConsumer } = createRabbitMQTransport({ url });
        const errMessages: Envelope[] = [];
        await errConsumer.start(errorQueue, [], async (envelope) => {
            errMessages.push(envelope);
            return { success: true, notHandled: false, terminalFailure: false };
        });

        const errStart = Date.now();
        while (errMessages.length === 0 && Date.now() - errStart < 5000) {
            await new Promise((r) => setTimeout(r, 100));
        }
        expect(errMessages).toHaveLength(1);
        expect(errMessages[0]?.headers.Exception).toContain('boom');

        await consumer.stop();
        await errConsumer.stop();
        await producer[Symbol.asyncDispose]();
    });
});
