import type { ITimeoutStore, TimeoutRecord } from '@serviceconnect/core';
import { type Collection, type Db, ObjectId } from 'mongodb';

export interface MongoTimeoutStore extends ITimeoutStore {
  ensureIndexes(): Promise<void>;
}

export interface MongoStoreOptions {
  db: Db;
  collectionName?: string;
}

interface TimeoutDoc {
  _id: ObjectId;
  name: string;
  sagaCorrelationId: string;
  sagaDataType: string;
  runAt: Date;
  payload?: Readonly<Record<string, unknown>>;
}

const DEFAULT_COLLECTION = 'serviceconnect.timeouts';

export function mongoTimeoutStore(options: MongoStoreOptions): MongoTimeoutStore {
  const collection: Collection<TimeoutDoc> = options.db.collection<TimeoutDoc>(
    options.collectionName ?? DEFAULT_COLLECTION,
  );

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
      const docs = await collection
        .find({ runAt: { $lte: now } })
        .sort({ runAt: 1 })
        .limit(limit)
        .toArray();
      return docs.map((d) => ({
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
    },
  };
}
