import type { Logger } from '@serviceconnect/core';
import { describe, expect, it } from 'vitest';
// TimeoutPoller is internal to core (not re-exported); import it from source for this test.
import { TimeoutPoller } from '../../core/src/process/timeout-poller.js';
import { memoryTimeoutStore } from '../src/index.js';

// Regression: a single due timeout must be published exactly once, even when a tick's publish
// outlasts the poll interval. The poller's overlap guard plus the store's claim/lease prevent the
// previous double-fire.

const silentLogger: Logger = {
    trace: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    fatal: () => undefined,
    child: () => silentLogger,
};

describe('timeout poller does not double-fire', () => {
    it('publishes a single due timeout exactly once despite a slow publish', async () => {
        const store = memoryTimeoutStore();
        await store.schedule({
            name: 'OrderTimeout',
            sagaCorrelationId: 'corr-1',
            sagaDataType: 'OrderState',
            runAt: new Date(Date.now() - 1000),
            payload: {},
        });

        const publishesByCorr = new Map<string, number>();
        const poller = new TimeoutPoller({
            store,
            intervalMs: 20,
            logger: silentLogger,
            publish: async (_type, body) => {
                const corr = (body as { correlationId: string }).correlationId;
                publishesByCorr.set(corr, (publishesByCorr.get(corr) ?? 0) + 1);
                await new Promise((r) => setTimeout(r, 120)); // publish outlasts the 20ms interval
            },
        });

        poller.start();
        await new Promise((r) => setTimeout(r, 350));
        await poller.stop();

        expect(publishesByCorr.get('corr-1')).toBe(1);
    });
});
