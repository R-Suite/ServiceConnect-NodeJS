import { runSagaStoreContract } from '@serviceconnect/core/testing';
import { memorySagaStore } from '../src/saga-store.js';

runSagaStoreContract('memorySagaStore', () => memorySagaStore());
