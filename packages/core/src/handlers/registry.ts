import type { ConsumeContext } from '../consume-context.js';
import type { Message } from '../message.js';
import type { Handler, HandlerClass, HandlerFn } from './index.js';

type ResolvedHandler = (message: Message, context: ConsumeContext) => Promise<void>;

interface Registration {
  readonly raw: Handler<Message>;
  resolve(context: ConsumeContext): ResolvedHandler;
}

export class HandlerRegistry {
  private readonly byType = new Map<string, Registration[]>();

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

  handlersFor(typeName: string, context: ConsumeContext): ResolvedHandler[] {
    const list = this.byType.get(typeName);
    if (!list) return [];
    return list.map((reg) => reg.resolve(context));
  }
}

function makeResolver(handler: Handler<Message>): Registration['resolve'] {
  if (typeof handler === 'function') {
    return () => handler as HandlerFn<Message> as ResolvedHandler;
  }
  if ('handle' in handler) {
    const inst = handler as HandlerClass<Message>;
    return () => inst.handle.bind(inst);
  }
  return (ctx) => {
    const resolved = handler.factory(ctx);
    if (typeof resolved === 'function') {
      return resolved as ResolvedHandler;
    }
    return resolved.handle.bind(resolved);
  };
}
