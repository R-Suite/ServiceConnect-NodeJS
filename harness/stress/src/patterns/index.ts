import type { IAggregatorStore, ISagaStore, ITimeoutStore } from '@serviceconnect/core';
import type { PatternFlow } from '../lib/flow.js';
import { aggregator } from './aggregator.js';
import { polymorphic } from './polymorphic.js';
import { pubsub } from './pubsub.js';
import { requestReply } from './request-reply.js';
import { routingSlip } from './routing-slip.js';
import { saga } from './saga.js';
import { send } from './send.js';
import { streaming } from './streaming.js';

export interface PatternsContext {
  readonly alphaQueue: string;
  readonly betaQueue: string;
  readonly alphaSagaStore: ISagaStore;
  readonly betaSagaStore: ISagaStore;
  readonly alphaTimeoutStore: ITimeoutStore;
  readonly betaTimeoutStore: ITimeoutStore;
  readonly alphaAggregatorStore: IAggregatorStore;
  readonly betaAggregatorStore: IAggregatorStore;
}

export function corePatterns(ctx: PatternsContext): readonly PatternFlow[] {
  return [
    pubsub(),
    send(ctx.alphaQueue, ctx.betaQueue),
    requestReply(ctx.alphaQueue, ctx.betaQueue),
    polymorphic(),
    saga(ctx.alphaSagaStore, ctx.alphaTimeoutStore, ctx.betaSagaStore, ctx.betaTimeoutStore),
    aggregator(ctx.alphaAggregatorStore, ctx.betaAggregatorStore),
    routingSlip(ctx.alphaQueue, ctx.betaQueue),
    streaming(ctx.alphaQueue, ctx.betaQueue),
  ];
}
