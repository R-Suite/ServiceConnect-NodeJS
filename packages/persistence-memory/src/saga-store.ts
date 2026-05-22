import { randomUUID } from 'node:crypto';
import {
  ConcurrencyError,
  type ConcurrencyToken,
  DuplicateSagaError,
  type FoundSaga,
  type ISagaStore,
  type ProcessData,
} from '@serviceconnect/core';

interface StoredRow<TData extends ProcessData> {
  data: TData;
  token: ConcurrencyToken;
}

export function memorySagaStore(): ISagaStore {
  const byType = new Map<string, Map<string, StoredRow<ProcessData>>>();

  function bucket(dataType: string): Map<string, StoredRow<ProcessData>> {
    let m = byType.get(dataType);
    if (!m) {
      m = new Map();
      byType.set(dataType, m);
    }
    return m;
  }

  return {
    async findByCorrelationId<TData extends ProcessData>(
      dataType: string,
      correlationId: string,
    ): Promise<FoundSaga<TData> | undefined> {
      const row = bucket(dataType).get(correlationId);
      if (!row) return undefined;
      return {
        data: structuredClone(row.data) as TData,
        concurrencyToken: row.token,
      };
    },

    async insert<TData extends ProcessData>(
      dataType: string,
      data: TData,
    ): Promise<ConcurrencyToken> {
      const b = bucket(dataType);
      if (b.has(data.correlationId)) {
        throw new DuplicateSagaError(`saga already exists for ${dataType}/${data.correlationId}`);
      }
      const token = randomUUID();
      b.set(data.correlationId, { data: structuredClone(data) as ProcessData, token });
      return token;
    },

    async update<TData extends ProcessData>(
      dataType: string,
      data: TData,
      expectedToken: ConcurrencyToken,
    ): Promise<ConcurrencyToken> {
      const b = bucket(dataType);
      const row = b.get(data.correlationId);
      if (!row || row.token !== expectedToken) {
        throw new ConcurrencyError(`concurrency conflict on ${dataType}/${data.correlationId}`);
      }
      const next = randomUUID();
      b.set(data.correlationId, { data: structuredClone(data) as ProcessData, token: next });
      return next;
    },

    async delete(dataType: string, correlationId: string): Promise<void> {
      bucket(dataType).delete(correlationId);
    },
  };
}
