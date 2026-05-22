import { describe, expect, it } from 'vitest';
import type { Message } from '../../message.js';
import type { IAggregatorStore } from '../../persistence/aggregator-store.js';

interface Foo extends Message {
  v: number;
}

export function runAggregatorStoreContract(label: string, factory: () => IAggregatorStore): void {
  describe(`IAggregatorStore contract: ${label}`, () => {
    it('appendAndClaim below batchSize returns undefined and buffers the message', async () => {
      const store = factory();
      const r1 = await store.appendAndClaim<Foo>('Foo', { correlationId: 'c', v: 1 }, 3, 60_000);
      expect(r1).toBeUndefined();
      const r2 = await store.appendAndClaim<Foo>('Foo', { correlationId: 'c', v: 2 }, 3, 60_000);
      expect(r2).toBeUndefined();
    });

    it('appendAndClaim at batchSize claims the buffered messages', async () => {
      const store = factory();
      await store.appendAndClaim<Foo>('Foo', { correlationId: 'c', v: 1 }, 3, 60_000);
      await store.appendAndClaim<Foo>('Foo', { correlationId: 'c', v: 2 }, 3, 60_000);
      const claim = await store.appendAndClaim<Foo>('Foo', { correlationId: 'c', v: 3 }, 3, 60_000);
      expect(claim).toBeDefined();
      expect(claim?.aggregatorType).toBe('Foo');
      expect(claim?.messages.map((m) => m.v)).toEqual([1, 2, 3]);
      expect(claim?.snapshotId).toBeTypeOf('string');
    });

    it('claimed messages are removed from the live buffer', async () => {
      const store = factory();
      await store.appendAndClaim<Foo>('Foo', { correlationId: 'c', v: 1 }, 2, 60_000);
      const claim = await store.appendAndClaim<Foo>('Foo', { correlationId: 'c', v: 2 }, 2, 60_000);
      expect(claim?.messages.length).toBe(2);
      const r = await store.appendAndClaim<Foo>('Foo', { correlationId: 'c', v: 3 }, 2, 60_000);
      expect(r).toBeUndefined();
    });

    it('releaseSnapshot is idempotent on unknown id', async () => {
      const store = factory();
      await store.releaseSnapshot('bogus');
      await store.releaseSnapshot('bogus');
    });

    it('expireDueLeases returns nothing while age is below the per-type timeout', async () => {
      const store = factory();
      await store.appendAndClaim<Foo>('Foo', { correlationId: 'c', v: 1 }, 100, 60_000);
      const claims = await store.expireDueLeases(new Map([['Foo', 60_000]]), 60_000);
      expect(claims).toHaveLength(0);
    });

    it('expireDueLeases claims buffers whose oldest message is older than timeout', async () => {
      const store = factory();
      await store.appendAndClaim<Foo>('Foo', { correlationId: 'c', v: 1 }, 100, 60_000);
      await store.appendAndClaim<Foo>('Foo', { correlationId: 'c', v: 2 }, 100, 60_000);
      await new Promise((r) => setTimeout(r, 30));
      const claims = await store.expireDueLeases(new Map([['Foo', 10]]), 60_000);
      expect(claims).toHaveLength(1);
      expect(claims[0]?.messages).toHaveLength(2);
    });

    it('aggregator types have isolated buffers', async () => {
      const store = factory();
      await store.appendAndClaim<Foo>('A', { correlationId: 'c', v: 1 }, 2, 60_000);
      const claim = await store.appendAndClaim<Foo>('B', { correlationId: 'c', v: 99 }, 1, 60_000);
      expect(claim?.aggregatorType).toBe('B');
      expect(claim?.messages.map((m) => m.v)).toEqual([99]);
    });
  });
}
