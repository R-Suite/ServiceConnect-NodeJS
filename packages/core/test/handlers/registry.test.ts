import { describe, expect, it } from 'vitest';
import type { ConsumeContext } from '../../src/consume-context.js';
import type { Handler, HandlerClass, HandlerFn } from '../../src/handlers/index.js';
import { HandlerRegistry } from '../../src/handlers/registry.js';
import type { Message } from '../../src/message.js';

interface Foo extends Message {
  v: number;
}

function noopCtx(): ConsumeContext {
  // Tests don't invoke handlers; cast a minimal object.
  return {} as ConsumeContext;
}

describe('HandlerRegistry', () => {
  it('add() records a function handler', () => {
    const reg = new HandlerRegistry();
    const fn: HandlerFn<Foo> = async () => {};
    reg.add('Foo', fn);
    expect(reg.handlersFor('Foo', noopCtx())).toHaveLength(1);
  });

  it('add() records a class handler', () => {
    const reg = new HandlerRegistry();
    const cls: HandlerClass<Foo> = { async handle() {} };
    reg.add('Foo', cls);
    expect(reg.handlersFor('Foo', noopCtx())).toHaveLength(1);
  });

  it('multiple handlers for one type are returned in registration order', () => {
    const reg = new HandlerRegistry();
    const a: HandlerFn<Foo> = async () => {};
    const b: HandlerFn<Foo> = async () => {};
    reg.add('Foo', a);
    reg.add('Foo', b);
    const handlers = reg.handlersFor('Foo', noopCtx());
    expect(handlers).toHaveLength(2);
  });

  it('handlersFor unknown type returns empty array', () => {
    const reg = new HandlerRegistry();
    expect(reg.handlersFor('Nope', noopCtx())).toEqual([]);
  });

  it('isHandled reflects whether the type has at least one handler', () => {
    const reg = new HandlerRegistry();
    expect(reg.isHandled('Foo')).toBe(false);
    const fn: HandlerFn<Foo> = async () => {};
    reg.add('Foo', fn);
    expect(reg.isHandled('Foo')).toBe(true);
  });

  it('remove() removes by reference identity', () => {
    const reg = new HandlerRegistry();
    const a: HandlerFn<Foo> = async () => {};
    const b: HandlerFn<Foo> = async () => {};
    reg.add('Foo', a);
    reg.add('Foo', b);
    reg.remove('Foo', a);
    expect(reg.handlersFor('Foo', noopCtx())).toHaveLength(1);
    expect(reg.isHandled('Foo')).toBe(true);
  });

  it('remove() of a not-registered handler is a no-op', () => {
    const reg = new HandlerRegistry();
    const fn: HandlerFn<Foo> = async () => {};
    reg.remove('Foo', fn);
    expect(reg.isHandled('Foo')).toBe(false);
  });

  it('removing the last handler keeps isHandled false', () => {
    const reg = new HandlerRegistry();
    const fn: HandlerFn<Foo> = async () => {};
    reg.add('Foo', fn);
    reg.remove('Foo', fn);
    expect(reg.isHandled('Foo')).toBe(false);
    expect(reg.handlersFor('Foo', noopCtx())).toEqual([]);
  });

  it('handlersFor returns a function handler invokable directly', async () => {
    const reg = new HandlerRegistry();
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
    const reg = new HandlerRegistry();
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
    const reg = new HandlerRegistry();
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
});
