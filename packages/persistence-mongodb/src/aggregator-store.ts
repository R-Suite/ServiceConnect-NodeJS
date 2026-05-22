import { randomUUID } from 'node:crypto';
import type { AggregatorClaim, IAggregatorStore, Message } from '@serviceconnect/core';
import type { Collection, Db, ObjectId } from 'mongodb';

export interface MongoAggregatorStore extends IAggregatorStore {
  ensureIndexes(): Promise<void>;
}

export interface MongoStoreOptions {
  db: Db;
  collectionName?: string;
}

interface AggregatorDoc {
  _id: ObjectId;
  aggregatorType: string;
  message: Message;
  appendedAt: Date;
  claimedBy: string | null;
  claimExpiresAt: Date | null;
}

const DEFAULT_COLLECTION = 'serviceconnect.aggregators';

function eligibleQuery(aggregatorType: string, now: Date): Record<string, unknown> {
  return {
    aggregatorType,
    $or: [{ claimedBy: null }, { claimExpiresAt: { $lt: now } }],
  };
}

export function mongoAggregatorStore(options: MongoStoreOptions): MongoAggregatorStore {
  const collection: Collection<AggregatorDoc> = options.db.collection<AggregatorDoc>(
    options.collectionName ?? DEFAULT_COLLECTION,
  );

  async function claim(
    aggregatorType: string,
    ids: ObjectId[],
    leaseMs: number,
  ): Promise<AggregatorClaim<Message> | undefined> {
    if (ids.length === 0) return undefined;
    const snapshotId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + leaseMs);
    const updateResult = await collection.updateMany(
      {
        _id: { $in: ids },
        $or: [{ claimedBy: null }, { claimExpiresAt: { $lt: now } }],
      },
      { $set: { claimedBy: snapshotId, claimExpiresAt: expiresAt } },
    );
    if (updateResult.modifiedCount === 0) return undefined;
    const leased = await collection
      .find({ claimedBy: snapshotId })
      .sort({ appendedAt: 1 })
      .toArray();
    if (leased.length === 0) return undefined;
    return {
      snapshotId,
      messages: leased.map((d) => d.message),
      aggregatorType,
    };
  }

  return {
    async appendAndClaim<T extends Message>(
      aggregatorType: string,
      message: T,
      batchSize: number,
      leaseMs: number,
    ): Promise<AggregatorClaim<T> | undefined> {
      const now = new Date();
      await collection.insertOne({
        aggregatorType,
        message,
        appendedAt: now,
        claimedBy: null,
        claimExpiresAt: null,
      } as unknown as AggregatorDoc);

      const candidates = await collection
        .find(eligibleQuery(aggregatorType, now))
        .sort({ appendedAt: 1 })
        .limit(batchSize)
        .toArray();
      if (candidates.length < batchSize) return undefined;

      const ids = candidates.map((d) => d._id);
      const result = await claim(aggregatorType, ids, leaseMs);
      return result as AggregatorClaim<T> | undefined;
    },

    async releaseSnapshot(snapshotId: string): Promise<void> {
      await collection.deleteMany({ claimedBy: snapshotId });
    },

    async expireDueLeases(
      aggregatorTimeouts: ReadonlyMap<string, number>,
      leaseMs: number,
    ): Promise<readonly AggregatorClaim<Message>[]> {
      const now = new Date();
      const out: AggregatorClaim<Message>[] = [];
      for (const [type, timeoutMs] of aggregatorTimeouts.entries()) {
        const oldest = await collection.findOne(eligibleQuery(type, now), {
          sort: { appendedAt: 1 },
        });
        if (!oldest) continue;
        if (now.getTime() - oldest.appendedAt.getTime() < timeoutMs) continue;

        const all = await collection
          .find(eligibleQuery(type, now))
          .sort({ appendedAt: 1 })
          .toArray();
        if (all.length === 0) continue;
        const result = await claim(
          type,
          all.map((d) => d._id),
          leaseMs,
        );
        if (result) out.push(result);
      }
      return out;
    },

    async ensureIndexes(): Promise<void> {
      await collection.createIndex({
        aggregatorType: 1,
        claimedBy: 1,
        appendedAt: 1,
      });
    },
  };
}
