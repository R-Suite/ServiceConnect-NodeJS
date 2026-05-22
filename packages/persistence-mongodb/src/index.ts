export const PACKAGE_NAME = '@serviceconnect/persistence-mongodb' as const;

export { mongoSagaStore } from './saga-store.js';
export type { MongoSagaStore, MongoStoreOptions } from './saga-store.js';
