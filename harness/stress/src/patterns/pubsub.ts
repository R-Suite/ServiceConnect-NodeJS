import { randomUUID } from 'node:crypto';
import type { Bus, Message } from '@serviceconnect/core';
import {
  type FlowDirection,
  type FlowResult,
  type PatternFlow,
  deferred,
  withTimeout,
} from '../lib/flow.js';

interface WorkItem extends Message {
  flowId: string;
}

export function pubsub(): PatternFlow {
  const typeName = `PubsubWorkItem-${randomUUID().slice(0, 6)}`;
  const pendingAlpha = new Map<string, ReturnType<typeof deferred<void>>>();
  const pendingBeta = new Map<string, ReturnType<typeof deferred<void>>>();
  let alpha: Bus | undefined;
  let beta: Bus | undefined;

  return {
    name: 'pubsub',
    async register(a: Bus, b: Bus): Promise<void> {
      alpha = a;
      beta = b;
      a.registerMessage<WorkItem>(typeName).handle<WorkItem>(typeName, async (msg) => {
        pendingAlpha.get(msg.flowId)?.resolve();
      });
      b.registerMessage<WorkItem>(typeName).handle<WorkItem>(typeName, async (msg) => {
        pendingBeta.get(msg.flowId)?.resolve();
      });
    },
    async drive(direction: FlowDirection, flowTimeoutMs: number): Promise<FlowResult> {
      if (!alpha || !beta) throw new Error('pubsub.drive called before register');
      const flowId = randomUUID();
      const d = deferred<void>();
      const target = direction === 'alpha-to-beta' ? pendingBeta : pendingAlpha;
      target.set(flowId, d);
      const sender = direction === 'alpha-to-beta' ? alpha : beta;
      const start = performance.now();
      try {
        await sender.publish<WorkItem>(typeName, { correlationId: flowId, flowId });
        await withTimeout(d.promise, flowTimeoutMs, 'pubsub');
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
