import { describe, expect, it } from 'vitest';
import type { ITimeoutStore } from '../../persistence/timeout-store.js';

export function runTimeoutStoreContract(label: string, factory: () => ITimeoutStore): void {
    describe(`ITimeoutStore contract: ${label}`, () => {
        it('schedule returns a record with an id', async () => {
            const store = factory();
            const r = await store.schedule({
                name: 'payment-timeout',
                sagaCorrelationId: 'c-1',
                sagaDataType: 'OrderState',
                runAt: new Date(Date.now() + 60_000),
            });
            expect(r.id).toBeTypeOf('string');
            expect(r.name).toBe('payment-timeout');
        });

        it('claimDue returns nothing when no records are due', async () => {
            const store = factory();
            await store.schedule({
                name: 't1',
                sagaCorrelationId: 'c-1',
                sagaDataType: 'D',
                runAt: new Date(Date.now() + 60_000),
            });
            const due = await store.claimDue(new Date(), 10);
            expect(due).toHaveLength(0);
        });

        it('claimDue returns records with runAt <= now', async () => {
            const store = factory();
            const past = new Date(Date.now() - 1000);
            const future = new Date(Date.now() + 60_000);
            await store.schedule({
                name: 'old',
                sagaCorrelationId: 'c-1',
                sagaDataType: 'D',
                runAt: past,
            });
            await store.schedule({
                name: 'new',
                sagaCorrelationId: 'c-2',
                sagaDataType: 'D',
                runAt: future,
            });
            const due = await store.claimDue(new Date(), 10);
            expect(due).toHaveLength(1);
            expect(due[0]?.name).toBe('old');
        });

        it('claimDue honours the limit parameter', async () => {
            const store = factory();
            const past = new Date(Date.now() - 1000);
            for (let i = 0; i < 5; i++) {
                await store.schedule({
                    name: `t${i}`,
                    sagaCorrelationId: `c-${i}`,
                    sagaDataType: 'D',
                    runAt: past,
                });
            }
            const due = await store.claimDue(new Date(), 3);
            expect(due).toHaveLength(3);
        });

        it('claimDue returns records ordered by runAt ascending', async () => {
            const store = factory();
            const now = Date.now();
            await store.schedule({
                name: 'b',
                sagaCorrelationId: 'c-b',
                sagaDataType: 'D',
                runAt: new Date(now - 100),
            });
            await store.schedule({
                name: 'a',
                sagaCorrelationId: 'c-a',
                sagaDataType: 'D',
                runAt: new Date(now - 300),
            });
            const due = await store.claimDue(new Date(), 10);
            expect(due.map((r) => r.name)).toEqual(['a', 'b']);
        });

        it('delete removes the record and is idempotent', async () => {
            const store = factory();
            const r = await store.schedule({
                name: 't',
                sagaCorrelationId: 'c-1',
                sagaDataType: 'D',
                runAt: new Date(Date.now() - 1000),
            });
            await store.delete(r.id);
            await store.delete(r.id);
            const due = await store.claimDue(new Date(), 10);
            expect(due).toHaveLength(0);
        });

        it('claimDue claims records: an immediately-following claim does not see them again', async () => {
            const store = factory();
            const past = new Date(Date.now() - 1000);
            await store.schedule({
                name: 't',
                sagaCorrelationId: 'c-1',
                sagaDataType: 'D',
                runAt: past,
            });

            const first = await store.claimDue(new Date(), 10);
            expect(first).toHaveLength(1);

            // The record was not deleted, but the first claim leased it, so a second claim (another
            // poller, or an overlapping tick) must not receive the same record again.
            const second = await store.claimDue(new Date(), 10);
            expect(second).toHaveLength(0);
        });

        it('payload is preserved on schedule and returned by claimDue', async () => {
            const store = factory();
            await store.schedule({
                name: 't',
                sagaCorrelationId: 'c-1',
                sagaDataType: 'D',
                runAt: new Date(Date.now() - 1000),
                payload: { kind: 'late' },
            });
            const due = await store.claimDue(new Date(), 10);
            expect(due[0]?.payload).toEqual({ kind: 'late' });
        });
    });
}
