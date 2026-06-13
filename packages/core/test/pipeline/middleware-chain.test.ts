import { describe, expect, it } from 'vitest';
import type { Envelope } from '../../src/envelope.js';
import {
    type Middleware,
    type PipelineContext,
    composeMiddleware,
} from '../../src/pipeline/index.js';

function makeContext(): PipelineContext {
    const envelope: Envelope = { headers: {}, body: new Uint8Array() };
    return {
        envelope,
        stage: 'outgoing',
        signal: new AbortController().signal,
        logger: { trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {} },
    };
}

describe('composeMiddleware', () => {
    it('chain length 0 returns a no-op runner', async () => {
        const run = composeMiddleware([]);
        await expect(run(makeContext())).resolves.toBeUndefined();
    });

    it('chain length 1 runs and reaches the terminator', async () => {
        const calls: string[] = [];
        const mw: Middleware = async (_ctx, next) => {
            calls.push('before');
            await next();
            calls.push('after');
        };
        const run = composeMiddleware([mw]);
        await run(makeContext());
        expect(calls).toEqual(['before', 'after']);
    });

    it('chain length 3 runs in registration order with onion semantics', async () => {
        const calls: string[] = [];
        const a: Middleware = async (_ctx, next) => {
            calls.push('a-pre');
            await next();
            calls.push('a-post');
        };
        const b: Middleware = async (_ctx, next) => {
            calls.push('b-pre');
            await next();
            calls.push('b-post');
        };
        const c: Middleware = async (_ctx, next) => {
            calls.push('c-pre');
            await next();
            calls.push('c-post');
        };
        const run = composeMiddleware([a, b, c]);
        await run(makeContext());
        expect(calls).toEqual(['a-pre', 'b-pre', 'c-pre', 'c-post', 'b-post', 'a-post']);
    });

    it('throwing middleware propagates to the caller', async () => {
        const a: Middleware = async (_ctx, next) => {
            await next();
        };
        const b: Middleware = async () => {
            throw new Error('boom');
        };
        const run = composeMiddleware([a, b]);
        await expect(run(makeContext())).rejects.toThrow('boom');
    });

    it('middleware that never calls next short-circuits the chain', async () => {
        const calls: string[] = [];
        const a: Middleware = async (_ctx, next) => {
            calls.push('a-pre');
            await next();
            calls.push('a-post');
        };
        const b: Middleware = async () => {
            calls.push('b-stop');
        };
        const c: Middleware = async (_ctx, next) => {
            calls.push('c-pre');
            await next();
        };
        const run = composeMiddleware([a, b, c]);
        await run(makeContext());
        expect(calls).toEqual(['a-pre', 'b-stop', 'a-post']);
    });

    it('middleware that calls next() twice throws', async () => {
        const mw: Middleware = async (_ctx, next) => {
            await next();
            await next();
        };
        const run = composeMiddleware([mw]);
        await expect(run(makeContext())).rejects.toThrow(/next\(\) called multiple times/);
    });

    it('passes the same context through every middleware', async () => {
        const seen: PipelineContext[] = [];
        const a: Middleware = async (ctx, next) => {
            seen.push(ctx);
            await next();
        };
        const b: Middleware = async (ctx, next) => {
            seen.push(ctx);
            await next();
        };
        const ctx = makeContext();
        await composeMiddleware([a, b])(ctx);
        expect(seen).toEqual([ctx, ctx]);
    });
});
