import type { Message } from '../message.js';

export interface AggregatorClaim<T extends Message> {
    readonly snapshotId: string;
    readonly messages: readonly T[];
    readonly aggregatorType: string;
}

export interface IAggregatorStore {
    appendAndClaim<T extends Message>(
        aggregatorType: string,
        message: T,
        batchSize: number,
        leaseMs: number,
    ): Promise<AggregatorClaim<T> | undefined>;

    releaseSnapshot(snapshotId: string): Promise<void>;

    expireDueLeases(
        aggregatorTimeouts: ReadonlyMap<string, number>,
        leaseMs: number,
    ): Promise<readonly AggregatorClaim<Message>[]>;
}
