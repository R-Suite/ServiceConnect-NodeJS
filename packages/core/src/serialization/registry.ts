import type { Message } from '../message.js';
import type { StandardSchemaV1 } from './standard-schema.js';

export interface MessageRegistration {
    readonly typeName: string;
    readonly schema?: StandardSchemaV1;
    readonly parents?: readonly string[];
}

export interface RegisterOptions<T extends Message = Message> {
    readonly schema?: StandardSchemaV1<T>;
    readonly parents?: readonly string[];
}

export interface IMessageTypeRegistry {
    register<T extends Message>(typeName: string, options?: RegisterOptions<T>): void;
    resolve(typeName: string): MessageRegistration | undefined;
    allRegisteredNames(): readonly string[];
    parentsOf(typeName: string): readonly string[];
}

function parentsEqual(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

export function createMessageTypeRegistry(): IMessageTypeRegistry {
    const entries = new Map<string, MessageRegistration>();

    return {
        register<T extends Message>(typeName: string, options?: RegisterOptions<T>): void {
            const existing = entries.get(typeName);
            const incomingSchema = options?.schema as StandardSchemaV1 | undefined;
            const incomingParents = options?.parents;

            if (existing) {
                if (existing.schema !== incomingSchema) {
                    throw new Error(
                        `type ${typeName} is already registered with a different schema`,
                    );
                }
                if (!parentsEqual(existing.parents, incomingParents)) {
                    throw new Error(
                        `type ${typeName} is already registered with different parents`,
                    );
                }
                return;
            }

            entries.set(typeName, {
                typeName,
                schema: incomingSchema,
                parents: incomingParents,
            });
        },
        resolve(typeName) {
            return entries.get(typeName);
        },
        allRegisteredNames() {
            return Object.freeze([...entries.keys()]);
        },
        parentsOf(typeName) {
            const entry = entries.get(typeName);
            return entry?.parents ?? [];
        },
    };
}

export type { IMessageSerializer } from './serializer.js';
