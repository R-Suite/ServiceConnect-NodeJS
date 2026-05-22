import { describe, expect, it, vi } from 'vitest';
import type { Envelope } from '../src/envelope.js';
import { AbortError, RequestTimeoutError } from '../src/errors.js';
import type { Message } from '../src/message.js';
import { RequestReplyManager } from '../src/request-reply.js';

interface Reply extends Message {
  v: number;
}

function envWithResponseId(responseMessageId: string): Envelope {
  return {
    headers: { responseMessageId, messageType: 'Reply' },
    body: new Uint8Array(),
  };
}

describe('RequestReplyManager', () => {
  it('registerSingle resolves on matching reply', async () => {
    const mgr = new RequestReplyManager();
    const { requestMessageId, promise } = mgr.registerSingle<Reply>({ timeoutMs: 5000 });
    const env = envWithResponseId(requestMessageId);
    const matched = mgr.tryRouteReply(env, { correlationId: 'c', v: 42 } as Reply);
    expect(matched).toBe(true);
    await expect(promise).resolves.toEqual({ correlationId: 'c', v: 42 });
  });

  it('registerSingle rejects on timeout with empty partialReplies', async () => {
    vi.useFakeTimers();
    try {
      const mgr = new RequestReplyManager();
      const { promise } = mgr.registerSingle<Reply>({ timeoutMs: 100 });
      vi.advanceTimersByTime(101);
      await expect(promise).rejects.toBeInstanceOf(RequestTimeoutError);
      await expect(promise).rejects.toMatchObject({ partialReplies: [] });
    } finally {
      vi.useRealTimers();
    }
  });

  it('registerSingle rejects with AbortError when signal fires', async () => {
    const mgr = new RequestReplyManager();
    const ac = new AbortController();
    const { promise } = mgr.registerSingle<Reply>({ timeoutMs: 5000, signal: ac.signal });
    ac.abort();
    await expect(promise).rejects.toBeInstanceOf(AbortError);
  });

  it('registerSingle rejects synchronously when signal already aborted', async () => {
    const mgr = new RequestReplyManager();
    const ac = new AbortController();
    ac.abort();
    const { promise } = mgr.registerSingle<Reply>({ timeoutMs: 5000, signal: ac.signal });
    await expect(promise).rejects.toBeInstanceOf(AbortError);
  });

  it('registerMulti resolves early when expectedReplyCount reached', async () => {
    const mgr = new RequestReplyManager();
    const { requestMessageId, promise } = mgr.registerMulti<Reply>({
      timeoutMs: 5000,
      expectedReplyCount: 2,
    });
    const env = envWithResponseId(requestMessageId);
    mgr.tryRouteReply(env, { correlationId: 'c', v: 1 } as Reply);
    mgr.tryRouteReply(env, { correlationId: 'c', v: 2 } as Reply);
    const result = await promise;
    expect(result).toHaveLength(2);
    expect(result[0]?.v).toBe(1);
    expect(result[1]?.v).toBe(2);
  });

  it('registerMulti rejects with partials when expectedReplyCount exceeds received at timeout', async () => {
    vi.useFakeTimers();
    try {
      const mgr = new RequestReplyManager();
      const { requestMessageId, promise } = mgr.registerMulti<Reply>({
        timeoutMs: 100,
        expectedReplyCount: 3,
      });
      const env = envWithResponseId(requestMessageId);
      mgr.tryRouteReply(env, { correlationId: 'c', v: 1 } as Reply);
      vi.advanceTimersByTime(101);
      await expect(promise).rejects.toBeInstanceOf(RequestTimeoutError);
      await expect(promise).rejects.toMatchObject({ partialReplies: [{ v: 1 }] });
    } finally {
      vi.useRealTimers();
    }
  });

  it('registerMulti resolves with all replies at full timeout when no expectedReplyCount', async () => {
    vi.useFakeTimers();
    try {
      const mgr = new RequestReplyManager();
      const { requestMessageId, promise } = mgr.registerMulti<Reply>({ timeoutMs: 100 });
      const env = envWithResponseId(requestMessageId);
      mgr.tryRouteReply(env, { correlationId: 'c', v: 1 } as Reply);
      mgr.tryRouteReply(env, { correlationId: 'c', v: 2 } as Reply);
      vi.advanceTimersByTime(101);
      const result = await promise;
      expect(result).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('registerMulti resolves with empty array on full timeout when no replies and no expectedReplyCount', async () => {
    vi.useFakeTimers();
    try {
      const mgr = new RequestReplyManager();
      const { promise } = mgr.registerMulti<Reply>({ timeoutMs: 100 });
      vi.advanceTimersByTime(101);
      await expect(promise).resolves.toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('registerCallback invokes onReply per matching message', async () => {
    vi.useFakeTimers();
    try {
      const mgr = new RequestReplyManager();
      const onReply = vi.fn();
      const { requestMessageId, promise } = mgr.registerCallback<Reply>(onReply, {
        timeoutMs: 100,
        expectedReplyCount: 2,
      });
      const env = envWithResponseId(requestMessageId);
      mgr.tryRouteReply(env, { correlationId: 'c', v: 1 } as Reply);
      mgr.tryRouteReply(env, { correlationId: 'c', v: 2 } as Reply);
      await expect(promise).resolves.toBeUndefined();
      expect(onReply).toHaveBeenCalledTimes(2);
      expect(onReply).toHaveBeenNthCalledWith(1, { correlationId: 'c', v: 1 });
      expect(onReply).toHaveBeenNthCalledWith(2, { correlationId: 'c', v: 2 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('registerCallback rejects when onReply throws', async () => {
    const mgr = new RequestReplyManager();
    const { requestMessageId, promise } = mgr.registerCallback<Reply>(
      () => {
        throw new Error('handler boom');
      },
      { timeoutMs: 5000 },
    );
    const env = envWithResponseId(requestMessageId);
    mgr.tryRouteReply(env, { correlationId: 'c', v: 1 } as Reply);
    await expect(promise).rejects.toThrow('handler boom');
  });

  it('tryRouteReply returns false when not pending', () => {
    const mgr = new RequestReplyManager();
    const matched = mgr.tryRouteReply(envWithResponseId('not-a-real-id'), {
      correlationId: 'c',
    } as Message);
    expect(matched).toBe(false);
  });

  it('tryRouteReply returns false when headers has no responseMessageId', () => {
    const mgr = new RequestReplyManager();
    const env: Envelope = { headers: {}, body: new Uint8Array() };
    const matched = mgr.tryRouteReply(env, { correlationId: 'c' } as Message);
    expect(matched).toBe(false);
  });

  it('shutdown rejects every pending entry with the given error', async () => {
    const mgr = new RequestReplyManager();
    const { promise: p1 } = mgr.registerSingle<Reply>({ timeoutMs: 5000 });
    const { promise: p2 } = mgr.registerMulti<Reply>({ timeoutMs: 5000, expectedReplyCount: 3 });
    const reason = new Error('bus is stopped');
    mgr.shutdown(reason);
    await expect(p1).rejects.toBe(reason);
    await expect(p2).rejects.toBe(reason);
  });

  it('settled entries do not re-fire on subsequent events', async () => {
    const mgr = new RequestReplyManager();
    const { requestMessageId, promise } = mgr.registerSingle<Reply>({ timeoutMs: 5000 });
    const env = envWithResponseId(requestMessageId);
    mgr.tryRouteReply(env, { correlationId: 'c', v: 1 } as Reply);
    // Second route attempt after settlement: returns false (no pending entry).
    const second = mgr.tryRouteReply(env, { correlationId: 'c', v: 2 } as Reply);
    expect(second).toBe(false);
    await expect(promise).resolves.toEqual({ correlationId: 'c', v: 1 });
  });
});
