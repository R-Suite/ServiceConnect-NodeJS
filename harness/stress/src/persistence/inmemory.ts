import type { IAggregatorStore, ISagaStore, ITimeoutStore } from '@serviceconnect/core';
import {
    memoryAggregatorStore,
    memorySagaStore,
    memoryTimeoutStore,
} from '@serviceconnect/persistence-memory';

export interface PersistenceBundle {
    readonly sagaStore: ISagaStore;
    readonly aggregatorStore: IAggregatorStore;
    readonly timeoutStore: ITimeoutStore;
    dispose(): Promise<void>;
}

export function inmemoryPersistence(): PersistenceBundle {
    return {
        sagaStore: memorySagaStore(),
        aggregatorStore: memoryAggregatorStore(),
        timeoutStore: memoryTimeoutStore(),
        async dispose() {},
    };
}
