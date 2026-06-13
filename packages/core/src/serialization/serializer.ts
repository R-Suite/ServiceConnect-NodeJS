import type { Message } from '../message.js';

export interface IMessageSerializer {
    serialize<T extends Message>(message: T): Uint8Array;
    deserialize<T extends Message>(bytes: Uint8Array, typeName: string): T;
}
