import { runSagaStoreContract } from '@serviceconnect/core/testing';
import type { Db } from 'mongodb';
import { afterAll, beforeAll } from 'vitest';
import { mongoSagaStore } from '../src/saga-store.js';
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

runSagaStoreContract('mongoSagaStore', () => {
  const coll = `sagas-${Math.random().toString(36).slice(2, 8)}`;
  return mongoSagaStore({ db, collectionName: coll });
});
