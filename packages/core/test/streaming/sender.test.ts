import { describe, expect, it } from 'vitest';
import { createBus } from '../../src/bus.js';
import { InvalidOperationError } from '../../src/errors.js';
import type { Message } from '../../src/message.js';
import { StreamHeaders } from '../../src/streaming/stream-headers.js';
import { fakeTransport } from '../../src/testing/fake-transport.js';

interface Chunk extends Message {
  data: string;
}

describe('StreamSender via Bus.openStream', () => {
  it('sendChunk publishes one message per chunk with monotonic SequenceNumber', async () => {
    const transport = fakeTransport();
    const bus = createBus({ transport, queue: { name: 'q' } }).registerMessage<Chunk>('Chunk');
    await bus.start();
    const sender = await bus.openStream<Chunk>('worker-queue', 'Chunk');

    await sender.sendChunk({ correlationId: 'c', data: 'a' });
    await sender.sendChunk({ correlationId: 'c', data: 'b' });
    await sender.complete();

    const sent = transport.outbox.filter((e) => e.operation === 'send');
    expect(sent.length).toBe(3);
    expect(sent[0]?.headers?.[StreamHeaders.IsStartOfStream]).toBe('true');
    expect(sent[0]?.headers?.[StreamHeaders.SequenceNumber]).toBe('0');
    expect(sent[1]?.headers?.[StreamHeaders.SequenceNumber]).toBe('1');
    expect(sent[2]?.headers?.[StreamHeaders.IsEndOfStream]).toBe('true');
    expect(sent[2]?.headers?.[StreamHeaders.SequenceNumber]).toBe('2');
    const id = sent[0]?.headers?.[StreamHeaders.StreamId];
    expect(id).toBeTypeOf('string');
    expect(sent.every((s) => s.headers?.[StreamHeaders.StreamId] === id)).toBe(true);

    await bus.stop();
  });

  it('complete() emits a final chunk with IsEndOfStream=true', async () => {
    const transport = fakeTransport();
    const bus = createBus({ transport, queue: { name: 'q' } }).registerMessage<Chunk>('Chunk');
    await bus.start();
    const sender = await bus.openStream<Chunk>('worker-queue', 'Chunk');
    await sender.complete();
    const sent = transport.outbox.filter((e) => e.operation === 'send');
    expect(sent[0]?.headers?.[StreamHeaders.IsEndOfStream]).toBe('true');
    await bus.stop();
  });

  it('fault() emits a final chunk with StreamFault header set; subsequent sendChunk throws InvalidOperationError', async () => {
    const transport = fakeTransport();
    const bus = createBus({ transport, queue: { name: 'q' } }).registerMessage<Chunk>('Chunk');
    await bus.start();
    const sender = await bus.openStream<Chunk>('worker-queue', 'Chunk');
    await sender.fault('upstream-fault');
    const sent = transport.outbox.filter((e) => e.operation === 'send');
    expect(sent[0]?.headers?.[StreamHeaders.StreamFault]).toBe('upstream-fault');
    expect(sent[0]?.headers?.[StreamHeaders.IsEndOfStream]).toBe('true');
    await expect(sender.sendChunk({ correlationId: 'c', data: 'x' })).rejects.toBeInstanceOf(
      InvalidOperationError,
    );
    await bus.stop();
  });

  it('a fresh openStream gets a different StreamId than the previous one', async () => {
    const transport = fakeTransport();
    const bus = createBus({ transport, queue: { name: 'q' } }).registerMessage<Chunk>('Chunk');
    await bus.start();
    const s1 = await bus.openStream<Chunk>('q', 'Chunk');
    const s2 = await bus.openStream<Chunk>('q', 'Chunk');
    expect(s1.streamId).not.toBe(s2.streamId);
    await s1.complete();
    await s2.complete();
    await bus.stop();
  });
});
