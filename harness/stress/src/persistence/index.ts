import { randomUUID } from 'node:crypto';
import { type PersistenceBundle, inmemoryPersistence } from './inmemory.js';
import { mongoPersistence } from './mongo.js';

export type { PersistenceBundle };

export async function createPersistence(
    kind: 'inmemory' | 'mongo',
    mongoUri?: string,
): Promise<PersistenceBundle> {
    if (kind === 'inmemory') return inmemoryPersistence();
    if (!mongoUri) {
        throw new Error('mongo persistence requires --mongo <uri>');
    }
    return mongoPersistence(mongoUri, `stress-${randomUUID().slice(0, 8)}`);
}
