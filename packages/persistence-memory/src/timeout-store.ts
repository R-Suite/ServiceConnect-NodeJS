import { randomUUID } from 'node:crypto';
import type { ITimeoutStore, TimeoutRecord } from '@serviceconnect/core';

export interface MemoryTimeoutStoreOptions {
    /**
     * Visibility lease applied when claimDue hands a record out. The record stays invisible to other
     * claims for this long; if the poller crashes before deleting it, it becomes claimable again
     * after the lease expires. Defaults to 60s.
     */
    leaseMs?: number;
}

export function memoryTimeoutStore(options: MemoryTimeoutStoreOptions = {}): ITimeoutStore {
    const leaseMs = options.leaseMs ?? 60_000;
    // claimedUntil = epoch ms until which the record is leased (0 = unclaimed).
    const byId = new Map<string, { record: TimeoutRecord; claimedUntil: number }>();

    return {
        async schedule(record: Omit<TimeoutRecord, 'id'>): Promise<TimeoutRecord> {
            const id = randomUUID();
            const stored: TimeoutRecord = {
                id,
                name: record.name,
                sagaCorrelationId: record.sagaCorrelationId,
                sagaDataType: record.sagaDataType,
                runAt: record.runAt,
                payload: record.payload,
            };
            byId.set(id, { record: stored, claimedUntil: 0 });
            return stored;
        },

        async claimDue(now: Date, limit: number): Promise<readonly TimeoutRecord[]> {
            const ms = now.getTime();
            // Due AND not currently leased (unclaimed or lease expired).
            const eligible = [...byId.values()]
                .filter((e) => e.record.runAt.getTime() <= ms && e.claimedUntil <= ms)
                .sort((a, b) => a.record.runAt.getTime() - b.record.runAt.getTime())
                .slice(0, limit);
            // Lease them so a concurrent claim (another poller, or an overlapping tick) cannot take them.
            for (const e of eligible) e.claimedUntil = ms + leaseMs;
            return eligible.map((e) => e.record);
        },

        async delete(id: string): Promise<void> {
            byId.delete(id);
        },
    };
}
