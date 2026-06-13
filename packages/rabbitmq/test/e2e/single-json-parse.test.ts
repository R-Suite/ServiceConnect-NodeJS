import { randomUUID } from 'node:crypto';
import { type Logger, createBus } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

// Regression for envelope.ts triple-JSON round-trip: one publish->consume->handle of a JSON message
// must cost exactly ONE JSON.parse (the destination deserialize) and ONE JSON.stringify (the send
// serialize). rabbitmq-client must no longer auto-parse the body and toEnvelope must no longer
// re-encode it.

const silentLogger: Logger = {
    trace: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    fatal: () => undefined,
    child: () => silentLogger,
};

describe('a JSON message is parsed/stringified exactly once per direction', () => {
    it('one round-trip costs 1 parse + 1 stringify', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const type = `RB-${randomUUID().slice(0, 8)}`;
        interface Evt {
            correlationId: string;
            nested: { a: number };
        }

        let received: Evt | undefined;
        const bus = createBus({
            transport: createRabbitMQTransport({ url }),
            queue: { name: `q-1p-${randomUUID().slice(0, 8)}` },
            logger: silentLogger,
        })
            .registerMessage<Evt>(type)
            .handle<Evt>(type, async (msg) => {
                received = msg;
            });
        await bus.start();

        const originalParse = JSON.parse;
        const originalStringify = JSON.stringify;
        let parseCount = 0;
        let stringifyCount = 0;
        let counting = false;
        JSON.parse = function patched(this: unknown, ...args: Parameters<typeof JSON.parse>) {
            if (counting) parseCount += 1;
            return originalParse.apply(this, args as never);
        } as typeof JSON.parse;
        JSON.stringify = function patched(
            this: unknown,
            ...args: Parameters<typeof JSON.stringify>
        ) {
            if (counting) stringifyCount += 1;
            return originalStringify.apply(this, args as never);
        } as typeof JSON.stringify;

        try {
            counting = true;
            await bus.publish<Evt>(type, { correlationId: randomUUID(), nested: { a: 1 } });
            const deadline = Date.now() + 8000;
            while (!received && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
            counting = false;
        } finally {
            JSON.parse = originalParse;
            JSON.stringify = originalStringify;
        }

        expect(received?.nested).toEqual({ a: 1 });
        // eslint-disable-next-line no-console
        console.log(`[single-json] parse=${parseCount} stringify=${stringifyCount}`);
        expect(parseCount).toBe(1);
        expect(stringifyCount).toBe(1);

        await bus.stop();
    });
});
