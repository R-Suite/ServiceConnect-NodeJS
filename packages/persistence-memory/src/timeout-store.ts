import { randomUUID } from 'node:crypto';
import type { ITimeoutStore, TimeoutRecord } from '@serviceconnect/core';

export function memoryTimeoutStore(): ITimeoutStore {
  const byId = new Map<string, TimeoutRecord>();

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
      byId.set(id, stored);
      return stored;
    },

    async claimDue(now: Date, limit: number): Promise<readonly TimeoutRecord[]> {
      const ms = now.getTime();
      const due: TimeoutRecord[] = [];
      for (const rec of byId.values()) {
        if (rec.runAt.getTime() <= ms) due.push(rec);
      }
      due.sort((a, b) => a.runAt.getTime() - b.runAt.getTime());
      return due.slice(0, limit);
    },

    async delete(id: string): Promise<void> {
      byId.delete(id);
    },
  };
}
