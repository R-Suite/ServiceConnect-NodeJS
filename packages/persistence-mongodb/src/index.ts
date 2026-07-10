import { PACKAGE_NAME as CORE_NAME } from '@serviceconnect/core';

export const PACKAGE_NAME = '@serviceconnect/persistence-mongodb' as const;
export const CORE_DEPENDENCY = CORE_NAME;

export { mongoSagaStore } from './saga-store.js';
export type { MongoSagaStore, MongoStoreOptions } from './saga-store.js';

export { mongoAggregatorStore } from './aggregator-store.js';
export type { MongoAggregatorStore } from './aggregator-store.js';

export { mongoTimeoutStore } from './timeout-store.js';
export type { MongoTimeoutStore } from './timeout-store.js';
