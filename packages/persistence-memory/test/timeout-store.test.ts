import { runTimeoutStoreContract } from '@serviceconnect/core/testing';
import { memoryTimeoutStore } from '../src/timeout-store.js';

runTimeoutStoreContract('memoryTimeoutStore', () => memoryTimeoutStore());
