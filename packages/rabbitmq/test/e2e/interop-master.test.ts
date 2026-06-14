import { randomUUID } from 'node:crypto';
import { type Message, createBus } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

/**
 * Phase 1 exit criterion: Node <-> C# `master` interop for point-to-point send and request/reply.
 *
 * SKIPPED pending external infrastructure that cannot be provisioned in unit/CI-without-broker runs:
 *   1. A running RabbitMQ broker (set RABBITMQ_URL).
 *   2. A minimal C#-`master` fixture service on the SAME broker that:
 *      - registers `Interop.Messages.Ping` / `Interop.Messages.Pong` (these strings are the .NET
 *        Type.FullName — Node registers under the identical FullName so `TypeName` + the
 *        `FullName.Replace(".","")` exchange match),
 *      - consumes from queue `csharp-in`, and on `Ping` replies with a `Pong` (request/reply) and
 *        also echoes receipt to `node-in` (send direction).
 *
 * When that fixture exists, change `describe.skip` to `describe` and run:
 *   RABBITMQ_URL=amqp://guest:guest@localhost:5672 pnpm --filter @serviceconnect/rabbitmq test:e2e interop-master
 *
 * Until then, Phase 1 is verified by the Node-side unit suites (casing, wire-headers codec, bus
 * outbound encode / inbound decode round-trip, request/reply correlation) — this file is the
 * remaining real cross-runtime proof.
 */

interface Ping extends Message {
    text: string;
}
interface Pong extends Message {
    text: string;
}

describe.skip('Node <-> C# master interop (requires broker + C# fixture)', () => {
    const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';

    it('Node request is answered by a C#-master responder', async () => {
        const node = createBus({
            transport: createRabbitMQTransport({ url }),
            queue: { name: 'node-in' },
        })
            .registerMessage<Ping>('Interop.Messages.Ping')
            .registerMessage<Pong>('Interop.Messages.Pong');
        await node.start();
        try {
            const reply = await node.sendRequest<Ping, Pong>(
                'Interop.Messages.Ping',
                { correlationId: randomUUID(), text: 'hi' },
                { endpoint: 'csharp-in', timeoutMs: 5000 },
            );
            expect(reply.text).toBe('hi-pong');
        } finally {
            await node.stop();
        }
    });

    it('Node send is consumed by a C#-master consumer (type + body bind)', async () => {
        let echoed: string | undefined;
        const node = createBus({
            transport: createRabbitMQTransport({ url }),
            queue: { name: 'node-in' },
        })
            .registerMessage<Ping>('Interop.Messages.Ping')
            .handle<Ping>('Interop.Messages.Ping', async (msg) => {
                echoed = msg.text; // the C# fixture echoes the received Ping back to node-in
            });
        await node.start();
        try {
            await node.send<Ping>(
                'Interop.Messages.Ping',
                { correlationId: randomUUID(), text: 'roundtrip' },
                { endpoint: 'csharp-in' },
            );
            const deadline = Date.now() + 5000;
            while (echoed === undefined && Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, 50));
            }
            expect(echoed).toBe('roundtrip');
        } finally {
            await node.stop();
        }
    });
});
