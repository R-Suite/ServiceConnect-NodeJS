import { randomUUID } from 'node:crypto';
import type { Message } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
import { memoryAggregatorStore } from '../src/aggregator-store.js';

// Regression for memory aggregator store: a claimed batch whose handler threw is NOT released by
// core (it relies on lease expiry). The store must therefore retain claimed messages so that, once
// the lease expires, expireDueLeases re-claims the same batch — matching the Mongo store. The old
// implementation spliced messages out at claim time, permanently losing a failed batch.

interface Foo extends Message {
    v: number;
}

describe('memory aggregator: a failed (un-released) batch is re-claimable after lease expiry', () => {
    it('expireDueLeases re-delivers the original batch when releaseSnapshot was not called', async () => {
        const store = memoryAggregatorStore();
        const type = `Foo-${randomUUID()}`;
        const batchSize = 3;
        const timeoutMs = 20;
        const leaseMs = timeoutMs * 5;

        await store.appendAndClaim<Foo>(type, { correlationId: 'c', v: 1 }, batchSize, leaseMs);
        await store.appendAndClaim<Foo>(type, { correlationId: 'c', v: 2 }, batchSize, leaseMs);
        const claim = await store.appendAndClaim<Foo>(
            type,
            { correlationId: 'c', v: 3 },
            batchSize,
            leaseMs,
        );
        expect(claim?.messages.map((m) => (m as Foo).v)).toEqual([1, 2, 3]);

        // Simulate aggregator.execute() throwing: core does NOT release the snapshot.
        // Wait past the lease + per-type timeout.
        await new Promise((r) => setTimeout(r, leaseMs + timeoutMs + 50));

        const recovered = await store.expireDueLeases(new Map([[type, timeoutMs]]), leaseMs);

        // The original batch is re-claimed intact — no loss.
        expect(recovered).toHaveLength(1);
        expect((recovered[0]?.messages as Foo[]).map((m) => m.v).sort()).toEqual([1, 2, 3]);
    });

    it('releaseSnapshot permanently removes the batch (no re-claim after success)', async () => {
        const store = memoryAggregatorStore();
        const type = `Foo-${randomUUID()}`;
        const batchSize = 2;
        const timeoutMs = 20;
        const leaseMs = timeoutMs * 5;

        await store.appendAndClaim<Foo>(type, { correlationId: 'c', v: 1 }, batchSize, leaseMs);
        const claim = await store.appendAndClaim<Foo>(
            type,
            { correlationId: 'c', v: 2 },
            batchSize,
            leaseMs,
        );
        expect(claim).toBeDefined();

        // Successful execute -> release.
        await store.releaseSnapshot(claim?.snapshotId as string);
        await new Promise((r) => setTimeout(r, leaseMs + timeoutMs + 50));

        const recovered = await store.expireDueLeases(new Map([[type, timeoutMs]]), leaseMs);
        expect(recovered).toHaveLength(0);
    });
});
