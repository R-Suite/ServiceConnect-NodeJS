import { randomUUID } from 'node:crypto';
import type { ConsumeResult, Envelope } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

describe('terminal failure', () => {
    it('routes directly to the error queue without retry attempts', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const queue = `q-term-${randomUUID().slice(0, 8)}`;
        const errorQueue = `errors-${randomUUID().slice(0, 8)}`;

        const { producer, consumer } = createRabbitMQTransport({
            url,
            consumer: { maxRetries: 5, retryDelay: 250, errorQueue },
        });

        const attempts: Envelope[] = [];
        const terminalResult: ConsumeResult = {
            success: false,
            notHandled: false,
            terminalFailure: true,
            error: new Error('unparseable'),
        };
        await consumer.start(queue, [], async (envelope) => {
            attempts.push(envelope);
            return terminalResult;
        });

        await producer.send(queue, 'Foo', new TextEncoder().encode('{}'));

        const start = Date.now();
        while (attempts.length === 0 && Date.now() - start < 5000) {
            await new Promise((r) => setTimeout(r, 50));
        }
        // Wait a little longer to confirm no second attempt happens.
        await new Promise((r) => setTimeout(r, 1000));
        expect(attempts).toHaveLength(1);

        const { consumer: errConsumer } = createRabbitMQTransport({ url });
        const errMessages: Envelope[] = [];
        await errConsumer.start(errorQueue, [], async (envelope) => {
            errMessages.push(envelope);
            return { success: true, notHandled: false, terminalFailure: false };
        });

        const errStart = Date.now();
        while (errMessages.length === 0 && Date.now() - errStart < 5000) {
            await new Promise((r) => setTimeout(r, 50));
        }
        expect(errMessages).toHaveLength(1);
        expect(errMessages[0]?.headers.TerminalFailure).toBe('true');
        expect(errMessages[0]?.headers.Exception).toContain('unparseable');

        await consumer.stop();
        await errConsumer.stop();
        await producer[Symbol.asyncDispose]();
    });
});
