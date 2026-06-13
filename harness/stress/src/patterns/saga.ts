import { randomUUID } from 'node:crypto';
import type {
    Bus,
    ISagaStore,
    ITimeoutStore,
    Message,
    ProcessContext,
    ProcessData,
    ProcessHandler,
} from '@serviceconnect/core';
import {
    type FlowDirection,
    type FlowResult,
    type PatternFlow,
    deferred,
    withTimeout,
} from '../lib/flow.js';

interface StressSagaState extends ProcessData {
    flowId: string;
    step: 'started' | 'completed';
}
interface StartSaga extends Message {
    flowId: string;
}
interface CompleteSaga extends Message {
    flowId: string;
}

export function saga(
    alphaSagaStore: ISagaStore,
    alphaTimeoutStore: ITimeoutStore,
    betaSagaStore: ISagaStore,
    betaTimeoutStore: ITimeoutStore,
): PatternFlow {
    const startType = `StartSaga-${randomUUID().slice(0, 6)}`;
    const completeType = `CompleteSaga-${randomUUID().slice(0, 6)}`;
    const stateName = `StressSagaState-${randomUUID().slice(0, 6)}`;
    const processName = 'StressSagaProcess';
    const pendingAlpha = new Map<string, ReturnType<typeof deferred<void>>>();
    const pendingBeta = new Map<string, ReturnType<typeof deferred<void>>>();
    let alpha: Bus | undefined;
    let beta: Bus | undefined;

    class OnStart implements ProcessHandler<StressSagaState, StartSaga> {
        async handle(msg: StartSaga, data: StressSagaState): Promise<void> {
            data.flowId = msg.flowId;
            data.step = 'started';
        }
        correlate(msg: StartSaga): string {
            return msg.flowId;
        }
    }

    class OnComplete implements ProcessHandler<StressSagaState, CompleteSaga> {
        private readonly pending: Map<string, ReturnType<typeof deferred<void>>>;
        constructor(pending: Map<string, ReturnType<typeof deferred<void>>>) {
            this.pending = pending;
        }
        async handle(msg: CompleteSaga, data: StressSagaState, ctx: ProcessContext): Promise<void> {
            data.step = 'completed';
            ctx.markComplete();
            this.pending.get(msg.flowId)?.resolve();
        }
        correlate(msg: CompleteSaga): string {
            return msg.flowId;
        }
    }

    return {
        name: 'saga',
        async register(a: Bus, b: Bus): Promise<void> {
            alpha = a;
            beta = b;
            a.registerProcessData<StressSagaState>(stateName)
                .registerProcess(processName, {
                    store: alphaSagaStore,
                    timeoutStore: alphaTimeoutStore,
                })
                .startsWith<StartSaga>(startType, new OnStart())
                .handles<CompleteSaga>(completeType, new OnComplete(pendingAlpha));
            b.registerProcessData<StressSagaState>(stateName)
                .registerProcess(processName, {
                    store: betaSagaStore,
                    timeoutStore: betaTimeoutStore,
                })
                .startsWith<StartSaga>(startType, new OnStart())
                .handles<CompleteSaga>(completeType, new OnComplete(pendingBeta));
        },
        async drive(direction: FlowDirection, flowTimeoutMs: number): Promise<FlowResult> {
            if (!alpha || !beta) throw new Error('saga.drive called before register');
            const flowId = randomUUID();
            const d = deferred<void>();
            const isAtoB = direction === 'alpha-to-beta';
            const target = isAtoB ? pendingBeta : pendingAlpha;
            target.set(flowId, d);
            const driver = isAtoB ? alpha : beta;
            // CompleteSaga is a non-start saga message: it is skipped if processed before the start has
            // persisted the saga. The consumer processes messages concurrently (prefetch), so the two
            // would otherwise race and CompleteSaga could be handled first and dropped. Wait for the saga
            // row to exist before publishing the completing event (the examples serialise the same way).
            const targetStore = isAtoB ? betaSagaStore : alphaSagaStore;
            const start = performance.now();
            try {
                await driver.publish<StartSaga>(startType, { correlationId: flowId, flowId });
                const persistDeadline = Date.now() + flowTimeoutMs;
                while (
                    !(await targetStore.findByCorrelationId<StressSagaState>(stateName, flowId)) &&
                    Date.now() < persistDeadline
                ) {
                    await new Promise((r) => setTimeout(r, 10));
                }
                await driver.publish<CompleteSaga>(completeType, { correlationId: flowId, flowId });
                await withTimeout(d.promise, flowTimeoutMs, 'saga');
                return { ok: true, durationMs: performance.now() - start };
            } catch (err) {
                return {
                    ok: false,
                    durationMs: performance.now() - start,
                    error: err instanceof Error ? err.message : String(err),
                };
            } finally {
                target.delete(flowId);
            }
        },
    };
}
