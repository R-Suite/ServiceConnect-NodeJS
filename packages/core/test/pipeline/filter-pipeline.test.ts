import { describe, expect, it } from 'vitest';
import type { Envelope } from '../../src/envelope.js';
import { FilterPipeline } from '../../src/filter-pipeline.js';
import {
  type Filter,
  FilterAction,
  type Middleware,
  asFilter,
  asMiddleware,
} from '../../src/pipeline/index.js';

function envelope(): Envelope {
  return { headers: {}, body: new Uint8Array() };
}
const logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
};
const signal = new AbortController().signal;

describe('FilterPipeline', () => {
  it('with no items returns Continue', async () => {
    const pipe = new FilterPipeline('outgoing');
    const result = await pipe.execute(envelope(), { signal, logger });
    expect(result).toBe(FilterAction.Continue);
  });

  it('runs all filters in registration order and returns Continue when all continue', async () => {
    const seen: string[] = [];
    const f1: Filter = () => {
      seen.push('f1');
      return FilterAction.Continue;
    };
    const f2: Filter = () => {
      seen.push('f2');
      return FilterAction.Continue;
    };
    const pipe = new FilterPipeline('outgoing');
    pipe.add(asFilter(f1));
    pipe.add(asFilter(f2));
    const result = await pipe.execute(envelope(), { signal, logger });
    expect(seen).toEqual(['f1', 'f2']);
    expect(result).toBe(FilterAction.Continue);
  });

  it('halts on the first filter that returns Stop and skips later items', async () => {
    const seen: string[] = [];
    const f1: Filter = () => {
      seen.push('f1');
      return FilterAction.Stop;
    };
    const f2: Filter = () => {
      seen.push('f2');
      return FilterAction.Continue;
    };
    const m1: Middleware = async (_c, next) => {
      seen.push('m1');
      await next();
    };
    const pipe = new FilterPipeline('outgoing');
    pipe.add(asFilter(f1));
    pipe.add(asFilter(f2));
    pipe.add(asMiddleware(m1));
    const result = await pipe.execute(envelope(), { signal, logger });
    expect(seen).toEqual(['f1']);
    expect(result).toBe(FilterAction.Stop);
  });

  it('runs middleware after all filters when filters return Continue', async () => {
    const seen: string[] = [];
    const f1: Filter = () => {
      seen.push('f1');
      return FilterAction.Continue;
    };
    const m1: Middleware = async (_c, next) => {
      seen.push('m1');
      await next();
    };
    const pipe = new FilterPipeline('outgoing');
    pipe.add(asFilter(f1));
    pipe.add(asMiddleware(m1));
    const result = await pipe.execute(envelope(), { signal, logger });
    expect(seen).toEqual(['f1', 'm1']);
    expect(result).toBe(FilterAction.Continue);
  });

  it('propagates filter exception to the caller', async () => {
    const f1: Filter = () => {
      throw new Error('boom');
    };
    const pipe = new FilterPipeline('outgoing');
    pipe.add(asFilter(f1));
    await expect(pipe.execute(envelope(), { signal, logger })).rejects.toThrow('boom');
  });

  it('propagates middleware exception to the caller', async () => {
    const m1: Middleware = async () => {
      throw new Error('boom');
    };
    const pipe = new FilterPipeline('outgoing');
    pipe.add(asMiddleware(m1));
    await expect(pipe.execute(envelope(), { signal, logger })).rejects.toThrow('boom');
  });

  it('preserves the order of mixed registrations', async () => {
    const seen: string[] = [];
    const pipe = new FilterPipeline('outgoing');
    pipe.add(
      asFilter(() => {
        seen.push('f-a');
        return FilterAction.Continue;
      }),
    );
    pipe.add(
      asMiddleware(async (_c, next) => {
        seen.push('m-b');
        await next();
      }),
    );
    pipe.add(
      asFilter(() => {
        seen.push('f-c');
        return FilterAction.Continue;
      }),
    );
    pipe.add(
      asMiddleware(async (_c, next) => {
        seen.push('m-d');
        await next();
      }),
    );
    await pipe.execute(envelope(), { signal, logger });
    expect(seen).toEqual(['f-a', 'f-c', 'm-b', 'm-d']);
  });

  it('passes the supplied signal and logger through to middleware context', async () => {
    const captured: { signal?: AbortSignal; stage?: string } = {};
    const m: Middleware = async (ctx, next) => {
      captured.signal = ctx.signal;
      captured.stage = ctx.stage;
      await next();
    };
    const pipe = new FilterPipeline('beforeConsuming');
    pipe.add(asMiddleware(m));
    const ac = new AbortController();
    await pipe.execute(envelope(), { signal: ac.signal, logger });
    expect(captured.signal).toBe(ac.signal);
    expect(captured.stage).toBe('beforeConsuming');
  });
});
