import { runAggregatorStoreContract } from '@serviceconnect/core/testing';
import { memoryAggregatorStore } from '../src/aggregator-store.js';

runAggregatorStoreContract('memoryAggregatorStore', () => memoryAggregatorStore());
