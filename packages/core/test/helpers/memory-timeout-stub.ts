import { randomUUID } from 'node:crypto';
import type { ITimeoutStore, TimeoutRecord } from '../../src/persistence/timeout-store.js';

export function memoryTimeoutStore(): ITimeoutStore {
  const byId = new Map<string, TimeoutRecord>();
  return {
    async schedule(r) {
      const id = randomUUID();
      const stored: TimeoutRecord = { id, ...r };
      byId.set(id, stored);
      return stored;
    },
    async claimDue(now, limit) {
      const ms = now.getTime();
      const out: TimeoutRecord[] = [];
      for (const r of byId.values()) {
        if (r.runAt.getTime() <= ms) out.push(r);
      }
      out.sort((a, b) => a.runAt.getTime() - b.runAt.getTime());
      return out.slice(0, limit);
    },
    async delete(id) {
      byId.delete(id);
    },
  };
}
