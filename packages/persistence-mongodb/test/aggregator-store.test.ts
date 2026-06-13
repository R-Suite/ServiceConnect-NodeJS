import { runAggregatorStoreContract } from '@serviceconnect/core/testing';
import type { Db } from 'mongodb';
import { afterAll, beforeAll } from 'vitest';
import { mongoAggregatorStore } from '../src/aggregator-store.js';
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

runAggregatorStoreContract('mongoAggregatorStore', () => {
    const coll = `aggregators-${Math.random().toString(36).slice(2, 8)}`;
    return mongoAggregatorStore({ db, collectionName: coll });
});
