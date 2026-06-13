import type { ConsumeResult } from '@serviceconnect/core';

export type DispositionAction =
    | { kind: 'ack' }
    | { kind: 'republishToRetry'; newRetryCount: number }
    | {
          kind: 'republishToError';
          errorQueue: string;
          reason: 'terminal' | 'retriesExhausted' | 'unhandled';
          error?: Error;
          finalRetryCount?: number;
      }
    | {
          kind: 'ackAndLog';
          reason: 'terminal' | 'retriesExhausted';
          error?: Error;
          finalRetryCount?: number;
      };

export interface DecideDispositionInput {
    result: ConsumeResult;
    retryCount: number;
    maxRetries: number;
    errorQueue: string | null;
    deadLetterUnhandled: boolean;
}

export function decideDispositionAction(input: DecideDispositionInput): DispositionAction {
    const { result, retryCount, maxRetries, errorQueue, deadLetterUnhandled } = input;

    if (result.notHandled) {
        if (deadLetterUnhandled && errorQueue !== null) {
            return { kind: 'republishToError', errorQueue, reason: 'unhandled' };
        }
        return { kind: 'ack' };
    }

    if (result.success) {
        return { kind: 'ack' };
    }

    if (result.terminalFailure) {
        if (errorQueue === null) {
            return { kind: 'ackAndLog', reason: 'terminal', error: result.error };
        }
        return { kind: 'republishToError', errorQueue, reason: 'terminal', error: result.error };
    }

    const nextRetryCount = retryCount + 1;
    if (nextRetryCount < maxRetries) {
        return { kind: 'republishToRetry', newRetryCount: nextRetryCount };
    }

    if (errorQueue === null) {
        return {
            kind: 'ackAndLog',
            reason: 'retriesExhausted',
            finalRetryCount: nextRetryCount,
            error: result.error,
        };
    }
    return {
        kind: 'republishToError',
        errorQueue,
        reason: 'retriesExhausted',
        finalRetryCount: nextRetryCount,
        error: result.error,
    };
}
