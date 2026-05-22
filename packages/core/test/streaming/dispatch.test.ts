import { describe, expect, it } from 'vitest';
import { createBus } from '../../src/bus.js';
import type { Envelope } from '../../src/envelope.js';
import type { Message } from '../../src/message.js';
import { StreamHeaders } from '../../src/streaming/stream-headers.js';
import { fakeTransport } from '../../src/testing/fake-transport.js';

interface Chunk extends Message {
  v: number;
}

function chunkEnvelope(
  streamId: string,
  seq: number,
  v: number | undefined,
  flags: { isStart?: boolean; isEnd?: boolean; fault?: string } = {},
): Envelope {
  const headers: Record<string, string> = {
    messageType: 'Chunk',
    correlationId: 'c',
    [StreamHeaders.StreamId]: streamId,
    [StreamHeaders.SequenceNumber]: String(seq),
    [StreamHeaders.IsStartOfStream]: flags.isStart ? 'true' : 'false',
    [StreamHeaders.IsEndOfStream]: flags.isEnd ? 'true' : 'false',
  };
  if (flags.fault !== undefined) {
    headers[StreamHeaders.StreamFault] = flags.fault;
  }
  const body =
    v === undefined
      ? new Uint8Array()
      : new TextEncoder().encode(JSON.stringify({ correlationId: 'c', v }));
  return { headers, body };
}

describe('stream dispatch branch via bus.handleStream', () => {
  it('routes chunks into the registered handler in order and resolves on end-of-stream', async () => {
    const transport = fakeTransport();
    const collected: Chunk[] = [];
    const bus = createBus({ transport, queue: { name: 'q' } })
      .registerMessage<Chunk>('Chunk')
      .handleStream<Chunk>('Chunk', async (stream) => {
        for await (const chunk of stream) collected.push(chunk);
      });

    await bus.start();

    await transport.deliver(chunkEnvelope('s-1', 0, 1, { isStart: true }));
    await transport.deliver(chunkEnvelope('s-1', 1, 2));
    await transport.deliver(chunkEnvelope('s-1', 2, undefined, { isEnd: true }));

    await new Promise((r) => setTimeout(r, 50));

    expect(collected.map((c) => c.v)).toEqual([1, 2]);

    await bus.stop();
  });

  it('handler receives an AsyncIterable that throws on faulted final chunk', async () => {
    const transport = fakeTransport();
    let caught: unknown;
    const bus = createBus({ transport, queue: { name: 'q' } })
      .registerMessage<Chunk>('Chunk')
      .handleStream<Chunk>('Chunk', async (stream) => {
        try {
          for await (const _chunk of stream) void _chunk;
        } catch (err) {
          caught = err;
        }
      });

    await bus.start();

    await transport.deliver(chunkEnvelope('s-2', 0, 1, { isStart: true }));
    await transport.deliver(
      chunkEnvelope('s-2', 1, undefined, { isEnd: true, fault: 'upstream-broken' }),
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('upstream-broken');

    await bus.stop();
  });
});
