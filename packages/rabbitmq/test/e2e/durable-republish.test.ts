import { randomUUID } from 'node:crypto';
import type { ConsumeResult, Envelope } from '@serviceconnect/core';
import { Connection } from 'rabbitmq-client';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

// Regression: retry/error/audit republishes must be persistent (durable:true) so a message parked
// in the durable retry queue or dead-lettered to the durable error queue survives a broker restart.
// We read the republished message back over AMQP and assert its `durable` flag (set from
// deliveryMode===2), so the test needs only the broker — no management API / fixed ports.

function waitFor(cond: () => boolean, ms = 8000): Promise<void> {
    return new Promise((resolve) => {
        const start = Date.now();
        const t = setInterval(() => {
            if (cond() || Date.now() - start > ms) {
                clearInterval(t);
                resolve();
            }
        }, 50);
    });
}

// Read one message off `queue` over AMQP (one-shot basicGet, no consumer) and report whether it is
// persistent. Polls briefly since the republish may land just after the handler returns.
async function readDurable(url: string, queue: string): Promise<boolean | undefined> {
    const conn = new Connection(url);
    try {
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
            const msg = await conn.basicGet({ queue, noAck: true });
            if (msg) return msg.durable;
            await new Promise((r) => setTimeout(r, 100));
        }
        return undefined;
    } finally {
        await conn.close();
    }
}

describe('republished messages are persistent (durable)', () => {
    it('error-queue republish is persistent', async () => {
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
        await consumer.stop(); // stop so it doesn't race us draining the error queue

        expect(await readDurable(url, errorQueue)).toBe(true);
        await producer[Symbol.asyncDispose]();
    }, 30_000);

    it('retry-queue republish is persistent', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const queue = `reg-retry-${randomUUID().slice(0, 8)}`;
        // Long retryDelay so the message dwells in the durable retry queue while we read it.
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

        expect(await readDurable(url, `${queue}.Retries`)).toBe(true);
        await producer[Symbol.asyncDispose]();
    }, 30_000);
});
