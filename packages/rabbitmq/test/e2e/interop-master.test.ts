import { randomUUID } from 'node:crypto';
import { type Message, createBus } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

/**
 * Real Node <-> C# `master` interop proof (Phase 1 + Phase 2a).
 *
 * Gated on INTEROP=1, because it requires a running C# `master` fixture service on the same broker
 * (see interop/csharp-fixture + interop/run.sh, which start the broker, build+run the fixture, set
 * RABBITMQ_URL + INTEROP=1, then invoke this suite). Without that orchestration the suite is skipped.
 *
 * The fixture consumes from queue `csharp-in`, registers `Interop.Messages.Ping`, and replies to
 * every Ping with a `Pong { Text = ping.Text + "-pong" }`. That one handler proves both transports:
 *   - point-to-point: a Node sendRequest delivered to `csharp-in`;
 *   - pub/sub: a Node publishRequest fanned out via the `Interop.Messages.Ping` exchange the fixture's
 *     queue is bound to (exercises the FullName-stripped exchange name on both runtimes).
 * Each round-trip validates type identity (TypeName=FullName), PascalCase body (de)serialization,
 * and request/reply correlation (RequestMessageId/ResponseMessageId + SourceAddress) end to end.
 */

interface Ping extends Message {
    text: string;
}
interface Pong extends Message {
    text: string;
}

const run = process.env.INTEROP === '1' ? describe : describe.skip;

run('Node <-> C# master interop', () => {
    const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';

    it('point-to-point: Node sendRequest to the C# responder gets a Pong reply', async () => {
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
                { endpoint: 'csharp-in', timeoutMs: 8000 },
            );
            expect(reply.text).toBe('hi-pong');
        } finally {
            await node.stop();
        }
    });

    it('pub/sub: Node publishRequest reaches the C# subscriber on the derived exchange', async () => {
        const node = createBus({
            transport: createRabbitMQTransport({ url }),
            queue: { name: 'node-in' },
        })
            .registerMessage<Ping>('Interop.Messages.Ping')
            .registerMessage<Pong>('Interop.Messages.Pong');
        await node.start();
        try {
            let got: string | undefined;
            await node.publishRequest<Ping, Pong>(
                'Interop.Messages.Ping',
                { correlationId: randomUUID(), text: 'pub' },
                (reply) => {
                    got = reply.text;
                },
                { expectedReplyCount: 1, timeoutMs: 8000 },
            );
            expect(got).toBe('pub-pong');
        } finally {
            await node.stop();
        }
    });
});
