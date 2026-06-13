import { describe, expect, it, vi } from 'vitest';
import type { Bus } from '../../src/bus.js';
import { ConcurrencyError } from '../../src/errors.js';
import { FilterPipeline } from '../../src/filter-pipeline.js';
import { createDispatcher } from '../../src/handlers/dispatch.js';
import { HandlerRegistry } from '../../src/handlers/registry.js';
import { consoleLogger } from '../../src/logger.js';
import type { Message } from '../../src/message.js';
import type { ProcessData } from '../../src/persistence/saga-store.js';
import { runSagaBranch } from '../../src/process/dispatch.js';
import type { ProcessContext, ProcessHandler } from '../../src/process/handler.js';
import { ProcessRegistry } from '../../src/process/registry.js';
import { jsonSerializer } from '../../src/serialization/json.js';
import { createMessageTypeRegistry } from '../../src/serialization/registry.js';
import { memorySagaStore } from '../helpers/memory-stubs.js';

interface OrderState extends ProcessData {
    status: string;
}

interface OrderCreated extends Message {
    orderId: string;
}

interface PaymentReceived extends Message {
    orderId: string;
}

function setup() {
    const typeRegistry = createMessageTypeRegistry();
    typeRegistry.register('OrderCreated');
    typeRegistry.register('PaymentReceived');
    const handlers = new HandlerRegistry(typeRegistry);
    const processes = new ProcessRegistry();
    processes.registerDataType('OrderState');
    processes.registerProcess('OrderProcess', { dataType: 'OrderState' });

    const store = memorySagaStore();
    const before = new FilterPipeline('beforeConsuming');
    const after = new FilterPipeline('afterConsuming');
    const success = new FilterPipeline('onConsumedSuccessfully');
    const logger = consoleLogger('fatal');
    const bus = {} as Bus;

    const dispatch = createDispatcher({
        bus,
        logger,
        registry: typeRegistry,
        serializer: jsonSerializer(typeRegistry),
        handlers,
        pipelines: { before, after, onSuccess: success },
        sagaBranch: (env, msg, ctx) =>
            runSagaBranch(env, msg, ctx, { processes, store, bus, logger }),
    });

    return { typeRegistry, handlers, processes, store, dispatch };
}

function envelope(messageType: string, body: object, headers: Record<string, string> = {}) {
    return {
        headers: { messageType, correlationId: 'c-1', ...headers },
        body: new TextEncoder().encode(JSON.stringify(body)),
    };
}

describe('saga branch in dispatcher', () => {
    it('start: inserts a new saga when no row exists and isStart=true', async () => {
        const { processes, store, dispatch } = setup();
        const h: ProcessHandler<OrderState, OrderCreated> = {
            async handle(_msg, data) {
                data.status = 'pending';
            },
            correlate: (m) => m.orderId,
        };
        processes.startsWith('OrderProcess', 'OrderCreated', h);

        const result = await dispatch(
            envelope('OrderCreated', { correlationId: 'c-1', orderId: 'o-1' }),
            new AbortController().signal,
        );

        expect(result.success).toBe(true);
        const found = await store.findByCorrelationId<OrderState>('OrderState', 'o-1');
        expect(found?.data.status).toBe('pending');
    });

    it('handles: skips when no saga exists (notHandled=true)', async () => {
        const { processes, dispatch } = setup();
        const h: ProcessHandler<OrderState, PaymentReceived> = {
            async handle() {},
            correlate: (m) => m.orderId,
        };
        processes.handles('OrderProcess', 'PaymentReceived', h);

        const result = await dispatch(
            envelope('PaymentReceived', { correlationId: 'c-1', orderId: 'no-such-saga' }),
            new AbortController().signal,
        );

        expect(result.success).toBe(true);
        expect(result.notHandled).toBe(true);
    });

    it('handles: loads existing saga, runs handler, persists mutations', async () => {
        const { processes, store, dispatch } = setup();
        await store.insert<OrderState>('OrderState', { correlationId: 'o-2', status: 'pending' });

        const h: ProcessHandler<OrderState, PaymentReceived> = {
            async handle(_msg, data) {
                data.status = 'paid';
            },
            correlate: (m) => m.orderId,
        };
        processes.handles('OrderProcess', 'PaymentReceived', h);

        const result = await dispatch(
            envelope('PaymentReceived', { correlationId: 'c-1', orderId: 'o-2' }),
            new AbortController().signal,
        );

        expect(result.success).toBe(true);
        const found = await store.findByCorrelationId<OrderState>('OrderState', 'o-2');
        expect(found?.data.status).toBe('paid');
    });

    it('markComplete deletes the saga', async () => {
        const { processes, store, dispatch } = setup();
        await store.insert<OrderState>('OrderState', { correlationId: 'o-3', status: 'pending' });

        const h: ProcessHandler<OrderState, PaymentReceived> = {
            async handle(_msg, _data, ctx: ProcessContext) {
                ctx.markComplete();
            },
            correlate: (m) => m.orderId,
        };
        processes.handles('OrderProcess', 'PaymentReceived', h);

        await dispatch(
            envelope('PaymentReceived', { correlationId: 'c-1', orderId: 'o-3' }),
            new AbortController().signal,
        );

        const found = await store.findByCorrelationId<OrderState>('OrderState', 'o-3');
        expect(found).toBeUndefined();
    });

    it('handler throw does not persist state and returns success=false', async () => {
        const { processes, store, dispatch } = setup();
        await store.insert<OrderState>('OrderState', { correlationId: 'o-4', status: 'pending' });

        const h: ProcessHandler<OrderState, PaymentReceived> = {
            async handle(_msg, data) {
                data.status = 'WAS-MUTATED';
                throw new Error('boom');
            },
            correlate: (m) => m.orderId,
        };
        processes.handles('OrderProcess', 'PaymentReceived', h);

        const result = await dispatch(
            envelope('PaymentReceived', { correlationId: 'c-1', orderId: 'o-4' }),
            new AbortController().signal,
        );

        expect(result.success).toBe(false);
        const found = await store.findByCorrelationId<OrderState>('OrderState', 'o-4');
        expect(found?.data.status).toBe('pending');
    });

    it('ConcurrencyError on update returns success=false, terminalFailure=false', async () => {
        const typeRegistry = createMessageTypeRegistry();
        typeRegistry.register('PaymentReceived');
        const handlers = new HandlerRegistry(typeRegistry);
        const processes = new ProcessRegistry();
        processes.registerDataType('OrderState');
        processes.registerProcess('OrderProcess', { dataType: 'OrderState' });

        const fakeStore = memorySagaStore();
        await fakeStore.insert<OrderState>('OrderState', {
            correlationId: 'o-5',
            status: 'pending',
        });
        fakeStore.update = vi.fn(async () => {
            throw new ConcurrencyError('boom');
        }) as never;

        const bus = {} as Bus;
        const logger = consoleLogger('fatal');
        const dispatch = createDispatcher({
            bus,
            logger,
            registry: typeRegistry,
            serializer: jsonSerializer(typeRegistry),
            handlers,
            pipelines: {
                before: new FilterPipeline('b'),
                after: new FilterPipeline('a'),
                onSuccess: new FilterPipeline('s'),
            },
            sagaBranch: (env, msg, signal) =>
                runSagaBranch(env, msg, signal, { processes, store: fakeStore, bus, logger }),
        });

        const h: ProcessHandler<OrderState, PaymentReceived> = {
            async handle(_msg, data) {
                data.status = 'paid';
            },
            correlate: (m) => m.orderId,
        };
        processes.handles('OrderProcess', 'PaymentReceived', h);

        const result = await dispatch(
            envelope('PaymentReceived', { correlationId: 'c-1', orderId: 'o-5' }),
            new AbortController().signal,
        );

        expect(result.success).toBe(false);
        expect(result.terminalFailure).toBe(false);
        expect(result.error).toBeInstanceOf(ConcurrencyError);
    });
});
