import { randomUUID } from 'node:crypto';
import type { AggregatorClaim, IAggregatorStore, Message } from '@serviceconnect/core';

interface BufferedEntry {
  message: Message;
  appendedAt: Date;
}

interface Bucket {
  buffer: BufferedEntry[];
  lease?: { snapshotId: string; expiresAt: Date };
}

export function memoryAggregatorStore(): IAggregatorStore {
  const byType = new Map<string, Bucket>();
  const snapshotIndex = new Map<string, string>();

  function bucket(t: string): Bucket {
    let b = byType.get(t);
    if (!b) {
      b = { buffer: [] };
      byType.set(t, b);
    }
    return b;
  }

  function takeClaim(
    aggregatorType: string,
    count: number,
    leaseMs: number,
  ): AggregatorClaim<Message> {
    const b = bucket(aggregatorType);
    const taken = b.buffer.splice(0, count).map((e) => e.message);
    const snapshotId = randomUUID();
    b.lease = { snapshotId, expiresAt: new Date(Date.now() + leaseMs) };
    snapshotIndex.set(snapshotId, aggregatorType);
    return { snapshotId, messages: taken, aggregatorType };
  }

  return {
    async appendAndClaim<T extends Message>(
      aggregatorType: string,
      message: T,
      batchSize: number,
      leaseMs: number,
    ): Promise<AggregatorClaim<T> | undefined> {
      const b = bucket(aggregatorType);
      b.buffer.push({ message, appendedAt: new Date() });
      if (b.buffer.length < batchSize) return undefined;
      return takeClaim(aggregatorType, batchSize, leaseMs) as AggregatorClaim<T>;
    },

    async releaseSnapshot(snapshotId: string): Promise<void> {
      const t = snapshotIndex.get(snapshotId);
      if (!t) return;
      snapshotIndex.delete(snapshotId);
      const b = byType.get(t);
      if (b?.lease?.snapshotId === snapshotId) {
        b.lease = undefined;
      }
    },

    async expireDueLeases(
      aggregatorTimeouts: ReadonlyMap<string, number>,
      leaseMs: number,
    ): Promise<readonly AggregatorClaim<Message>[]> {
      const now = Date.now();
      const out: AggregatorClaim<Message>[] = [];
      for (const [type, b] of byType.entries()) {
        if (b.lease && b.lease.expiresAt.getTime() > now) continue;
        if (b.buffer.length === 0) continue;
        const timeoutMs = aggregatorTimeouts.get(type);
        if (timeoutMs === undefined) continue;
        const oldest = b.buffer[0]?.appendedAt.getTime() ?? now;
        if (now - oldest < timeoutMs) continue;
        out.push(takeClaim(type, b.buffer.length, leaseMs));
      }
      return out;
    },
  };
}
