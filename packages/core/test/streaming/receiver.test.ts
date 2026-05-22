import { describe, expect, it } from 'vitest';
import { StreamFaultedError, StreamSequenceError } from '../../src/errors.js';
import type { Message } from '../../src/message.js';
import { StreamReceiver } from '../../src/streaming/receiver.js';

interface Chunk extends Message {
  v: number;
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

describe('StreamReceiver', () => {
  it('yields chunks in arrival order when sequence numbers are monotonic', async () => {
    const r = new StreamReceiver<Chunk>('s-1');
    r.push({
      chunk: { correlationId: 'c', v: 1 } as Chunk,
      sequenceNumber: 0,
      isEnd: false,
      faulted: undefined,
    });
    r.push({
      chunk: { correlationId: 'c', v: 2 } as Chunk,
      sequenceNumber: 1,
      isEnd: false,
      faulted: undefined,
    });
    r.push({ chunk: undefined, sequenceNumber: 2, isEnd: true, faulted: undefined });
    const all = await collect(r);
    expect(all.map((c) => c.v)).toEqual([1, 2]);
  });

  it('reorders out-of-order chunks via internal buffer keyed by sequenceNumber', async () => {
    const r = new StreamReceiver<Chunk>('s-2');
    r.push({
      chunk: { correlationId: 'c', v: 2 } as Chunk,
      sequenceNumber: 1,
      isEnd: false,
      faulted: undefined,
    });
    r.push({
      chunk: { correlationId: 'c', v: 1 } as Chunk,
      sequenceNumber: 0,
      isEnd: false,
      faulted: undefined,
    });
    r.push({ chunk: undefined, sequenceNumber: 2, isEnd: true, faulted: undefined });
    const all = await collect(r);
    expect(all.map((c) => c.v)).toEqual([1, 2]);
  });

  it('faulted final chunk causes iteration to throw StreamFaultedError', async () => {
    const r = new StreamReceiver<Chunk>('s-3');
    r.push({
      chunk: { correlationId: 'c', v: 1 } as Chunk,
      sequenceNumber: 0,
      isEnd: false,
      faulted: undefined,
    });
    r.push({ chunk: undefined, sequenceNumber: 1, isEnd: true, faulted: 'upstream-fault' });
    await expect(collect(r)).rejects.toBeInstanceOf(StreamFaultedError);
  });

  it('faulted state latches: subsequent push is dropped', async () => {
    const r = new StreamReceiver<Chunk>('s-4');
    r.push({ chunk: undefined, sequenceNumber: 0, isEnd: true, faulted: 'boom' });
    r.push({
      chunk: { correlationId: 'c', v: 99 } as Chunk,
      sequenceNumber: 1,
      isEnd: false,
      faulted: undefined,
    });
    expect(r.isFaulted()).toBe(true);
  });

  it('exceeding maxBufferedChunks throws StreamSequenceError on the next push', async () => {
    const r = new StreamReceiver<Chunk>('s-5', { maxBufferedChunks: 2 });
    r.push({
      chunk: { correlationId: 'c', v: 2 } as Chunk,
      sequenceNumber: 1,
      isEnd: false,
      faulted: undefined,
    });
    r.push({
      chunk: { correlationId: 'c', v: 3 } as Chunk,
      sequenceNumber: 2,
      isEnd: false,
      faulted: undefined,
    });
    expect(() =>
      r.push({
        chunk: { correlationId: 'c', v: 4 } as Chunk,
        sequenceNumber: 3,
        isEnd: false,
        faulted: undefined,
      }),
    ).toThrow(StreamSequenceError);
  });
});
