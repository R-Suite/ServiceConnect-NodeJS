import { randomUUID } from 'node:crypto';
import type { Bus, Message } from '@serviceconnect/core';
import {
  type FlowDirection,
  type FlowResult,
  type PatternFlow,
  deferred,
  withTimeout,
} from '../lib/flow.js';

interface DomainEvent extends Message {
  flowId: string;
}
interface DerivedEvent extends DomainEvent {
  extra: string;
}

export function polymorphic(): PatternFlow {
  const baseType = `PolyDomainEvent-${randomUUID().slice(0, 6)}`;
  const derivedType = `PolyDerivedEvent-${randomUUID().slice(0, 6)}`;
  const pendingAlpha = new Map<string, ReturnType<typeof deferred<void>>>();
  const pendingBeta = new Map<string, ReturnType<typeof deferred<void>>>();
  let alpha: Bus | undefined;
  let beta: Bus | undefined;

  return {
    name: 'polymorphic',
    async register(a: Bus, b: Bus): Promise<void> {
      alpha = a;
      beta = b;
      a.messageRegistry.register(baseType);
      a.messageRegistry.register(derivedType, { parents: [baseType] });
      b.messageRegistry.register(baseType);
      b.messageRegistry.register(derivedType, { parents: [baseType] });
      a.handle<DomainEvent>(baseType, async (msg) => {
        pendingAlpha.get(msg.flowId)?.resolve();
      });
      b.handle<DomainEvent>(baseType, async (msg) => {
        pendingBeta.get(msg.flowId)?.resolve();
      });
    },
    async drive(direction: FlowDirection, flowTimeoutMs: number): Promise<FlowResult> {
      if (!alpha || !beta) throw new Error('polymorphic.drive called before register');
      const flowId = randomUUID();
      const d = deferred<void>();
      const target = direction === 'alpha-to-beta' ? pendingBeta : pendingAlpha;
      target.set(flowId, d);
      const sender = direction === 'alpha-to-beta' ? alpha : beta;
      const start = performance.now();
      try {
        await sender.publish<DerivedEvent>(derivedType, {
          correlationId: flowId,
          flowId,
          extra: 'derived',
        });
        await withTimeout(d.promise, flowTimeoutMs, 'polymorphic');
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
