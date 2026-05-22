import type { Envelope } from '../envelope.js';
import type { Logger } from '../logger.js';
import type { Message, MessageHeaders } from '../message.js';
import type { ConsumeResult } from '../transport.js';
import type { AggregatorRegistry } from './registry.js';

export interface AggregatorBranchDeps {
  registry: AggregatorRegistry;
  logger: Logger;
}

export interface AggregatorBranchOutcome {
  ran: boolean;
  result?: ConsumeResult;
}

export async function runAggregatorBranch(
  envelope: Envelope,
  message: Message,
  signal: AbortSignal,
  deps: AggregatorBranchDeps,
): Promise<AggregatorBranchOutcome> {
  const headers = envelope.headers as MessageHeaders;
  const messageType = typeof headers.messageType === 'string' ? headers.messageType : '';
  const entry = deps.registry.entryFor(messageType);
  if (!entry) return { ran: false };

  const claim = await entry.store.appendAndClaim(
    messageType,
    message,
    entry.batchSize,
    entry.timeoutMs * 5,
  );
  if (!claim) {
    return {
      ran: true,
      result: { success: true, notHandled: false, terminalFailure: false },
    };
  }

  try {
    await entry.aggregator.execute(claim.messages, signal);
    await entry.store.releaseSnapshot(claim.snapshotId);
    return {
      ran: true,
      result: { success: true, notHandled: false, terminalFailure: false },
    };
  } catch (err) {
    const wrapped = err instanceof Error ? err : new Error(String(err));
    deps.logger.warn('aggregator execute threw; lease will expire and retry', {
      aggregatorType: messageType,
      error: wrapped.message,
    });
    return {
      ran: true,
      result: { success: false, notHandled: false, error: wrapped, terminalFailure: false },
    };
  }
}
