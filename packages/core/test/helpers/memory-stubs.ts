import { randomUUID } from 'node:crypto';
import { ConcurrencyError, DuplicateSagaError } from '../../src/errors.js';
import type {
  ConcurrencyToken,
  FoundSaga,
  ISagaStore,
  ProcessData,
} from '../../src/persistence/saga-store.js';

export function memorySagaStore(): ISagaStore {
  const rows = new Map<string, Map<string, { data: ProcessData; token: ConcurrencyToken }>>();
  const bucket = (t: string) => {
    let m = rows.get(t);
    if (!m) {
      m = new Map();
      rows.set(t, m);
    }
    return m;
  };
  return {
    async findByCorrelationId<T extends ProcessData>(
      dataType: string,
      correlationId: string,
    ): Promise<FoundSaga<T> | undefined> {
      const r = bucket(dataType).get(correlationId);
      if (!r) return undefined;
      return { data: structuredClone(r.data) as T, concurrencyToken: r.token };
    },
    async insert<T extends ProcessData>(dataType: string, data: T): Promise<ConcurrencyToken> {
      const b = bucket(dataType);
      if (b.has(data.correlationId)) {
        throw new DuplicateSagaError(`saga already exists for ${dataType}/${data.correlationId}`);
      }
      const token = randomUUID();
      b.set(data.correlationId, { data: structuredClone(data) as ProcessData, token });
      return token;
    },
    async update<T extends ProcessData>(
      dataType: string,
      data: T,
      expectedToken: ConcurrencyToken,
    ): Promise<ConcurrencyToken> {
      const b = bucket(dataType);
      const r = b.get(data.correlationId);
      if (!r || r.token !== expectedToken) {
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
