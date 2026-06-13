import { randomUUID } from 'node:crypto';
import type { ConsumeResult } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

// Regression: consumer concurrency:1 must process messages strictly one-at-a-time and in order,
// even when handlers are slow. This is what lets ordering-sensitive workloads (e.g. a saga start
// followed immediately by an event) be processed in publish order rather than racing.

const ok: ConsumeResult = { success: true, notHandled: false, terminalFailure: false };

describe('consumer concurrency:1 serializes message processing', () => {
    it('processes messages one-at-a-time, in order, despite slow handlers', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const queue = `q-conc-${randomUUID().slice(0, 8)}`;
        const { producer, consumer } = createRabbitMQTransport({
            url,
            consumer: { concurrency: 1, prefetch: 10 },
        });

        let inFlight = 0;
        let maxInFlight = 0;
        const order: number[] = [];
        const N = 6;

        await consumer.start(queue, [], async (envelope) => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            order.push(Number(envelope.headers.seq));
            await new Promise((r) => setTimeout(r, 30)); // slow handler — would overlap if concurrent
            inFlight -= 1;
            return ok;
        });

        for (let i = 0; i < N; i++) {
            await producer.send(queue, 'Seq', new TextEncoder().encode('{}'), {
                headers: { seq: String(i) },
            });
        }

        const deadline = Date.now() + 10_000;
        while (order.length < N && Date.now() < deadline)
            await new Promise((r) => setTimeout(r, 25));

        expect(order).toEqual([0, 1, 2, 3, 4, 5]); // strict publish order
        expect(maxInFlight).toBe(1); // never more than one handler running at once

        await consumer.stop();
        await producer[Symbol.asyncDispose]();
    }, 30_000);
});
