import { randomUUID } from 'node:crypto';
import type { ConsumeResult, Envelope } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

// Regression: when the broker cancels the consumer (e.g. the queue is deleted), the consumer must
// report unhealthy — isConnected=false and isCancelledByBroker=true — instead of falsely healthy.

const success: ConsumeResult = { success: true, notHandled: false, terminalFailure: false };
const auth = `Basic ${Buffer.from('guest:guest').toString('base64')}`;

async function deleteQueue(queue: string): Promise<void> {
    await fetch(`http://localhost:15672/api/queues/%2F/${encodeURIComponent(queue)}`, {
        method: 'DELETE',
        headers: { Authorization: auth },
    });
}

async function waitFor(cond: () => boolean, ms = 8000): Promise<void> {
    const start = Date.now();
    while (!cond() && Date.now() - start < ms) await new Promise((r) => setTimeout(r, 100));
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

        await deleteQueue(queue);

        // The broker sends basic.cancel; the consumer must transition to unhealthy.
        await waitFor(() => !consumer.isConnected);
        expect(consumer.isConnected).toBe(false);
        expect(consumer.isCancelledByBroker).toBe(true);
        expect(consumer.snapshot().isConnected).toBe(false);

        await consumer.stop();
        await producer[Symbol.asyncDispose]();
    }, 30_000);
});
