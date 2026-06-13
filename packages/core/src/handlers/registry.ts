import type { ConsumeContext } from '../consume-context.js';
import type { Message } from '../message.js';
import type { IMessageTypeRegistry } from '../serialization/registry.js';
import type { Handler, HandlerClass, HandlerFn } from './index.js';

type ResolvedHandler = (message: Message, context: ConsumeContext) => Promise<void>;

interface Registration {
    readonly raw: Handler<Message>;
    resolve(context: ConsumeContext): ResolvedHandler;
}

export class HandlerRegistry {
    private readonly byType = new Map<string, Registration[]>();

    constructor(private readonly typeRegistry: IMessageTypeRegistry) {}

    add<T extends Message>(typeName: string, handler: Handler<T>): void {
        const list = this.byType.get(typeName) ?? [];
        list.push({
            raw: handler as Handler<Message>,
            resolve: makeResolver(handler as Handler<Message>),
        });
        this.byType.set(typeName, list);
    }

    remove<T extends Message>(typeName: string, handler: Handler<T>): void {
        const list = this.byType.get(typeName);
        if (!list) return;
        const filtered = list.filter((r) => r.raw !== handler);
        if (filtered.length === 0) {
            this.byType.delete(typeName);
        } else {
            this.byType.set(typeName, filtered);
        }
    }

    isHandled(typeName: string): boolean {
        return (this.byType.get(typeName)?.length ?? 0) > 0;
    }

    /**
     * Returns handlers for `typeName` and all registered ancestor types (via the message-type
     * registry's parents links). Each handler instance is invoked at most once even when
     * registered against multiple ancestors. Cycles in the parent graph are tolerated.
     */
    handlersFor(typeName: string, context: ConsumeContext): ResolvedHandler[] {
        const resolved: ResolvedHandler[] = [];
        const seen = new Set<unknown>();
        const visited = new Set<string>();

        const walk = (currentType: string): void => {
            if (visited.has(currentType)) return;
            visited.add(currentType);
            const list = this.byType.get(currentType);
            if (list) {
                for (const reg of list) {
                    if (!seen.has(reg.raw)) {
                        seen.add(reg.raw);
                        resolved.push(reg.resolve(context));
                    }
                }
            }
            for (const parent of this.typeRegistry.parentsOf(currentType)) {
                walk(parent);
            }
        };
        walk(typeName);
        return resolved;
    }
}

function makeResolver(handler: Handler<Message>): Registration['resolve'] {
    if (typeof handler === 'function') {
        return () => handler as HandlerFn<Message> as ResolvedHandler;
    }
    if ('handle' in handler) {
        const inst = handler as HandlerClass<Message>;
        const bound = inst.handle.bind(inst);
        return () => bound;
    }
    return (ctx) => {
        const resolved = handler.factory(ctx);
        if (typeof resolved === 'function') {
            return resolved as ResolvedHandler;
        }
        return resolved.handle.bind(resolved);
    };
}
