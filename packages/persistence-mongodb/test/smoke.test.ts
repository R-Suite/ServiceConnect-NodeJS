import { MongoClient } from 'mongodb';
import { describe, expect, it } from 'vitest';
import {
  CORE_DEPENDENCY,
  PACKAGE_NAME,
  mongoAggregatorStore,
  mongoSagaStore,
  mongoTimeoutStore,
} from '../src/index.js';

describe('@serviceconnect/persistence-mongodb public surface', () => {
  it('legacy probe constants are preserved', () => {
    expect(PACKAGE_NAME).toBe('@serviceconnect/persistence-mongodb');
    expect(CORE_DEPENDENCY).toBe('@serviceconnect/core');
  });

  it('factories construct against a connected Db and expose ensureIndexes', async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not set; check globalSetup');
    const client = await MongoClient.connect(uri);
    try {
      const db = client.db('smoke-construct');
      const saga = mongoSagaStore({ db });
      const agg = mongoAggregatorStore({ db });
      const tm = mongoTimeoutStore({ db });
      expect(typeof saga.ensureIndexes).toBe('function');
      expect(typeof agg.ensureIndexes).toBe('function');
      expect(typeof tm.ensureIndexes).toBe('function');
    } finally {
      await client.close();
    }
  });
});
