import { randomUUID } from 'node:crypto';
import { Aggregator, type Bus, type IAggregatorStore, type Message } from '@serviceconnect/core';
import {
    type FlowDirection,
    type FlowResult,
    type PatternFlow,
    deferred,
    withTimeout,
} from '../lib/flow.js';

interface BatchItem extends Message {
    flowId: string;
}

class FlowAggregator extends Aggregator<BatchItem> {
    public readonly pending = new Map<string, ReturnType<typeof deferred<void>>>();
    batchSize(): number {
        return 3;
    }
    timeout(): number {
        // Flush partial batches well within the per-flow timeout. The aggregator batches by TYPE, so
        // under concurrent flows the trailing 1-2 messages of a run would otherwise wait the full
        // timeout and strand their flows. (The flush timer polls every 250ms.)
        return 1_000;
    }
    async execute(messages: readonly BatchItem[]): Promise<void> {
        // A batch may contain messages from several interleaved flows (one shared aggregator type), so
        // resolve EVERY flow represented in the batch — not just the first message's flow.
        for (const m of messages) {
            if (m.flowId) this.pending.get(m.flowId)?.resolve();
        }
    }
}

export function aggregator(
    alphaAggregatorStore: IAggregatorStore,
    betaAggregatorStore: IAggregatorStore,
): PatternFlow {
    const typeName = `AggBatchItem-${randomUUID().slice(0, 6)}`;
    const alphaAgg = new FlowAggregator();
    const betaAgg = new FlowAggregator();
    let alpha: Bus | undefined;
    let beta: Bus | undefined;

    return {
        name: 'aggregator',
        async register(a: Bus, b: Bus): Promise<void> {
            alpha = a;
            beta = b;
            a.registerAggregator<BatchItem>(typeName, alphaAgg, { store: alphaAggregatorStore });
            b.registerAggregator<BatchItem>(typeName, betaAgg, { store: betaAggregatorStore });
        },
        async drive(direction: FlowDirection, flowTimeoutMs: number): Promise<FlowResult> {
            if (!alpha || !beta) throw new Error('aggregator.drive called before register');
            const flowId = randomUUID();
            const d = deferred<void>();
            const isAtoB = direction === 'alpha-to-beta';
            const targetAgg = isAtoB ? betaAgg : alphaAgg;
            const sender = isAtoB ? alpha : beta;
            targetAgg.pending.set(flowId, d);
            const start = performance.now();
            try {
                for (let i = 0; i < 3; i++) {
                    await sender.publish<BatchItem>(typeName, { correlationId: flowId, flowId });
                }
                await withTimeout(d.promise, flowTimeoutMs, 'aggregator');
                return { ok: true, durationMs: performance.now() - start };
            } catch (err) {
                return {
                    ok: false,
                    durationMs: performance.now() - start,
                    error: err instanceof Error ? err.message : String(err),
                };
            } finally {
                targetAgg.pending.delete(flowId);
            }
        },
    };
}
