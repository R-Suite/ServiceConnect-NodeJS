import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createBus } from '../../src/bus.js';
import type { Message } from '../../src/message.js';
import type { ProcessData } from '../../src/persistence/saga-store.js';
import type { ProcessContext, ProcessHandler } from '../../src/process/handler.js';
import { fakeTransport } from '../../src/testing/fake-transport.js';
import { memorySagaStore } from '../helpers/memory-stubs.js';
import { memoryTimeoutStore } from '../helpers/memory-timeout-stub.js';

// Regression for bus.ts: each registered process must use ITS OWN saga + timeout store. With two
// processes registered against distinct stores, a message for ProcessA must persist its saga state
// and schedule its timeout in ProcessA's stores — not the last-registered process's stores.

interface StateA extends ProcessData {
    touchedBy: string;
}
interface StateB extends ProcessData {
    touchedBy: string;
}
interface StartA extends Message {
    key: string;
}
interface StartB extends Message {
    key: string;
}

class OnStartA implements ProcessHandler<StateA, StartA> {
    async handle(_msg: StartA, data: StateA, ctx: ProcessContext): Promise<void> {
        data.touchedBy = 'ProcessA';
        await ctx.requestTimeout('TimeoutA', new Date(Date.now() + 60_000));
    }
    correlate(msg: StartA): string {
        return msg.key;
    }
}
class OnStartB implements ProcessHandler<StateB, StartB> {
    async handle(_msg: StartB, data: StateB): Promise<void> {
        data.touchedBy = 'ProcessB';
    }
    correlate(msg: StartB): string {
        return msg.key;
    }
}

function envelope<T extends object>(messageType: string, body: T) {
    return {
        headers: { messageType, correlationId: 'c' },
        body: new TextEncoder().encode(JSON.stringify(body)),
    };
}

describe('multi-process: each process uses its own stores', () => {
    it("ProcessA's saga + timeout land in ProcessA's stores, not the last-registered ones", async () => {
        const transport = fakeTransport();
        const storeA = memorySagaStore();
        const tsA = memoryTimeoutStore();
        const storeB = memorySagaStore();
        const tsB = memoryTimeoutStore();

        const bus = createBus({
            transport,
            queue: { name: `q-${randomUUID().slice(0, 8)}` },
            timeoutPollIntervalMs: 100_000, // keep the poller idle while we inspect
        });

        bus.registerProcessData<StateA>('StateA')
            .registerProcess('ProcessA', { dataType: 'StateA', store: storeA, timeoutStore: tsA })
            .startsWith<StartA>('StartA', new OnStartA());
        bus.registerProcessData<StateB>('StateB')
            .registerProcess('ProcessB', { dataType: 'StateB', store: storeB, timeoutStore: tsB })
            .startsWith<StartB>('StartB', new OnStartB());

        await bus.start();

        const keyA = `a-${randomUUID().slice(0, 8)}`;
        const result = await transport.deliver(
            envelope<StartA>('StartA', { correlationId: 'c', key: keyA }),
        );
        expect(result.success).toBe(true);
        expect(result.notHandled).toBe(false);

        // Saga state lands in ProcessA's own store.
        expect(await storeA.findByCorrelationId<StateA>('StateA', keyA)).toBeDefined();
        expect((await storeA.findByCorrelationId<StateA>('StateA', keyA))?.data.touchedBy).toBe(
            'ProcessA',
        );
        expect(await storeB.findByCorrelationId<StateA>('StateA', keyA)).toBeUndefined();

        // Timeout scheduled into ProcessA's own timeout store.
        const farFuture = new Date(Date.now() + 10 * 60_000);
        expect(
            (await tsA.claimDue(farFuture, 100)).filter((r) => r.name === 'TimeoutA'),
        ).toHaveLength(1);
        expect(
            (await tsB.claimDue(farFuture, 100)).filter((r) => r.name === 'TimeoutA'),
        ).toHaveLength(0);

        await bus.stop();
    });
});
