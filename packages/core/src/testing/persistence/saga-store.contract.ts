import { describe, expect, it } from 'vitest';
import { ConcurrencyError, DuplicateSagaError } from '../../errors.js';
import type { ISagaStore, ProcessData } from '../../persistence/saga-store.js';

interface FooData extends ProcessData {
    status: string;
    count: number;
}

export function runSagaStoreContract(label: string, factory: () => ISagaStore): void {
    describe(`ISagaStore contract: ${label}`, () => {
        it('findByCorrelationId returns undefined for unknown key', async () => {
            const store = factory();
            const result = await store.findByCorrelationId<FooData>('FooData', 'missing');
            expect(result).toBeUndefined();
        });

        it('insert + findByCorrelationId round-trip', async () => {
            const store = factory();
            const token = await store.insert<FooData>('FooData', {
                correlationId: 'c-1',
                status: 'new',
                count: 0,
            });
            expect(token).toBeTypeOf('string');
            expect(token.length).toBeGreaterThan(0);

            const found = await store.findByCorrelationId<FooData>('FooData', 'c-1');
            expect(found).toBeDefined();
            expect(found?.data).toEqual({ correlationId: 'c-1', status: 'new', count: 0 });
            expect(found?.concurrencyToken).toBe(token);
        });

        it('insert with duplicate correlationId throws DuplicateSagaError', async () => {
            const store = factory();
            await store.insert<FooData>('FooData', {
                correlationId: 'c-dup',
                status: 'a',
                count: 0,
            });
            await expect(
                store.insert<FooData>('FooData', { correlationId: 'c-dup', status: 'b', count: 1 }),
            ).rejects.toBeInstanceOf(DuplicateSagaError);
        });

        it('update with valid token succeeds and rotates the token', async () => {
            const store = factory();
            const token1 = await store.insert<FooData>('FooData', {
                correlationId: 'c-2',
                status: 'a',
                count: 0,
            });
            const token2 = await store.update<FooData>(
                'FooData',
                { correlationId: 'c-2', status: 'b', count: 1 },
                token1,
            );
            expect(token2).not.toBe(token1);

            const found = await store.findByCorrelationId<FooData>('FooData', 'c-2');
            expect(found?.data.status).toBe('b');
            expect(found?.concurrencyToken).toBe(token2);
        });

        it('update with stale token throws ConcurrencyError', async () => {
            const store = factory();
            const token1 = await store.insert<FooData>('FooData', {
                correlationId: 'c-3',
                status: 'a',
                count: 0,
            });
            await store.update<FooData>(
                'FooData',
                { correlationId: 'c-3', status: 'b', count: 1 },
                token1,
            );
            await expect(
                store.update<FooData>(
                    'FooData',
                    { correlationId: 'c-3', status: 'c', count: 2 },
                    token1,
                ),
            ).rejects.toBeInstanceOf(ConcurrencyError);
        });

        it('update of missing saga throws ConcurrencyError', async () => {
            const store = factory();
            await expect(
                store.update<FooData>(
                    'FooData',
                    { correlationId: 'c-missing', status: 'x', count: 0 },
                    'bogus-token',
                ),
            ).rejects.toBeInstanceOf(ConcurrencyError);
        });

        it('delete removes the saga and is idempotent on repeat', async () => {
            const store = factory();
            await store.insert<FooData>('FooData', {
                correlationId: 'c-del',
                status: 'a',
                count: 0,
            });
            await store.delete('FooData', 'c-del');
            const found = await store.findByCorrelationId<FooData>('FooData', 'c-del');
            expect(found).toBeUndefined();

            await store.delete('FooData', 'c-del');
        });

        it('different dataTypes have independent namespaces', async () => {
            const store = factory();
            await store.insert<FooData>('FooData', {
                correlationId: 'shared-id',
                status: 'foo',
                count: 0,
            });
            await store.insert<FooData>('BarData', {
                correlationId: 'shared-id',
                status: 'bar',
                count: 0,
            });
            const foo = await store.findByCorrelationId<FooData>('FooData', 'shared-id');
            const bar = await store.findByCorrelationId<FooData>('BarData', 'shared-id');
            expect(foo?.data.status).toBe('foo');
            expect(bar?.data.status).toBe('bar');
        });
    });
}
