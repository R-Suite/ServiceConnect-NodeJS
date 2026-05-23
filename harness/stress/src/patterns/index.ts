import type { PatternFlow } from '../lib/flow.js';
import { pubsub } from './pubsub.js';
import { requestReply } from './request-reply.js';
import { send } from './send.js';

export function corePatterns(alphaQueue: string, betaQueue: string): readonly PatternFlow[] {
  return [pubsub(), send(alphaQueue, betaQueue), requestReply(alphaQueue, betaQueue)];
}
