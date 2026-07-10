import { describe, expectTypeOf, it } from 'vitest';
import type { AggregatorConfigurationError } from '../../src/errors.js';
import type { Message } from '../../src/message.js';
import type { AggregatorClaim, IAggregatorStore } from '../../src/persistence/aggregator-store.js';

interface Foo extends Message {
    v: number;
}

describe('IAggregatorStore types', () => {
    it('AggregatorClaim carries snapshotId + messages + aggregatorType', () => {
        expectTypeOf<AggregatorClaim<Foo>>().toMatchTypeOf<{
            snapshotId: string;
            messages: readonly Foo[];
            aggregatorType: string;
        }>();
    });

    it('IAggregatorStore exposes appendAndClaim / releaseSnapshot / expireDueLeases', () => {
        expectTypeOf<IAggregatorStore['appendAndClaim']>().toBeFunction();
        expectTypeOf<IAggregatorStore['releaseSnapshot']>().toBeFunction();
        expectTypeOf<IAggregatorStore['expireDueLeases']>().toBeFunction();
    });

    it('AggregatorConfigurationError is exported from errors', () => {
        expectTypeOf<AggregatorConfigurationError>().toMatchTypeOf<Error>();
    });
});
