import { runTimeoutStoreContract } from '@serviceconnect/core/testing';
import type { Db } from 'mongodb';
import { afterAll, beforeAll } from 'vitest';
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

runTimeoutStoreContract('mongoTimeoutStore', () => {
    const coll = `timeouts-${Math.random().toString(36).slice(2, 8)}`;
    return mongoTimeoutStore({ db, collectionName: coll });
});
