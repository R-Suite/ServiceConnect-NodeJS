import { describe, expect, it } from 'vitest';
import { Aggregator } from '../../src/aggregator/aggregator.js';
import { runAggregatorBranch } from '../../src/aggregator/dispatch.js';
import { AggregatorRegistry } from '../../src/aggregator/registry.js';
import { consoleLogger } from '../../src/logger.js';
import type { Message } from '../../src/message.js';
import { memoryAggregatorStoreInline } from '../helpers/memory-stubs.js';

interface Foo extends Message {
  v: number;
}

class Recorder extends Aggregator<Foo> {
  public batches: (readonly Foo[])[] = [];
  private readonly size: number;
  constructor(size = 3) {
    super();
    this.size = size;
  }
  batchSize(): number {
    return this.size;
  }
  timeout(): number {
    return 60_000;
  }
  async execute(messages: readonly Foo[]): Promise<void> {
    this.batches.push(messages);
  }
}

describe('aggregator branch', () => {
  it('buffers below batchSize → ran=true, success=true, notHandled=false', async () => {
    const registry = new AggregatorRegistry();
    const recorder = new Recorder(3);
    const store = memoryAggregatorStoreInline();
    registry.register('Foo', recorder, store);

    const outcome = await runAggregatorBranch(
      { headers: { messageType: 'Foo', correlationId: 'c' }, body: new Uint8Array() },
      { correlationId: 'c', v: 1 } as Foo,
      new AbortController().signal,
      { registry, logger: consoleLogger('fatal') },
    );

    expect(outcome.ran).toBe(true);
    expect(outcome.result?.success).toBe(true);
    expect(outcome.result?.notHandled).toBe(false);
    expect(recorder.batches).toHaveLength(0);
  });

  it('reaching batchSize triggers execute and releases the snapshot', async () => {
    const registry = new AggregatorRegistry();
    const recorder = new Recorder(2);
    const store = memoryAggregatorStoreInline();
    registry.register('Foo', recorder, store);

    const env = () => ({
      headers: { messageType: 'Foo', correlationId: 'c' },
      body: new Uint8Array(),
    });
    const opts = { registry, logger: consoleLogger('fatal') };
    await runAggregatorBranch(
      env(),
      { correlationId: 'c', v: 1 } as Foo,
      new AbortController().signal,
      opts,
    );
    const out2 = await runAggregatorBranch(
      env(),
      { correlationId: 'c', v: 2 } as Foo,
      new AbortController().signal,
      opts,
    );

    expect(out2.result?.success).toBe(true);
    expect(recorder.batches).toHaveLength(1);
    expect(recorder.batches[0]?.map((m) => m.v)).toEqual([1, 2]);
  });

  it('execute throw returns success=false (lease left to expire)', async () => {
    const registry = new AggregatorRegistry();
    class Boom extends Aggregator<Foo> {
      batchSize(): number {
        return 1;
      }
      timeout(): number {
        return 60_000;
      }
      async execute(): Promise<void> {
        throw new Error('handler-boom');
      }
    }
    const store = memoryAggregatorStoreInline();
    registry.register('Foo', new Boom(), store);

    const env = { headers: { messageType: 'Foo', correlationId: 'c' }, body: new Uint8Array() };
    const outcome = await runAggregatorBranch(
      env,
      { correlationId: 'c', v: 1 } as Foo,
      new AbortController().signal,
      { registry, logger: consoleLogger('fatal') },
    );

    expect(outcome.result?.success).toBe(false);
    expect(outcome.result?.terminalFailure).toBe(false);
  });

  it('unregistered message type → ran=false (fall through to handler chain)', async () => {
    const registry = new AggregatorRegistry();
    const outcome = await runAggregatorBranch(
      { headers: { messageType: 'Unknown', correlationId: 'c' }, body: new Uint8Array() },
      { correlationId: 'c' } as Foo,
      new AbortController().signal,
      { registry, logger: consoleLogger('fatal') },
    );
    expect(outcome.ran).toBe(false);
  });
});
