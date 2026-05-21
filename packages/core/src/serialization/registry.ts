import type { Message } from '../message.js';
import type { StandardSchemaV1 } from './standard-schema.js';

export interface MessageRegistration {
  readonly typeName: string;
  readonly schema?: StandardSchemaV1;
}

export interface IMessageTypeRegistry {
  register<T extends Message>(typeName: string, options?: { schema?: StandardSchemaV1<T> }): void;
  resolve(typeName: string): MessageRegistration | undefined;
  allRegisteredNames(): readonly string[];
}

export function createMessageTypeRegistry(): IMessageTypeRegistry {
  const entries = new Map<string, MessageRegistration>();

  return {
    register<T extends Message>(
      typeName: string,
      options?: { schema?: StandardSchemaV1<T> },
    ): void {
      const existing = entries.get(typeName);
      if (existing) {
        if (existing.schema !== options?.schema) {
          throw new Error(`type ${typeName} is already registered with a different schema`);
        }
        return;
      }
      entries.set(typeName, { typeName, schema: options?.schema as StandardSchemaV1 | undefined });
    },
    resolve(typeName) {
      return entries.get(typeName);
    },
    allRegisteredNames() {
      return Object.freeze([...entries.keys()]);
    },
  };
}
