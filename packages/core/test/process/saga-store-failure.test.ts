import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Bus } from '../../src/bus.js';
import { ConcurrencyError } from '../../src/errors.js';
import { consoleLogger } from '../../src/logger.js';
import type { Message } from '../../src/message.js';
import type { ISagaStore, ProcessData } from '../../src/persistence/saga-store.js';
import { runSagaBranch } from '../../src/process/dispatch.js';
import type { ProcessHandler } from '../../src/process/handler.js';
import { ProcessRegistry } from '../../src/process/registry.js';
import { memorySagaStore } from '../helpers/memory-stubs.js';

// Regression for the inverted terminalFailure predicate at process/dispatch.ts.
// A post-handler persistence failure (store.update/delete) is INFRASTRUCTURE — it must be
// retryable, exactly like a handler throw — not dead-lettered with zero retries. Only genuine
// poison messages (deserialization/validation) are terminal, which the saga branch never produces.

interface OrderState extends ProcessData {
    status: string;
}
interface PaymentReceived extends Message {
    orderId: string;
}

async function drive(opts: {
    wrapStore?: (base: ISagaStore) => ISagaStore;
    handle?: ProcessHandler<OrderState, PaymentReceived>['handle'];
}) {
    const dataType = `OrderState-${randomUUID()}`;
    const correlationId = `order-${randomUUID()}`;
    const processes = new ProcessRegistry();
    processes.registerDataType(dataType);
    processes.registerProcess('OrderProcess', { dataType });

    const base = memorySagaStore();
    await base.insert<OrderState>(dataType, { correlationId, status: 'pending' });
    const store = opts.wrapStore ? opts.wrapStore(base) : base;

    const handler: ProcessHandler<OrderState, PaymentReceived> = {
        handle:
            opts.handle ??
            (async (_m, data) => {
                data.status = 'paid';
            }),
        correlate: (m) => m.orderId,
    };
    processes.handles('OrderProcess', 'PaymentReceived', handler);

    const envelope = {
        headers: { messageType: 'PaymentReceived', correlationId: 'c-1' },
        body: new Uint8Array(),
    };
    return runSagaBranch(
        envelope as never,
        { orderId: correlationId },
        new AbortController().signal,
        {
            processes,
            store,
            bus: {} as Bus,
            logger: consoleLogger('fatal'),
        },
    );
}

describe('saga branch: post-handler store failures are retryable, not terminal', () => {
    it('generic store.update() error after a successful handler is retryable (terminalFailure false)', async () => {
        const outcome = await drive({
            wrapStore: (base) => ({
                ...base,
                update: async () => {
                    throw new Error('mongo network blip');
                },
            }),
        });
        expect(outcome.result?.success).toBe(false);
        expect(outcome.result?.terminalFailure).toBe(false);
        expect(outcome.result?.error?.message).toBe('mongo network blip');
    });

    it('generic store.delete() error after markComplete is retryable (terminalFailure false)', async () => {
        const outcome = await drive({
            handle: async (_m, _d, ctx) => ctx.markComplete(),
            wrapStore: (base) => ({
                ...base,
                delete: async () => {
                    throw new Error('mongo delete blip');
                },
            }),
        });
        expect(outcome.result?.success).toBe(false);
        expect(outcome.result?.terminalFailure).toBe(false);
    });

    it('ConcurrencyError on update stays retryable (terminalFailure false)', async () => {
        const outcome = await drive({
            wrapStore: (base) => ({
                ...base,
                update: async () => {
                    throw new ConcurrencyError('conflict');
                },
            }),
        });
        expect(outcome.result?.success).toBe(false);
        expect(outcome.result?.terminalFailure).toBe(false);
        expect(outcome.result?.error).toBeInstanceOf(ConcurrencyError);
    });

    it('handler throw remains retryable (terminalFailure false)', async () => {
        const outcome = await drive({
            handle: async () => {
                throw new Error('handler exploded');
            },
        });
        expect(outcome.result?.success).toBe(false);
        expect(outcome.result?.terminalFailure).toBe(false);
    });
});
