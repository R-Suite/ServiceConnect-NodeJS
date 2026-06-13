import type { ITimeoutStore, TimeoutRecord } from '@serviceconnect/core';
import { type Collection, type Db, ObjectId } from 'mongodb';

export interface MongoTimeoutStore extends ITimeoutStore {
    ensureIndexes(): Promise<void>;
}

export interface MongoStoreOptions {
    db: Db;
    collectionName?: string;
    /**
     * Visibility lease applied when claimDue claims due records. Concurrent pollers sharing this
     * collection will not both claim the same record within the lease window; if the claiming poller
     * dies before deleting the record, it becomes claimable again after the lease expires. Defaults
     * to 60s.
     */
    leaseMs?: number;
}

interface TimeoutDoc {
    _id: ObjectId;
    name: string;
    sagaCorrelationId: string;
    sagaDataType: string;
    runAt: Date;
    payload?: Readonly<Record<string, unknown>>;
    claimedUntil?: Date;
    claimToken?: string;
}

const DEFAULT_COLLECTION = 'serviceconnect.timeouts';

export function mongoTimeoutStore(options: MongoStoreOptions): MongoTimeoutStore {
    const collection: Collection<TimeoutDoc> = options.db.collection<TimeoutDoc>(
        options.collectionName ?? DEFAULT_COLLECTION,
    );
    const leaseMs = options.leaseMs ?? 60_000;

    return {
        async schedule(record: Omit<TimeoutRecord, 'id'>): Promise<TimeoutRecord> {
            const result = await collection.insertOne({
                name: record.name,
                sagaCorrelationId: record.sagaCorrelationId,
                sagaDataType: record.sagaDataType,
                runAt: record.runAt,
                payload: record.payload,
            } as unknown as TimeoutDoc);
            return {
                id: String(result.insertedId),
                name: record.name,
                sagaCorrelationId: record.sagaCorrelationId,
                sagaDataType: record.sagaDataType,
                runAt: record.runAt,
                payload: record.payload,
            };
        },

        async claimDue(now: Date, limit: number): Promise<readonly TimeoutRecord[]> {
            // A record is claimable when it is due AND not currently leased (unclaimed or lease expired).
            const eligible = {
                runAt: { $lte: now },
                $or: [{ claimedUntil: { $exists: false } }, { claimedUntil: { $lte: now } }],
            };
            const candidates = await collection
                .find(eligible)
                .sort({ runAt: 1 })
                .limit(limit)
                .toArray();
            if (candidates.length === 0) return [];

            // Atomically lease the candidates with a token unique to this call. The conditional filter
            // means that under concurrency only one poller wins each record; the loser simply claims
            // fewer. We then read back exactly the records THIS call leased.
            const claimToken = new ObjectId().toHexString();
            const claimedUntil = new Date(now.getTime() + leaseMs);
            await collection.updateMany(
                { _id: { $in: candidates.map((c) => c._id) }, ...eligible },
                { $set: { claimedUntil, claimToken } },
            );
            const claimed = await collection.find({ claimToken }).sort({ runAt: 1 }).toArray();
            return claimed.map((d) => ({
                id: String(d._id),
                name: d.name,
                sagaCorrelationId: d.sagaCorrelationId,
                sagaDataType: d.sagaDataType,
                runAt: d.runAt,
                payload: d.payload,
            }));
        },

        async delete(id: string): Promise<void> {
            if (!ObjectId.isValid(id)) return;
            await collection.deleteOne({ _id: new ObjectId(id) });
        },

        async ensureIndexes(): Promise<void> {
            await collection.createIndex({ runAt: 1 });
            await collection.createIndex({ claimToken: 1 });
        },
    };
}
