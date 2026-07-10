import { randomUUID } from 'node:crypto';
import type { ConsumeResult, Envelope } from '@serviceconnect/core';
import { Connection } from 'rabbitmq-client';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

// Regression: when the broker cancels the consumer (e.g. the queue is deleted), the consumer must
// report unhealthy — isConnected=false and isCancelledByBroker=true — instead of falsely healthy.
// The queue is deleted over AMQP (no management API / fixed ports), so this runs on any broker.

const success: ConsumeResult = { success: true, notHandled: false, terminalFailure: false };

function waitFor(cond: () => boolean, ms = 8000): Promise<void> {
    return new Promise((resolve) => {
        const start = Date.now();
        const t = setInterval(() => {
            if (cond() || Date.now() - start > ms) {
                clearInterval(t);
                resolve();
            }
        }, 100);
    });
}

describe('consumer reflects broker cancellation in its health', () => {
    it('reports unhealthy after the queue is deleted out from under it', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const queue = `q-cancel-${randomUUID().slice(0, 8)}`;
        const { producer, consumer } = createRabbitMQTransport({ url });

        const received: Envelope[] = [];
        await consumer.start(queue, [], async (e) => {
            received.push(e);
            return success;
        });

        await producer.send(queue, 'Ping', new TextEncoder().encode(JSON.stringify({ n: 1 })));
        await waitFor(() => received.length >= 1);
        expect(received).toHaveLength(1);
        expect(consumer.isConnected).toBe(true);

        // Delete the queue out from under the consumer over AMQP -> broker sends basic.cancel.
        const admin = new Connection(url);
        await admin.queueDelete({ queue });
        await admin.close();

        // The consumer must transition to unhealthy (basic.cancel -> 'error', no recovery because
        // the passive re-declare keeps failing on the now-missing queue).
        await waitFor(() => !consumer.isConnected);
        expect(consumer.isConnected).toBe(false);
        expect(consumer.isCancelledByBroker).toBe(true);
        expect(consumer.snapshot().isConnected).toBe(false);

        await consumer.stop();
        await producer[Symbol.asyncDispose]();
    }, 30_000);
});
