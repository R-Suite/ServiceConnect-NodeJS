import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createBus } from '../../src/bus.js';
import type { Message } from '../../src/message.js';
import type { ProcessData } from '../../src/persistence/saga-store.js';
import type { ProcessContext, ProcessHandler } from '../../src/process/handler.js';
import { fakeTransport } from '../../src/testing/fake-transport.js';
import { memorySagaStore } from '../helpers/memory-stubs.js';
import { memoryTimeoutStore } from '../helpers/memory-timeout-stub.js';

// Regression for bus.ts timeout delivery: a saga timeout must be delivered point-to-point to the
// bus's OWN queue (which the bus always consumes), not published to a type fanout exchange whose
// binding may not exist for a type first seen at poll time — otherwise the timeout is silently lost.

interface OrderState extends ProcessData {
    status: string;
}
interface StartOrder extends Message {
    key: string;
}

class OnStart implements ProcessHandler<OrderState, StartOrder> {
    async handle(_msg: StartOrder, data: OrderState, ctx: ProcessContext): Promise<void> {
        data.status = 'pending';
        // Due in the past so the poller picks it up on its first tick.
        await ctx.requestTimeout('OrderTimeout', new Date(Date.now() - 1));
    }
    correlate(msg: StartOrder): string {
        return msg.key;
    }
}

describe('saga timeout is delivered to the bus own queue', () => {
    it('the poller sends the timeout to the own queue endpoint, not a fanout publish', async () => {
        const transport = fakeTransport();
        const queueName = `q-${randomUUID().slice(0, 8)}`;
        const bus = createBus({
            transport,
            queue: { name: queueName },
            timeoutPollIntervalMs: 20,
        });
        bus.registerProcessData<OrderState>('OrderState')
            .registerProcess('OrderProcess', {
                store: memorySagaStore(),
                timeoutStore: memoryTimeoutStore(),
            })
            .startsWith<StartOrder>('StartOrder', new OnStart());

        await bus.start();

        await transport.deliver({
            headers: { messageType: 'StartOrder', correlationId: 'c' },
            body: new TextEncoder().encode(JSON.stringify({ correlationId: 'c', key: 'k-1' })),
        });

        // Wait for a poll tick to deliver the (already-due) timeout.
        await vi.waitFor(
            () => {
                const delivered = transport.outbox.find(
                    (e) => e.operation === 'send' && e.typeName === 'OrderTimeout',
                );
                expect(delivered).toBeDefined();
            },
            { timeout: 2000, interval: 20 },
        );

        const delivered = transport.outbox.find(
            (e) => e.operation === 'send' && e.typeName === 'OrderTimeout',
        );
        // Point-to-point to the bus's own queue, never a fanout publish.
        expect(delivered?.endpoint).toBe(queueName);
        expect(
            transport.outbox.some(
                (e) => e.operation === 'publish' && e.typeName === 'OrderTimeout',
            ),
        ).toBe(false);

        await bus.stop();
    });
});
