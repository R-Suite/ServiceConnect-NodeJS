import { describe, expect, it, vi } from 'vitest';
import type { Bus } from '../../src/bus.js';
import { TerminalDeserializationError, ValidationError } from '../../src/errors.js';
import { FilterPipeline } from '../../src/filter-pipeline.js';
import { createDispatcher } from '../../src/handlers/dispatch.js';
import { HandlerRegistry } from '../../src/handlers/registry.js';
import { consoleLogger } from '../../src/logger.js';
import type { Message, MessageHeaders } from '../../src/message.js';
import { FilterAction, asFilter, asMiddleware } from '../../src/pipeline/index.js';
import { jsonSerializer } from '../../src/serialization/json.js';
import { createMessageTypeRegistry } from '../../src/serialization/registry.js';

interface Foo extends Message {
  v: number;
}

function setup() {
  const registry = createMessageTypeRegistry();
  registry.register<Foo>('Foo');
  const serializer = jsonSerializer(registry);
  const handlers = new HandlerRegistry();
  const before = new FilterPipeline('beforeConsuming');
  const after = new FilterPipeline('afterConsuming');
  const success = new FilterPipeline('onConsumedSuccessfully');
  const logger = consoleLogger('fatal');
  const bus = {} as Bus;
  const dispatch = createDispatcher({
    bus,
    logger,
    registry,
    serializer,
    handlers,
    pipelines: { before, after, onSuccess: success },
  });
  return { registry, serializer, handlers, before, after, success, dispatch };
}

function envelopeFor(typeName: string, message: object, extra: Partial<MessageHeaders> = {}) {
  return {
    headers: { messageType: typeName, correlationId: 'cor-1', ...extra },
    body: new TextEncoder().encode(JSON.stringify(message)),
  };
}

describe('dispatcher', () => {
  it('unknown message type: returns notHandled=true, success=true', async () => {
    const { dispatch } = setup();
    const result = await dispatch(
      envelopeFor('UnknownType', { x: 1 }),
      new AbortController().signal,
    );
    expect(result).toEqual({ success: true, notHandled: true, terminalFailure: false });
  });

  it('known type with no handlers: returns notHandled=true, success=true', async () => {
    const { dispatch } = setup();
    const result = await dispatch(
      envelopeFor('Foo', { correlationId: 'c', v: 1 }),
      new AbortController().signal,
    );
    expect(result.notHandled).toBe(true);
    expect(result.success).toBe(true);
  });

  it('beforeConsuming filter Stop: handlers not called; success=true, notHandled=false', async () => {
    const { dispatch, handlers, before } = setup();
    const handler = vi.fn(async () => {});
    handlers.add('Foo', handler);
    before.add(asFilter(() => FilterAction.Stop));
    const result = await dispatch(
      envelopeFor('Foo', { correlationId: 'c', v: 1 }),
      new AbortController().signal,
    );
    expect(handler).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.notHandled).toBe(false);
  });

  it('beforeConsuming filter throws: success=false, retry', async () => {
    const { dispatch, handlers, before } = setup();
    handlers.add('Foo', async () => {});
    before.add(
      asFilter(() => {
        throw new Error('before-boom');
      }),
    );
    const result = await dispatch(
      envelopeFor('Foo', { correlationId: 'c', v: 1 }),
      new AbortController().signal,
    );
    expect(result.success).toBe(false);
    expect(result.terminalFailure).toBe(false);
    expect(result.error?.message).toContain('before-boom');
  });

  it('deserialization fails: success=false, terminalFailure=true', async () => {
    const { dispatch, handlers } = setup();
    handlers.add('Foo', async () => {});
    const garbage = {
      headers: { messageType: 'Foo', correlationId: 'c' },
      body: new TextEncoder().encode('not json'),
    };
    const result = await dispatch(garbage, new AbortController().signal);
    expect(result.success).toBe(false);
    expect(result.terminalFailure).toBe(true);
    expect(result.error).toBeInstanceOf(TerminalDeserializationError);
  });

  it('schema-validation fails: success=false, terminalFailure=true (ValidationError)', async () => {
    const { dispatch, handlers, registry } = setup();
    registry.register('Bar', {
      schema: {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: (v) => {
            const value = v as Record<string, unknown>;
            if (typeof value.v !== 'number') return { issues: [{ message: 'v must be number' }] };
            return { value: value as Foo };
          },
        },
      },
    });
    handlers.add('Bar', async () => {});
    const envelope = {
      headers: { messageType: 'Bar', correlationId: 'c' },
      body: new TextEncoder().encode(JSON.stringify({ correlationId: 'c', v: 'no' })),
    };
    const result = await dispatch(envelope, new AbortController().signal);
    expect(result.success).toBe(false);
    expect(result.terminalFailure).toBe(true);
    expect(result.error).toBeInstanceOf(ValidationError);
  });

  it('handler throws: success=false, terminalFailure=false (retry)', async () => {
    const { dispatch, handlers } = setup();
    handlers.add('Foo', async () => {
      throw new Error('handler-boom');
    });
    const result = await dispatch(
      envelopeFor('Foo', { correlationId: 'c', v: 1 }),
      new AbortController().signal,
    );
    expect(result.success).toBe(false);
    expect(result.terminalFailure).toBe(false);
    expect(result.error?.message).toContain('handler-boom');
  });

  it('multiple handlers run in registration order; if handler 1 throws, handler 2 does NOT run', async () => {
    const { dispatch, handlers } = setup();
    const calls: string[] = [];
    handlers.add('Foo', async () => {
      calls.push('h1');
      throw new Error('h1-boom');
    });
    handlers.add('Foo', async () => {
      calls.push('h2');
    });
    const result = await dispatch(
      envelopeFor('Foo', { correlationId: 'c', v: 1 }),
      new AbortController().signal,
    );
    expect(calls).toEqual(['h1']);
    expect(result.success).toBe(false);
  });

  it('onConsumedSuccessfully runs after handler success', async () => {
    const { dispatch, handlers, success } = setup();
    const calls: string[] = [];
    handlers.add('Foo', async () => {
      calls.push('handler');
    });
    success.add(
      asMiddleware(async (_c, next) => {
        calls.push('success-mw');
        await next();
      }),
    );
    const result = await dispatch(
      envelopeFor('Foo', { correlationId: 'c', v: 1 }),
      new AbortController().signal,
    );
    expect(calls).toEqual(['handler', 'success-mw']);
    expect(result.success).toBe(true);
  });

  it('onConsumedSuccessfully does NOT run when handler throws', async () => {
    const { dispatch, handlers, success } = setup();
    handlers.add('Foo', async () => {
      throw new Error('boom');
    });
    const successCall = vi.fn(async (_c, next) => {
      await next();
    });
    success.add(asMiddleware(successCall));
    const result = await dispatch(
      envelopeFor('Foo', { correlationId: 'c', v: 1 }),
      new AbortController().signal,
    );
    expect(successCall).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  it('onConsumedSuccessfully throw flips result to failure', async () => {
    const { dispatch, handlers, success } = setup();
    handlers.add('Foo', async () => {});
    success.add(
      asMiddleware(async () => {
        throw new Error('success-boom');
      }),
    );
    const result = await dispatch(
      envelopeFor('Foo', { correlationId: 'c', v: 1 }),
      new AbortController().signal,
    );
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('success-boom');
  });

  it('afterConsuming throw is logged at warn and does not flip result', async () => {
    const { dispatch, handlers, after } = setup();
    handlers.add('Foo', async () => {});
    after.add(
      asMiddleware(async () => {
        throw new Error('after-boom');
      }),
    );
    const result = await dispatch(
      envelopeFor('Foo', { correlationId: 'c', v: 1 }),
      new AbortController().signal,
    );
    expect(result.success).toBe(true);
  });

  it('afterConsuming runs even when handler throws', async () => {
    const { dispatch, handlers, after } = setup();
    handlers.add('Foo', async () => {
      throw new Error('handler-boom');
    });
    const afterCall = vi.fn(async (_c, next) => {
      await next();
    });
    after.add(asMiddleware(afterCall));
    await dispatch(envelopeFor('Foo', { correlationId: 'c', v: 1 }), new AbortController().signal);
    expect(afterCall).toHaveBeenCalledOnce();
  });
});
