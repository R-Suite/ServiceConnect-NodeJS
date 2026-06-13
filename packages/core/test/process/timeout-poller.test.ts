import { describe, expect, it, vi } from 'vitest';
import { consoleLogger } from '../../src/logger.js';
import type { ITimeoutStore, TimeoutRecord } from '../../src/persistence/timeout-store.js';
import { TimeoutPoller } from '../../src/process/timeout-poller.js';

function fakeStore(): ITimeoutStore & {
    records: TimeoutRecord[];
    deletes: string[];
} {
    const records: TimeoutRecord[] = [];
    const deletes: string[] = [];
    return {
        records,
        deletes,
        schedule: async (r) => {
            const stored: TimeoutRecord = { id: `t-${records.length}`, ...r };
            records.push(stored);
            return stored;
        },
        claimDue: async (now, limit) =>
            records
                .filter((r) => r.runAt.getTime() <= now.getTime())
                .filter((r) => !deletes.includes(r.id))
                .sort((a, b) => a.runAt.getTime() - b.runAt.getTime())
                .slice(0, limit),
        delete: async (id) => {
            deletes.push(id);
        },
    };
}

describe('TimeoutPoller', () => {
    it('publishes due timeouts as messages and deletes them on success', async () => {
        const store = fakeStore();
        const past = new Date(Date.now() - 1000);
        await store.schedule({
            name: 'payment-timeout',
            sagaCorrelationId: 'o-1',
            sagaDataType: 'OrderState',
            runAt: past,
        });

        const publishes: { type: string; body: object }[] = [];
        const poller = new TimeoutPoller({
            store,
            intervalMs: 5,
            logger: consoleLogger('fatal'),
            publish: async (type, body) => {
                publishes.push({ type, body });
            },
        });

        poller.start();
        await new Promise((r) => setTimeout(r, 50));
        await poller.stop();

        expect(publishes.length).toBeGreaterThanOrEqual(1);
        expect(publishes[0]?.type).toBe('payment-timeout');
        expect(publishes[0]?.body).toMatchObject({ correlationId: 'o-1' });
        expect(store.deletes).toHaveLength(publishes.length);
    });

    it('leaves the record on publish failure for the next tick to re-claim', async () => {
        const store = fakeStore();
        const past = new Date(Date.now() - 1000);
        await store.schedule({
            name: 't',
            sagaCorrelationId: 'o-1',
            sagaDataType: 'D',
            runAt: past,
        });
        let attempts = 0;
        const poller = new TimeoutPoller({
            store,
            intervalMs: 5,
            logger: consoleLogger('fatal'),
            publish: async () => {
                attempts++;
                if (attempts === 1) throw new Error('broker down');
            },
        });

        poller.start();
        await new Promise((r) => setTimeout(r, 60));
        await poller.stop();

        expect(attempts).toBeGreaterThanOrEqual(2);
        expect(store.deletes.length).toBe(attempts - 1);
    });

    it('stop is idempotent and awaits in-flight ticks', async () => {
        const store = fakeStore();
        const poller = new TimeoutPoller({
            store,
            intervalMs: 5,
            logger: consoleLogger('fatal'),
            publish: vi.fn(async () => {}),
        });
        poller.start();
        await poller.stop();
        await poller.stop();
    });

    it('payload fields are spread into the published body', async () => {
        const store = fakeStore();
        const past = new Date(Date.now() - 1000);
        await store.schedule({
            name: 'late',
            sagaCorrelationId: 'o-1',
            sagaDataType: 'D',
            runAt: past,
            payload: { reason: 'no-payment', attempts: 3 },
        });

        const publishes: { type: string; body: object }[] = [];
        const poller = new TimeoutPoller({
            store,
            intervalMs: 5,
            logger: consoleLogger('fatal'),
            publish: async (type, body) => {
                publishes.push({ type, body });
            },
        });
        poller.start();
        await new Promise((r) => setTimeout(r, 50));
        await poller.stop();

        expect(publishes[0]?.body).toMatchObject({
            correlationId: 'o-1',
            reason: 'no-payment',
            attempts: 3,
        });
    });
});
