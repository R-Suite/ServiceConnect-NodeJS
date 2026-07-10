import { randomUUID } from 'node:crypto';
import type { Bus, Message } from '@serviceconnect/core';
import {
    type FlowDirection,
    type FlowResult,
    type PatternFlow,
    deferred,
    withTimeout,
} from '../lib/flow.js';

interface SlipStep extends Message {
    flowId: string;
}

export function routingSlip(alphaQueue: string, betaQueue: string): PatternFlow {
    const typeName = `SlipStep-${randomUUID().slice(0, 6)}`;
    const pendingAlpha = new Map<string, ReturnType<typeof deferred<void>>>();
    const pendingBeta = new Map<string, ReturnType<typeof deferred<void>>>();
    let alpha: Bus | undefined;
    let beta: Bus | undefined;

    return {
        name: 'routing-slip',
        async register(a: Bus, b: Bus): Promise<void> {
            alpha = a;
            beta = b;
            a.registerMessage<SlipStep>(typeName).handle<SlipStep>(typeName, async (msg) => {
                pendingAlpha.get(msg.flowId)?.resolve();
            });
            b.registerMessage<SlipStep>(typeName).handle<SlipStep>(typeName, async (msg) => {
                pendingBeta.get(msg.flowId)?.resolve();
            });
        },
        async drive(direction: FlowDirection, flowTimeoutMs: number): Promise<FlowResult> {
            if (!alpha || !beta) throw new Error('routing-slip.drive called before register');
            const flowId = randomUUID();
            const d = deferred<void>();
            const isAtoB = direction === 'alpha-to-beta';
            const target = isAtoB ? pendingBeta : pendingAlpha;
            target.set(flowId, d);
            const starter = isAtoB ? alpha : beta;
            const destinations = isAtoB ? [betaQueue, betaQueue] : [alphaQueue, alphaQueue];
            const start = performance.now();
            try {
                await starter.route<SlipStep>(
                    typeName,
                    { correlationId: flowId, flowId },
                    destinations,
                );
                await withTimeout(d.promise, flowTimeoutMs, 'routing-slip');
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
