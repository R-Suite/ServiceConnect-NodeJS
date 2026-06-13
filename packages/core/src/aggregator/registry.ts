import { AggregatorConfigurationError } from '../errors.js';
import type { Message } from '../message.js';
import type { IAggregatorStore } from '../persistence/aggregator-store.js';
import type { Aggregator } from './aggregator.js';

export interface AggregatorEntry {
    readonly aggregator: Aggregator<Message>;
    readonly batchSize: number;
    readonly timeoutMs: number;
    readonly store: IAggregatorStore;
}

export class AggregatorRegistry {
    private readonly byType = new Map<string, AggregatorEntry>();

    register<T extends Message>(
        messageType: string,
        aggregator: Aggregator<T>,
        store?: IAggregatorStore,
    ): void {
        const batchSize = aggregator.batchSize();
        const timeoutMs = aggregator.timeout();
        if (!Number.isInteger(batchSize) || batchSize <= 0) {
            throw new AggregatorConfigurationError(
                `aggregator ${messageType}: batchSize() must be a positive integer (got ${batchSize})`,
            );
        }
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            throw new AggregatorConfigurationError(
                `aggregator ${messageType}: timeout() must be a positive finite number of ms (got ${timeoutMs})`,
            );
        }
        if (!store) {
            throw new AggregatorConfigurationError(
                `aggregator ${messageType}: registerAggregator requires an IAggregatorStore`,
            );
        }
        this.byType.set(messageType, {
            aggregator: aggregator as Aggregator<Message>,
            batchSize,
            timeoutMs,
            store,
        });
    }

    entryFor(messageType: string): AggregatorEntry | undefined {
        return this.byType.get(messageType);
    }

    hasAny(): boolean {
        return this.byType.size > 0;
    }

    timeouts(): ReadonlyMap<string, number> {
        const out = new Map<string, number>();
        for (const [k, v] of this.byType.entries()) out.set(k, v.timeoutMs);
        return out;
    }

    stores(): readonly IAggregatorStore[] {
        return [...new Set([...this.byType.values()].map((e) => e.store))];
    }
}
