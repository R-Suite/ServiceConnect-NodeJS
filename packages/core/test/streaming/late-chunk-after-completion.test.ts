import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Envelope } from '../../src/envelope.js';
import { consoleLogger } from '../../src/logger.js';
import type { Message } from '../../src/message.js';
import { jsonSerializer } from '../../src/serialization/json.js';
import { createMessageTypeRegistry } from '../../src/serialization/registry.js';
import { StreamRegistry, runStreamBranch } from '../../src/streaming/dispatch.js';
import { StreamHeaders } from '../../src/streaming/stream-headers.js';

// Regression for streaming/dispatch.ts: a late/duplicate chunk arriving AFTER a stream has
// completed (at-least-once redelivery) must be dropped — not used to spawn a phantom receiver
// that re-invokes the handler and hangs forever on a sequence that can never arrive.

interface Chunk extends Message {
    v: number;
}
const MESSAGE_TYPE = 'Chunk';

function chunkEnvelope(
    streamId: string,
    seq: number,
    v: number | undefined,
    flags: { isStart?: boolean; isEnd?: boolean } = {},
): Envelope {
    return {
        headers: {
            messageType: MESSAGE_TYPE,
            correlationId: 'c',
            [StreamHeaders.StreamId]: streamId,
            [StreamHeaders.SequenceNumber]: String(seq),
            [StreamHeaders.IsStartOfStream]: flags.isStart ? 'true' : 'false',
            [StreamHeaders.IsEndOfStream]: flags.isEnd ? 'true' : 'false',
        },
        body:
            v === undefined
                ? new Uint8Array()
                : new TextEncoder().encode(JSON.stringify({ correlationId: 'c', v })),
    };
}

function settledWithin<T>(p: Promise<T>, ms: number): Promise<boolean> {
    return Promise.race([
        p.then(
            () => true,
            () => true,
        ),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
    ]);
}

describe('streaming: late/duplicate chunk after completion is dropped', () => {
    it('does not re-invoke the handler and drain still settles', async () => {
        const registry = createMessageTypeRegistry();
        registry.register<Chunk>(MESSAGE_TYPE);
        const deps = {
            registry: new StreamRegistry(),
            serializer: jsonSerializer(registry),
            logger: consoleLogger('error'),
        };

        const invocations: { collected: number[]; finished: boolean }[] = [];
        deps.registry.registerHandler<Chunk>(MESSAGE_TYPE, async (stream) => {
            const inv = { collected: [] as number[], finished: false };
            invocations.push(inv);
            for await (const chunk of stream) inv.collected.push(chunk.v);
            inv.finished = true;
        });

        const streamId = `s-${randomUUID()}`;

        // Drive a complete stream: chunks 0,1 then end.
        await runStreamBranch(chunkEnvelope(streamId, 0, 10, { isStart: true }), deps);
        await runStreamBranch(chunkEnvelope(streamId, 1, 20), deps);
        await runStreamBranch(chunkEnvelope(streamId, 2, undefined, { isEnd: true }), deps);
        expect(await settledWithin(deps.registry.drain(), 500)).toBe(true);
        expect(invocations).toHaveLength(1);
        expect(invocations[0]?.collected).toEqual([10, 20]);
        expect(invocations[0]?.finished).toBe(true);

        // A duplicate/late chunk for the SAME (completed) stream arrives.
        const dup = await runStreamBranch(chunkEnvelope(streamId, 1, 20), deps);

        // It is acked (success) and dropped: NO phantom handler invocation...
        expect(dup.result?.success).toBe(true);
        expect(invocations).toHaveLength(1);
        // ...and drain still settles promptly (no hung handler promise).
        expect(await settledWithin(deps.registry.drain(), 500)).toBe(true);
    });
});
