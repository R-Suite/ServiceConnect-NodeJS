import { randomUUID } from 'node:crypto';
import type { ConsumeResult, Envelope } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

// Regression: retry/error/audit republishes must be persistent (durable:true) so a message parked
// in the durable retry queue or dead-lettered to the durable error queue survives a broker restart.

const MGMT = 'http://localhost:15672';
const MGMT_AUTH = `Basic ${Buffer.from('guest:guest').toString('base64')}`;
const VHOST = '%2F';

interface MgmtMessage {
    properties: {
        delivery_mode?: number;
        content_type?: string;
        headers?: Record<string, unknown>;
    };
}

async function pollMgmt(queue: string, timeoutMs = 8000): Promise<MgmtMessage[]> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const res = await fetch(`${MGMT}/api/queues/${VHOST}/${encodeURIComponent(queue)}/get`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: MGMT_AUTH },
            body: JSON.stringify({ count: 5, ackmode: 'ack_requeue_false', encoding: 'auto' }),
        });
        if (!res.ok) throw new Error(`mgmt get ${queue} -> ${res.status}`);
        const msgs = (await res.json()) as MgmtMessage[];
        if (msgs.length > 0) return msgs;
        await new Promise((r) => setTimeout(r, 150));
    }
    return [];
}

async function waitFor(cond: () => boolean, ms = 5000): Promise<void> {
    const start = Date.now();
    while (!cond() && Date.now() - start < ms) await new Promise((r) => setTimeout(r, 50));
}

describe('republished messages are persistent (durable)', () => {
    it('error-queue republish is delivery_mode=2', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const queue = `reg-term-${randomUUID().slice(0, 8)}`;
        const errorQueue = `reg-errors-${randomUUID().slice(0, 8)}`;
        const { producer, consumer } = createRabbitMQTransport({
            url,
            consumer: { maxRetries: 5, retryDelay: 250, errorQueue },
        });

        const attempts: Envelope[] = [];
        const terminal: ConsumeResult = {
            success: false,
            notHandled: false,
            terminalFailure: true,
            error: new Error('x'),
        };
        await consumer.start(queue, [], async (e) => {
            attempts.push(e);
            return terminal;
        });
        await producer.send(queue, 'Foo', new TextEncoder().encode('{}'));
        await waitFor(() => attempts.length > 0);
        await consumer.stop();

        const msgs = await pollMgmt(errorQueue);
        expect(msgs).toHaveLength(1);
        expect(msgs[0]?.properties.delivery_mode).toBe(2);
        await producer[Symbol.asyncDispose]();
    });

    it('retry-queue republish is delivery_mode=2', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const queue = `reg-retry-${randomUUID().slice(0, 8)}`;
        const { producer, consumer } = createRabbitMQTransport({
            url,
            consumer: {
                maxRetries: 5,
                retryDelay: 60_000,
                errorQueue: `reg-rerr-${randomUUID().slice(0, 8)}`,
            },
        });

        const attempts: Envelope[] = [];
        const fail: ConsumeResult = {
            success: false,
            notHandled: false,
            terminalFailure: false,
            error: new Error('boom'),
        };
        await consumer.start(queue, [], async (e) => {
            attempts.push(e);
            return fail;
        });
        await producer.send(queue, 'Foo', new TextEncoder().encode('{}'));
        await waitFor(() => attempts.length > 0);
        await consumer.stop();

        const msgs = await pollMgmt(`${queue}.Retries`);
        expect(msgs).toHaveLength(1);
        expect(msgs[0]?.properties.delivery_mode).toBe(2);
        await producer[Symbol.asyncDispose]();
    });
});
