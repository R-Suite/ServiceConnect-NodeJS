import {
    mongoAggregatorStore,
    mongoSagaStore,
    mongoTimeoutStore,
} from '@serviceconnect/persistence-mongodb';
import { MongoClient } from 'mongodb';
import type { PersistenceBundle } from './inmemory.js';

export async function mongoPersistence(uri: string, dbName: string): Promise<PersistenceBundle> {
    const client = await MongoClient.connect(uri);
    const db = client.db(dbName);
    const sagaStore = mongoSagaStore({ db });
    const aggregatorStore = mongoAggregatorStore({ db });
    const timeoutStore = mongoTimeoutStore({ db });
    await Promise.all([
        sagaStore.ensureIndexes(),
        aggregatorStore.ensureIndexes(),
        timeoutStore.ensureIndexes(),
    ]);
    return {
        sagaStore,
        aggregatorStore,
        timeoutStore,
        async dispose() {
            await db.dropDatabase().catch(() => undefined);
            await client.close();
        },
    };
}
