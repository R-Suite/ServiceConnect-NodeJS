import { randomUUID } from 'node:crypto';
import type { AggregatorClaim, IAggregatorStore, Message } from '@serviceconnect/core';

interface BufferedEntry {
    message: Message;
    appendedAt: number;
    // Lease state. A claimed entry is retained until releaseSnapshot removes it; once claimExpiresAt
    // passes it becomes claimable again. This mirrors the Mongo store so a batch whose handler threw
    // (and was therefore not released) is re-claimed on lease expiry instead of being lost.
    claimedBy?: string;
    claimExpiresAt?: number;
}

interface Bucket {
    entries: BufferedEntry[];
}

export function memoryAggregatorStore(): IAggregatorStore {
    const byType = new Map<string, Bucket>();

    function bucket(t: string): Bucket {
        let b = byType.get(t);
        if (!b) {
            b = { entries: [] };
            byType.set(t, b);
        }
        return b;
    }

    // Entries that are due to claim: unclaimed, or claimed with an expired lease. Insertion order is
    // preserved (entries are appended in order), so the result is oldest-first.
    function eligible(b: Bucket, now: number): BufferedEntry[] {
        return b.entries.filter((e) => e.claimedBy === undefined || (e.claimExpiresAt ?? 0) <= now);
    }

    function claim(
        aggregatorType: string,
        entries: BufferedEntry[],
        leaseMs: number,
        now: number,
    ): AggregatorClaim<Message> {
        const snapshotId = randomUUID();
        const claimExpiresAt = now + leaseMs;
        for (const e of entries) {
            e.claimedBy = snapshotId;
            e.claimExpiresAt = claimExpiresAt;
        }
        return { snapshotId, messages: entries.map((e) => e.message), aggregatorType };
    }

    return {
        async appendAndClaim<T extends Message>(
            aggregatorType: string,
            message: T,
            batchSize: number,
            leaseMs: number,
        ): Promise<AggregatorClaim<T> | undefined> {
            const now = Date.now();
            const b = bucket(aggregatorType);
            b.entries.push({ message, appendedAt: now });
            const claimable = eligible(b, now);
            if (claimable.length < batchSize) return undefined;
            return claim(
                aggregatorType,
                claimable.slice(0, batchSize),
                leaseMs,
                now,
            ) as AggregatorClaim<T>;
        },

        async releaseSnapshot(snapshotId: string): Promise<void> {
            // Successful processing: permanently remove the claimed entries.
            for (const b of byType.values()) {
                b.entries = b.entries.filter((e) => e.claimedBy !== snapshotId);
            }
        },

        async expireDueLeases(
            aggregatorTimeouts: ReadonlyMap<string, number>,
            leaseMs: number,
        ): Promise<readonly AggregatorClaim<Message>[]> {
            const now = Date.now();
            const out: AggregatorClaim<Message>[] = [];
            for (const [type, b] of byType.entries()) {
                const claimable = eligible(b, now);
                if (claimable.length === 0) continue;
                const timeoutMs = aggregatorTimeouts.get(type);
                if (timeoutMs === undefined) continue;
                const oldest = claimable[0]?.appendedAt ?? now;
                if (now - oldest < timeoutMs) continue;
                out.push(claim(type, claimable, leaseMs, now));
            }
            return out;
        },
    };
}
