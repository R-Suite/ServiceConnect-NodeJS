import { randomUUID } from 'node:crypto';
import type { Bus, Message } from '@serviceconnect/core';
import type { FlowDirection, FlowResult, PatternFlow } from '../lib/flow.js';

interface Req extends Message {
  flowId: string;
}
interface Rep extends Message {
  flowId: string;
}

export function requestReply(alphaQueue: string, betaQueue: string): PatternFlow {
  const reqType = `RRReq-${randomUUID().slice(0, 6)}`;
  const repType = `RRRep-${randomUUID().slice(0, 6)}`;
  let alpha: Bus | undefined;
  let beta: Bus | undefined;

  return {
    name: 'request-reply',
    async register(a: Bus, b: Bus): Promise<void> {
      alpha = a;
      beta = b;
      a.registerMessage<Req>(reqType)
        .registerMessage<Rep>(repType)
        .handle<Req>(reqType, async (msg, ctx) => {
          await ctx.reply<Rep>(repType, { correlationId: msg.correlationId, flowId: msg.flowId });
        });
      b.registerMessage<Req>(reqType)
        .registerMessage<Rep>(repType)
        .handle<Req>(reqType, async (msg, ctx) => {
          await ctx.reply<Rep>(repType, { correlationId: msg.correlationId, flowId: msg.flowId });
        });
    },
    async drive(direction: FlowDirection, flowTimeoutMs: number): Promise<FlowResult> {
      if (!alpha || !beta) throw new Error('request-reply.drive called before register');
      const flowId = randomUUID();
      const isAtoB = direction === 'alpha-to-beta';
      const requester = isAtoB ? alpha : beta;
      const endpoint = isAtoB ? betaQueue : alphaQueue;
      const start = performance.now();
      try {
        const reply = await requester.sendRequest<Req, Rep>(
          reqType,
          { correlationId: flowId, flowId },
          { endpoint, timeoutMs: flowTimeoutMs },
        );
        if (reply.flowId !== flowId) {
          return {
            ok: false,
            durationMs: performance.now() - start,
            error: `flowId mismatch (got ${reply.flowId}, expected ${flowId})`,
          };
        }
        return { ok: true, durationMs: performance.now() - start };
      } catch (err) {
        return {
          ok: false,
          durationMs: performance.now() - start,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
