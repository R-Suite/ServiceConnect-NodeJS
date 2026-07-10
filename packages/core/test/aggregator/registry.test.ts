import { describe, expect, it } from 'vitest';
import { Aggregator } from '../../src/aggregator/aggregator.js';
import { AggregatorRegistry } from '../../src/aggregator/registry.js';
import { AggregatorConfigurationError } from '../../src/errors.js';
import type { Message } from '../../src/message.js';
import type { IAggregatorStore } from '../../src/persistence/aggregator-store.js';

interface Foo extends Message {
    v: number;
}

class GoodAggregator extends Aggregator<Foo> {
    batchSize(): number {
        return 5;
    }
    timeout(): number {
        return 1000;
    }
    async execute(_messages: readonly Foo[]): Promise<void> {}
}

class ZeroBatchSize extends Aggregator<Foo> {
    batchSize(): number {
        return 0;
    }
    timeout(): number {
        return 1000;
    }
    async execute(): Promise<void> {}
}

class InfiniteTimeout extends Aggregator<Foo> {
    batchSize(): number {
        return 5;
    }
    timeout(): number {
        return Number.POSITIVE_INFINITY;
    }
    async execute(): Promise<void> {}
}

const stubStore = {} as IAggregatorStore;

describe('AggregatorRegistry', () => {
    it('register + lookup round-trip', () => {
        const r = new AggregatorRegistry();
        const a = new GoodAggregator();
        r.register('Foo', a, stubStore);
        const entry = r.entryFor('Foo');
        expect(entry?.aggregator).toBe(a);
        expect(entry?.batchSize).toBe(5);
        expect(entry?.timeoutMs).toBe(1000);
    });

    it('rejects batchSize <= 0 with AggregatorConfigurationError', () => {
        const r = new AggregatorRegistry();
        expect(() => r.register('Foo', new ZeroBatchSize(), stubStore)).toThrow(
            AggregatorConfigurationError,
        );
    });

    it('rejects non-finite timeout with AggregatorConfigurationError', () => {
        const r = new AggregatorRegistry();
        expect(() => r.register('Foo', new InfiniteTimeout(), stubStore)).toThrow(
            AggregatorConfigurationError,
        );
    });

    it('rejects missing store with AggregatorConfigurationError', () => {
        const r = new AggregatorRegistry();
        expect(() => r.register('Foo', new GoodAggregator())).toThrow(AggregatorConfigurationError);
    });

    it('entryFor returns undefined for unregistered type', () => {
        const r = new AggregatorRegistry();
        expect(r.entryFor('Missing')).toBeUndefined();
    });

    it('timeouts map exposes per-type timeoutMs', () => {
        const r = new AggregatorRegistry();
        r.register('Foo', new GoodAggregator(), stubStore);
        expect(r.timeouts().get('Foo')).toBe(1000);
    });

    it('hasAny returns false on empty registry, true after a register', () => {
        const r = new AggregatorRegistry();
        expect(r.hasAny()).toBe(false);
        r.register('Foo', new GoodAggregator(), stubStore);
        expect(r.hasAny()).toBe(true);
    });
});
