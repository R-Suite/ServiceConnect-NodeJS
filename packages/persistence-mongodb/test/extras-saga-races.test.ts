import { ConcurrencyError, DuplicateSagaError, type ProcessData } from '@serviceconnect/core';
import type { Db } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mongoSagaStore } from '../src/saga-store.js';
import { freshDb } from './helpers.js';

interface OrderState extends ProcessData {
  status: string;
}

let db: Db;

beforeAll(async () => {
  db = await freshDb();
});

afterAll(async () => {
  if (db) {
    await db.dropDatabase().catch(() => undefined);
  }
});

describe('mongoSagaStore concurrency races', () => {
  it('two parallel inserts with the same key: one succeeds, one throws DuplicateSagaError', async () => {
    const store = mongoSagaStore({ db, collectionName: `race-ins-${Math.random()}` });
    const id = 'o-race-ins';
    const insert = () =>
      store.insert<OrderState>('OrderState', { correlationId: id, status: 'new' });

    const [a, b] = await Promise.allSettled([insert(), insert()]);
    const fulfilled = [a, b].filter((r) => r.status === 'fulfilled');
    const rejected = [a, b].filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(DuplicateSagaError);
  });

  it('two parallel updates against the same token: one succeeds, one throws ConcurrencyError', async () => {
    const store = mongoSagaStore({ db, collectionName: `race-upd-${Math.random()}` });
    const id = 'o-race-upd';
    const token = await store.insert<OrderState>('OrderState', {
      correlationId: id,
      status: 'pending',
    });

    const update = (status: string) =>
      store.update<OrderState>('OrderState', { correlationId: id, status }, token);

    const [a, b] = await Promise.allSettled([update('paid'), update('cancelled')]);
    const fulfilled = [a, b].filter((r) => r.status === 'fulfilled');
    const rejected = [a, b].filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConcurrencyError);
  });

  it('successive updates with the rotated token succeed', async () => {
    const store = mongoSagaStore({ db, collectionName: `race-rot-${Math.random()}` });
    const id = 'o-rot';
    const t0 = await store.insert<OrderState>('OrderState', {
      correlationId: id,
      status: 'a',
    });
    const t1 = await store.update<OrderState>('OrderState', { correlationId: id, status: 'b' }, t0);
    const t2 = await store.update<OrderState>('OrderState', { correlationId: id, status: 'c' }, t1);
    expect(t2).not.toBe(t1);
    expect(t1).not.toBe(t0);
  });
});
