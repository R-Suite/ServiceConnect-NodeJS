import { describe, expect, it } from 'vitest';
import { Aggregator } from '../../src/aggregator/aggregator.js';
import { AggregatorFlushTimer } from '../../src/aggregator/flush-timer.js';
import { AggregatorRegistry } from '../../src/aggregator/registry.js';
import { consoleLogger } from '../../src/logger.js';
import type { Message } from '../../src/message.js';
import type { AggregatorClaim, IAggregatorStore } from '../../src/persistence/aggregator-store.js';

interface Foo extends Message {
    v: number;
}

class Recorder extends Aggregator<Foo> {
    public batches: (readonly Foo[])[] = [];
    batchSize(): number {
        return 100;
    }
    timeout(): number {
        return 20;
    }
    async execute(messages: readonly Foo[]): Promise<void> {
        this.batches.push(messages);
    }
}

function fakeStore(claimsToYield: AggregatorClaim<Message>[]): IAggregatorStore {
    let yielded = false;
    return {
        async appendAndClaim() {
            return undefined;
        },
        async releaseSnapshot() {},
        async expireDueLeases() {
            if (yielded) return [];
            yielded = true;
            return claimsToYield;
        },
    };
}

describe('AggregatorFlushTimer', () => {
    it('drains expired leases into the registered aggregator', async () => {
        const registry = new AggregatorRegistry();
        const recorder = new Recorder();
        const claim: AggregatorClaim<Message> = {
            snapshotId: 'snap-1',
            messages: [{ correlationId: 'c', v: 1 } as Foo, { correlationId: 'c', v: 2 } as Foo],
            aggregatorType: 'Foo',
        };
        const store = fakeStore([claim]);
        registry.register('Foo', recorder, store);

        const timer = new AggregatorFlushTimer({
            registry,
            intervalMs: 5,
            leaseMs: 60_000,
            logger: consoleLogger('fatal'),
        });
        timer.start();
        await new Promise((r) => setTimeout(r, 30));
        await timer.stop();

        expect(recorder.batches).toHaveLength(1);
        expect(recorder.batches[0]?.map((m) => (m as Foo).v)).toEqual([1, 2]);
    });

    it('stop is idempotent and awaits in-flight ticks', async () => {
        const registry = new AggregatorRegistry();
        registry.register('Foo', new Recorder(), fakeStore([]));
        const timer = new AggregatorFlushTimer({
            registry,
            intervalMs: 5,
            leaseMs: 60_000,
            logger: consoleLogger('fatal'),
        });
        timer.start();
        await timer.stop();
        await timer.stop();
    });

    it('execute throw on flush is logged and lease left untouched', async () => {
        class Boom extends Aggregator<Foo> {
            batchSize(): number {
                return 100;
            }
            timeout(): number {
                return 10;
            }
            async execute(): Promise<void> {
                throw new Error('flush-boom');
            }
        }
        const registry = new AggregatorRegistry();
        let released = false;
        const claim: AggregatorClaim<Message> = {
            snapshotId: 'snap-2',
            messages: [{ correlationId: 'c', v: 1 } as Foo],
            aggregatorType: 'Foo',
        };
        const store: IAggregatorStore = {
            async appendAndClaim() {
                return undefined;
            },
            async releaseSnapshot() {
                released = true;
            },
            async expireDueLeases() {
                return [claim];
            },
        };
        registry.register('Foo', new Boom(), store);

        const timer = new AggregatorFlushTimer({
            registry,
            intervalMs: 5,
            leaseMs: 60_000,
            logger: consoleLogger('fatal'),
        });
        timer.start();
        await new Promise((r) => setTimeout(r, 30));
        await timer.stop();

        expect(released).toBe(false);
    });
});
