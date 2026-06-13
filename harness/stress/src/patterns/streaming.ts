import { randomUUID } from 'node:crypto';
import type { Bus, Message } from '@serviceconnect/core';
import {
    type FlowDirection,
    type FlowResult,
    type PatternFlow,
    deferred,
    withTimeout,
} from '../lib/flow.js';

interface Chunk extends Message {
    flowId: string;
    index: number;
}

const CHUNKS = 100;

export function streaming(alphaQueue: string, betaQueue: string): PatternFlow {
    const typeName = `StreamChunk-${randomUUID().slice(0, 6)}`;
    const pendingAlpha = new Map<string, ReturnType<typeof deferred<void>>>();
    const pendingBeta = new Map<string, ReturnType<typeof deferred<void>>>();
    let alpha: Bus | undefined;
    let beta: Bus | undefined;

    return {
        name: 'streaming',
        async register(a: Bus, b: Bus): Promise<void> {
            alpha = a;
            beta = b;
            const makeHandler =
                (pending: Map<string, ReturnType<typeof deferred<void>>>) =>
                async (stream: AsyncIterable<Chunk>) => {
                    let count = 0;
                    let lastFlowId = '';
                    for await (const chunk of stream) {
                        count++;
                        lastFlowId = chunk.flowId;
                    }
                    if (count === CHUNKS && lastFlowId) {
                        pending.get(lastFlowId)?.resolve();
                    }
                };
            a.registerMessage<Chunk>(typeName).handleStream<Chunk>(
                typeName,
                makeHandler(pendingAlpha),
            );
            b.registerMessage<Chunk>(typeName).handleStream<Chunk>(
                typeName,
                makeHandler(pendingBeta),
            );
        },
        async drive(direction: FlowDirection, flowTimeoutMs: number): Promise<FlowResult> {
            if (!alpha || !beta) throw new Error('streaming.drive called before register');
            const flowId = randomUUID();
            const d = deferred<void>();
            const isAtoB = direction === 'alpha-to-beta';
            const target = isAtoB ? pendingBeta : pendingAlpha;
            target.set(flowId, d);
            const sender = isAtoB ? alpha : beta;
            const endpoint = isAtoB ? betaQueue : alphaQueue;
            const start = performance.now();
            try {
                const s = await sender.openStream<Chunk>(endpoint, typeName);
                for (let i = 0; i < CHUNKS; i++) {
                    await s.sendChunk({ correlationId: flowId, flowId, index: i });
                }
                await s.complete();
                await withTimeout(d.promise, flowTimeoutMs, 'streaming');
                return { ok: true, durationMs: performance.now() - start };
            } catch (err) {
                return {
                    ok: false,
                    durationMs: performance.now() - start,
                    error: err instanceof Error ? err.message : String(err),
                };
            } finally {
                target.delete(flowId);
            }
        },
    };
}
