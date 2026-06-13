import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

describe('cancellation', () => {
    it('consumer.stop() aborts the per-message signal seen by in-flight handlers', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const queue = `q-cancel-${randomUUID().slice(0, 8)}`;

        const { producer, consumer } = createRabbitMQTransport({ url });

        let capturedSignal: AbortSignal | undefined;
        const handlerStarted = new Promise<void>((resolve) => {
            consumer
                .start(queue, [], async (_envelope, signal) => {
                    capturedSignal = signal;
                    resolve();
                    // Block until cancellation
                    await new Promise<void>((rrr) => signal.addEventListener('abort', () => rrr()));
                    return { success: true, notHandled: false, terminalFailure: false };
                })
                .catch(() => {});
        });

        await producer.send(queue, 'Foo', new TextEncoder().encode('{}'));
        await handlerStarted;

        expect(capturedSignal).toBeDefined();
        expect(capturedSignal?.aborted).toBe(false);

        await consumer.stop();

        expect(capturedSignal?.aborted).toBe(true);
        await producer[Symbol.asyncDispose]();
    });
});
