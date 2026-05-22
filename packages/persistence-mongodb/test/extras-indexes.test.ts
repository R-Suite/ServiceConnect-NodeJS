import type { Db } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mongoAggregatorStore } from '../src/aggregator-store.js';
import { mongoSagaStore } from '../src/saga-store.js';
import { mongoTimeoutStore } from '../src/timeout-store.js';
import { freshDb } from './helpers.js';

let db: Db;

beforeAll(async () => {
  db = await freshDb();
});

afterAll(async () => {
  if (db) {
    await db.dropDatabase().catch(() => undefined);
  }
});

interface IndexEntry {
  key: Record<string, number | string>;
}

async function indexes(coll: string): Promise<IndexEntry[]> {
  return (await db.collection(coll).listIndexes().toArray()) as IndexEntry[];
}

function hasIndex(list: IndexEntry[], expected: Record<string, number>): boolean {
  return list.some((idx) => {
    const keys = Object.keys(expected);
    if (Object.keys(idx.key).length !== keys.length) return false;
    return keys.every((k) => idx.key[k] === expected[k]);
  });
}

describe('ensureIndexes()', () => {
  it('mongoSagaStore.ensureIndexes is a no-op (compound _id is auto-indexed)', async () => {
    const store = mongoSagaStore({ db, collectionName: 'idx-sagas' });
    await store.ensureIndexes();
    // Trigger collection creation by inserting and then reading indexes.
    await store.insert('Probe', { correlationId: 'probe-id' });
    const list = await indexes('idx-sagas');
    expect(list.some((idx) => '_id' in idx.key)).toBe(true);
  });

  it('mongoAggregatorStore.ensureIndexes creates the compound buffer index', async () => {
    const store = mongoAggregatorStore({ db, collectionName: 'idx-agg' });
    await store.ensureIndexes();
    const list = await indexes('idx-agg');
    expect(hasIndex(list, { aggregatorType: 1, claimedBy: 1, appendedAt: 1 })).toBe(true);
  });

  it('mongoTimeoutStore.ensureIndexes creates the runAt index', async () => {
    const store = mongoTimeoutStore({ db, collectionName: 'idx-tm' });
    await store.ensureIndexes();
    const list = await indexes('idx-tm');
    expect(hasIndex(list, { runAt: 1 })).toBe(true);
  });

  it('ensureIndexes is idempotent', async () => {
    const store = mongoAggregatorStore({ db, collectionName: 'idx-agg-2' });
    await store.ensureIndexes();
    await store.ensureIndexes();
    await store.ensureIndexes();
    const list = await indexes('idx-agg-2');
    expect(hasIndex(list, { aggregatorType: 1, claimedBy: 1, appendedAt: 1 })).toBe(true);
  });
});
