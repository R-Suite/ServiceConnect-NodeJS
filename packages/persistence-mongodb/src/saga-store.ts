import {
  ConcurrencyError,
  type ConcurrencyToken,
  DuplicateSagaError,
  type FoundSaga,
  type ISagaStore,
  type ProcessData,
} from '@serviceconnect/core';
import type { Collection, Db, MongoServerError } from 'mongodb';

export interface MongoSagaStore extends ISagaStore {
  ensureIndexes(): Promise<void>;
}

export interface MongoStoreOptions {
  db: Db;
  collectionName?: string;
}

interface SagaDoc {
  _id: { dataType: string; correlationId: string };
  data: ProcessData;
  version: number;
}

const DEFAULT_COLLECTION = 'serviceconnect.sagas';

export function mongoSagaStore(options: MongoStoreOptions): MongoSagaStore {
  const collection: Collection<SagaDoc> = options.db.collection<SagaDoc>(
    options.collectionName ?? DEFAULT_COLLECTION,
  );

  return {
    async findByCorrelationId<TData extends ProcessData>(
      dataType: string,
      correlationId: string,
    ): Promise<FoundSaga<TData> | undefined> {
      const doc = await collection.findOne({ _id: { dataType, correlationId } });
      if (!doc) return undefined;
      return {
        data: doc.data as TData,
        concurrencyToken: String(doc.version),
      };
    },

    async insert<TData extends ProcessData>(
      dataType: string,
      data: TData,
    ): Promise<ConcurrencyToken> {
      try {
        await collection.insertOne({
          _id: { dataType, correlationId: data.correlationId },
          data,
          version: 0,
        });
        return '0';
      } catch (err) {
        const mongoErr = err as MongoServerError;
        if (mongoErr?.code === 11000) {
          throw new DuplicateSagaError(`saga already exists for ${dataType}/${data.correlationId}`);
        }
        throw err;
      }
    },

    async update<TData extends ProcessData>(
      dataType: string,
      data: TData,
      expectedToken: ConcurrencyToken,
    ): Promise<ConcurrencyToken> {
      const expected = Number(expectedToken);
      const result = await collection.findOneAndUpdate(
        { _id: { dataType, correlationId: data.correlationId }, version: expected },
        { $set: { data }, $inc: { version: 1 } },
        { returnDocument: 'after' },
      );
      if (!result) {
        throw new ConcurrencyError(`concurrency conflict on ${dataType}/${data.correlationId}`);
      }
      return String(result.version);
    },

    async delete(dataType: string, correlationId: string): Promise<void> {
      await collection.deleteOne({ _id: { dataType, correlationId } });
    },

    async ensureIndexes(): Promise<void> {
      // compound `_id` is auto-indexed and uniquely enforced by MongoDB
    },
  };
}
