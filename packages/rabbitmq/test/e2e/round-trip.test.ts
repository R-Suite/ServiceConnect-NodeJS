import { randomUUID } from 'node:crypto';
import type { ConsumeResult, Envelope } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

const successResult: ConsumeResult = { success: true, notHandled: false, terminalFailure: false };

describe('round-trip', () => {
    it('publish to a fanout exchange is delivered to a bound consumer', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const queue = `q-rt-${randomUUID().slice(0, 8)}`;
        const type = `T-${randomUUID().slice(0, 8)}`;

        const { producer, consumer } = createRabbitMQTransport({ url });

        const received: Envelope[] = [];
        await consumer.start(queue, [type], async (envelope) => {
            received.push(envelope);
            return successResult;
        });

        await producer.publish(type, new TextEncoder().encode(JSON.stringify({ v: 1 })));

        const start = Date.now();
        while (received.length === 0 && Date.now() - start < 5000) {
            await new Promise((r) => setTimeout(r, 50));
        }

        expect(received).toHaveLength(1);
        const decoded = JSON.parse(new TextDecoder().decode(received[0]?.body));
        expect(decoded).toEqual({ v: 1 });

        await consumer.stop();
        await producer[Symbol.asyncDispose]();
    });

    it('publish/subscribe round-trips a dotted .NET-style type name on the derived exchange', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const queue = `q-rt-${randomUUID().slice(0, 8)}`;
        // A dotted FullName exercises exchangeNameForType on BOTH publish and bind — they must
        // derive the same stripped exchange or delivery fails.
        const type = `My.App.Evt.${randomUUID().slice(0, 6)}`;

        const { producer, consumer } = createRabbitMQTransport({ url });

        const received: Envelope[] = [];
        await consumer.start(queue, [type], async (envelope) => {
            received.push(envelope);
            return successResult;
        });

        await producer.publish(type, new TextEncoder().encode('{}'));

        const start = Date.now();
        while (received.length === 0 && Date.now() - start < 5000) {
            await new Promise((r) => setTimeout(r, 50));
        }

        expect(received).toHaveLength(1);

        await consumer.stop();
        await producer[Symbol.asyncDispose]();
    });

    it('send to a queue endpoint delivers to that specific queue and round-trips caller headers', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const queue = `q-rt-${randomUUID().slice(0, 8)}`;

        const { producer, consumer } = createRabbitMQTransport({ url });

        const received: Envelope[] = [];
        await consumer.start(queue, [], async (envelope) => {
            received.push(envelope);
            return successResult;
        });

        // The transport carries caller-supplied headers verbatim; core owns wire-header encoding
        // (TypeName/MessageType), so a raw transport send here passes the header explicitly.
        await producer.send(queue, 'OrderCreated', new TextEncoder().encode('{}'), {
            headers: { TypeName: 'OrderCreated' },
        });

        const start = Date.now();
        while (received.length === 0 && Date.now() - start < 5000) {
            await new Promise((r) => setTimeout(r, 50));
        }

        expect(received).toHaveLength(1);
        expect(received[0]?.headers.TypeName).toBe('OrderCreated');

        await consumer.stop();
        await producer[Symbol.asyncDispose]();
    });
});
