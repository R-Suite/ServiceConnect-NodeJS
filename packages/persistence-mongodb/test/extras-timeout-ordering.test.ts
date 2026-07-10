import type { Db } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

describe('mongoTimeoutStore extras', () => {
    it('claimDue with mixed runAt returns the oldest first up to the limit', async () => {
        const store = mongoTimeoutStore({
            db,
            collectionName: `tm-ord-${Math.random()}`,
        });
        const now = Date.now();
        const inputs = [
            { name: 'c', delta: -100 },
            { name: 'a', delta: -500 },
            { name: 'e', delta: -50 },
            { name: 'b', delta: -300 },
            { name: 'd', delta: -75 },
        ];
        for (const i of inputs) {
            await store.schedule({
                name: i.name,
                sagaCorrelationId: `c-${i.name}`,
                sagaDataType: 'D',
                runAt: new Date(now + i.delta),
            });
        }
        const due = await store.claimDue(new Date(), 3);
        expect(due.map((r) => r.name)).toEqual(['a', 'b', 'c']);
    });

    it('delete with an invalid ObjectId is a no-op (idempotent)', async () => {
        const store = mongoTimeoutStore({
            db,
            collectionName: `tm-del-${Math.random()}`,
        });
        await store.delete('not-an-objectid');
        await store.delete('aaaaaaaaaaaaaaaaaaaaaaaa');
    });
});
