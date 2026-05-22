import type { ConsumeResult } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
import { decideDispositionAction } from '../../src/retry.js';

const ok: ConsumeResult = { success: true, notHandled: false, terminalFailure: false };
const noHandler: ConsumeResult = { success: true, notHandled: true, terminalFailure: false };
const handlerFailed: ConsumeResult = { success: false, notHandled: false, terminalFailure: false };
const terminal: ConsumeResult = {
  success: false,
  notHandled: false,
  terminalFailure: true,
  error: new Error('terminal'),
};

describe('decideDispositionAction', () => {
  it('success + handled: returns "ack" (audit publish handled elsewhere)', () => {
    const action = decideDispositionAction({
      result: ok,
      retryCount: 0,
      maxRetries: 3,
      errorQueue: 'errors',
      deadLetterUnhandled: false,
    });
    expect(action).toEqual({ kind: 'ack' });
  });

  it('notHandled + deadLetterUnhandled: routes to error queue', () => {
    const action = decideDispositionAction({
      result: noHandler,
      retryCount: 0,
      maxRetries: 3,
      errorQueue: 'errors',
      deadLetterUnhandled: true,
    });
    expect(action).toEqual({
      kind: 'republishToError',
      errorQueue: 'errors',
      reason: 'unhandled',
    });
  });

  it('notHandled + !deadLetterUnhandled: ack silently', () => {
    const action = decideDispositionAction({
      result: noHandler,
      retryCount: 0,
      maxRetries: 3,
      errorQueue: 'errors',
      deadLetterUnhandled: false,
    });
    expect(action).toEqual({ kind: 'ack' });
  });

  it('terminalFailure: routes to error queue without retrying', () => {
    const action = decideDispositionAction({
      result: terminal,
      retryCount: 0,
      maxRetries: 3,
      errorQueue: 'errors',
      deadLetterUnhandled: false,
    });
    expect(action).toEqual({
      kind: 'republishToError',
      errorQueue: 'errors',
      reason: 'terminal',
      error: terminal.error,
    });
  });

  it('handler failed + retries left: routes to retry queue with incremented count', () => {
    const action = decideDispositionAction({
      result: handlerFailed,
      retryCount: 1,
      maxRetries: 3,
      errorQueue: 'errors',
      deadLetterUnhandled: false,
    });
    expect(action).toEqual({
      kind: 'republishToRetry',
      newRetryCount: 2,
    });
  });

  it('handler failed + retries exhausted: routes to error queue', () => {
    const action = decideDispositionAction({
      result: handlerFailed,
      retryCount: 2,
      maxRetries: 3,
      errorQueue: 'errors',
      deadLetterUnhandled: false,
    });
    expect(action).toEqual({
      kind: 'republishToError',
      errorQueue: 'errors',
      reason: 'retriesExhausted',
      finalRetryCount: 3,
    });
  });

  it('terminalFailure with errorQueue=null: ack-and-log', () => {
    const action = decideDispositionAction({
      result: terminal,
      retryCount: 0,
      maxRetries: 3,
      errorQueue: null,
      deadLetterUnhandled: false,
    });
    expect(action).toEqual({
      kind: 'ackAndLog',
      reason: 'terminal',
      error: terminal.error,
    });
  });

  it('retries exhausted with errorQueue=null: ack-and-log', () => {
    const action = decideDispositionAction({
      result: handlerFailed,
      retryCount: 2,
      maxRetries: 3,
      errorQueue: null,
      deadLetterUnhandled: false,
    });
    expect(action).toEqual({
      kind: 'ackAndLog',
      reason: 'retriesExhausted',
      finalRetryCount: 3,
    });
  });
});
