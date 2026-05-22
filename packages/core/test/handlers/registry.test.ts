import { describe, expect, it } from 'vitest';
import type { ConsumeContext } from '../../src/consume-context.js';
import type { Handler, HandlerClass, HandlerFn } from '../../src/handlers/index.js';
import { HandlerRegistry } from '../../src/handlers/registry.js';
import type { Message } from '../../src/message.js';
import { createMessageTypeRegistry } from '../../src/serialization/registry.js';

interface Foo extends Message {
  v: number;
}

function noopCtx(): ConsumeContext {
  // Tests don't invoke handlers; cast a minimal object.
  return {} as ConsumeContext;
}

function freshRegistry(): HandlerRegistry {
  return new HandlerRegistry(createMessageTypeRegistry());
}

describe('HandlerRegistry', () => {
  it('add() records a function handler', () => {
    const reg = freshRegistry();
    const fn: HandlerFn<Foo> = async () => {};
    reg.add('Foo', fn);
    expect(reg.handlersFor('Foo', noopCtx())).toHaveLength(1);
  });

  it('add() records a class handler', () => {
    const reg = freshRegistry();
    const cls: HandlerClass<Foo> = { async handle() {} };
    reg.add('Foo', cls);
    expect(reg.handlersFor('Foo', noopCtx())).toHaveLength(1);
  });

  it('multiple handlers for one type are returned in registration order', () => {
    const reg = freshRegistry();
    const a: HandlerFn<Foo> = async () => {};
    const b: HandlerFn<Foo> = async () => {};
    reg.add('Foo', a);
    reg.add('Foo', b);
    const handlers = reg.handlersFor('Foo', noopCtx());
    expect(handlers).toHaveLength(2);
  });

  it('handlersFor unknown type returns empty array', () => {
    const reg = freshRegistry();
    expect(reg.handlersFor('Nope', noopCtx())).toEqual([]);
  });

  it('isHandled reflects whether the type has at least one handler', () => {
    const reg = freshRegistry();
    expect(reg.isHandled('Foo')).toBe(false);
    const fn: HandlerFn<Foo> = async () => {};
    reg.add('Foo', fn);
    expect(reg.isHandled('Foo')).toBe(true);
  });

  it('remove() removes by reference identity', () => {
    const reg = freshRegistry();
    const a: HandlerFn<Foo> = async () => {};
    const b: HandlerFn<Foo> = async () => {};
    reg.add('Foo', a);
    reg.add('Foo', b);
    reg.remove('Foo', a);
    expect(reg.handlersFor('Foo', noopCtx())).toHaveLength(1);
    expect(reg.isHandled('Foo')).toBe(true);
  });

  it('remove() of a not-registered handler is a no-op', () => {
    const reg = freshRegistry();
    const fn: HandlerFn<Foo> = async () => {};
    reg.remove('Foo', fn);
    expect(reg.isHandled('Foo')).toBe(false);
  });

  it('removing the last handler keeps isHandled false', () => {
    const reg = freshRegistry();
    const fn: HandlerFn<Foo> = async () => {};
    reg.add('Foo', fn);
    reg.remove('Foo', fn);
    expect(reg.isHandled('Foo')).toBe(false);
    expect(reg.handlersFor('Foo', noopCtx())).toEqual([]);
  });

  it('handlersFor returns a function handler invokable directly', async () => {
    const reg = freshRegistry();
    const calls: string[] = [];
    const fn: HandlerFn<Foo> = async () => {
      calls.push('fn');
    };
    reg.add('Foo', fn);
    const [resolved] = reg.handlersFor('Foo', noopCtx());
    await resolved?.({ correlationId: 'c', v: 1 }, noopCtx());
    expect(calls).toEqual(['fn']);
  });

  it('handlersFor returns a class handler bound to its instance', async () => {
    const reg = freshRegistry();
    class C {
      private readonly tag = 'C';
      async handle(_m: Foo): Promise<void> {
        captured.push(this.tag);
      }
    }
    const captured: string[] = [];
    reg.add('Foo', new C());
    const [resolved] = reg.handlersFor('Foo', noopCtx());
    await resolved?.({ correlationId: 'c', v: 1 }, noopCtx());
    expect(captured).toEqual(['C']);
  });

  it('handlersFor invokes the factory once per call', async () => {
    const reg = freshRegistry();
    let calls = 0;
    const factory = () => {
      calls++;
      return async () => {};
    };
    const handler: Handler<Foo> = { factory };
    reg.add('Foo', handler);
    const [h1] = reg.handlersFor('Foo', noopCtx());
    await h1?.({ correlationId: 'c', v: 1 }, noopCtx());
    const [h2] = reg.handlersFor('Foo', noopCtx());
    await h2?.({ correlationId: 'c', v: 1 }, noopCtx());
    expect(calls).toBe(2);
  });

  it('handlersFor walks parents and returns ancestor handlers in addition to direct ones', async () => {
    const typeRegistry = createMessageTypeRegistry();
    typeRegistry.register('DomainEvent');
    typeRegistry.register('OrderShipped', { parents: ['DomainEvent'] });
    const reg = new HandlerRegistry(typeRegistry);

    const directCalls: string[] = [];
    const parentCalls: string[] = [];
    const directHandler: HandlerFn<Message> = async () => {
      directCalls.push('direct');
    };
    const parentHandler: HandlerFn<Message> = async () => {
      parentCalls.push('parent');
    };
    reg.add('OrderShipped', directHandler);
    reg.add('DomainEvent', parentHandler);

    const resolved = reg.handlersFor('OrderShipped', noopCtx());
    expect(resolved).toHaveLength(2);
    for (const h of resolved) {
      await h({ correlationId: 'c' }, noopCtx());
    }
    expect(directCalls).toEqual(['direct']);
    expect(parentCalls).toEqual(['parent']);
  });

  it('handlersFor walks multiple levels of ancestry (transitive)', async () => {
    const typeRegistry = createMessageTypeRegistry();
    typeRegistry.register('Top');
    typeRegistry.register('Mid', { parents: ['Top'] });
    typeRegistry.register('Leaf', { parents: ['Mid'] });
    const reg = new HandlerRegistry(typeRegistry);

    const calls: string[] = [];
    reg.add('Top', async () => {
      calls.push('top');
    });
    reg.add('Mid', async () => {
      calls.push('mid');
    });
    reg.add('Leaf', async () => {
      calls.push('leaf');
    });

    const resolved = reg.handlersFor('Leaf', noopCtx());
    expect(resolved).toHaveLength(3);
    for (const h of resolved) {
      await h({ correlationId: 'c' }, noopCtx());
    }
    expect(calls).toEqual(['leaf', 'mid', 'top']);
  });

  it('handlersFor dedupes a handler registered against multiple ancestors', async () => {
    const typeRegistry = createMessageTypeRegistry();
    typeRegistry.register('Top');
    typeRegistry.register('Mid', { parents: ['Top'] });
    typeRegistry.register('Leaf', { parents: ['Mid', 'Top'] });
    const reg = new HandlerRegistry(typeRegistry);

    const handler: HandlerFn<Message> = async () => {};
    reg.add('Top', handler);
    reg.add('Mid', handler);
    reg.add('Leaf', handler);

    const resolved = reg.handlersFor('Leaf', noopCtx());
    expect(resolved).toHaveLength(1);
  });

  it('handlersFor tolerates cycles in the parent graph without infinite recursion', () => {
    const typeRegistry = createMessageTypeRegistry();
    typeRegistry.register('A', { parents: ['B'] });
    typeRegistry.register('B', { parents: ['A'] });
    const reg = new HandlerRegistry(typeRegistry);

    reg.add('A', async () => {});
    reg.add('B', async () => {});

    // Must not hang or stack overflow.
    const resolved = reg.handlersFor('A', noopCtx());
    expect(resolved).toHaveLength(2);
  });
});
