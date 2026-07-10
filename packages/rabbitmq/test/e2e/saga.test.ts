import { randomUUID } from 'node:crypto';
import {
    type FoundSaga,
    type Message,
    type ProcessContext,
    type ProcessData,
    type ProcessHandler,
    createBus,
} from '@serviceconnect/core';
import { memorySagaStore, memoryTimeoutStore } from '@serviceconnect/persistence-memory';
import { describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

interface OrderState extends ProcessData {
    status: 'pending' | 'paid' | 'late';
}
interface OrderCreated extends Message {
    orderId: string;
}
interface PaymentReceived extends Message {
    orderId: string;
}
interface PaymentTimeout extends Message {}

class OnOrderCreated implements ProcessHandler<OrderState, OrderCreated> {
    async handle(_msg: OrderCreated, data: OrderState, ctx: ProcessContext): Promise<void> {
        data.status = 'pending';
        await ctx.requestTimeout('PaymentTimeout', new Date(Date.now() + 800));
    }
    correlate(msg: OrderCreated): string {
        return msg.orderId;
    }
}
class OnPaymentReceived implements ProcessHandler<OrderState, PaymentReceived> {
    async handle(_msg: PaymentReceived, data: OrderState, ctx: ProcessContext): Promise<void> {
        data.status = 'paid';
        ctx.markComplete();
    }
    correlate(msg: PaymentReceived): string {
        return msg.orderId;
    }
}
class OnPaymentTimeout implements ProcessHandler<OrderState, PaymentTimeout> {
    async handle(_msg: PaymentTimeout, data: OrderState): Promise<void> {
        data.status = 'late';
    }
    correlate(msg: PaymentTimeout): string {
        return msg.correlationId;
    }
}

describe('E2E saga', () => {
    it('saga round-trip: create -> pay -> markComplete deletes the row', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const queue = `q-saga-${randomUUID().slice(0, 8)}`;
        const sagaStore = memorySagaStore();
        const timeoutStore = memoryTimeoutStore();

        const bus = createBus({
            transport: createRabbitMQTransport({ url }),
            queue: { name: queue },
            timeoutPollIntervalMs: 100,
        });
        bus.registerProcessData<OrderState>('OrderState')
            .registerProcess('OrderProcess', { store: sagaStore, timeoutStore })
            .startsWith<OrderCreated>('OrderCreated', new OnOrderCreated())
            .handles<PaymentReceived>('PaymentReceived', new OnPaymentReceived());

        await bus.start();

        await bus.publish<OrderCreated>('OrderCreated', { correlationId: 'c', orderId: 'o-1' });

        const start = Date.now();
        while (
            !(await sagaStore.findByCorrelationId<OrderState>('OrderState', 'o-1')) &&
            Date.now() - start < 3000
        ) {
            await new Promise((r) => setTimeout(r, 50));
        }
        let found = await sagaStore.findByCorrelationId<OrderState>('OrderState', 'o-1');
        expect(found?.data.status).toBe('pending');

        await bus.publish<PaymentReceived>('PaymentReceived', {
            correlationId: 'c',
            orderId: 'o-1',
        });

        const completed = Date.now();
        while (
            (await sagaStore.findByCorrelationId<OrderState>('OrderState', 'o-1')) &&
            Date.now() - completed < 3000
        ) {
            await new Promise((r) => setTimeout(r, 50));
        }
        found = await sagaStore.findByCorrelationId<OrderState>('OrderState', 'o-1');
        expect(found).toBeUndefined();

        await bus.stop();
    });

    it('saga timeout fires via TimeoutPoller and is delivered as a regular message', async () => {
        const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const queue = `q-sagat-${randomUUID().slice(0, 8)}`;
        const sagaStore = memorySagaStore();
        const timeoutStore = memoryTimeoutStore();

        const bus = createBus({
            transport: createRabbitMQTransport({ url }),
            queue: { name: queue },
            timeoutPollIntervalMs: 50,
        });
        bus.registerProcessData<OrderState>('OrderState')
            .registerProcess('OrderProcess', { store: sagaStore, timeoutStore })
            .startsWith<OrderCreated>('OrderCreated', new OnOrderCreated())
            .handles<PaymentTimeout>('PaymentTimeout', new OnPaymentTimeout());

        await bus.start();
        await bus.publish<OrderCreated>('OrderCreated', { correlationId: 'c', orderId: 'o-2' });

        const start = Date.now();
        let row: FoundSaga<OrderState> | undefined;
        do {
            await new Promise((r) => setTimeout(r, 100));
            row = await sagaStore.findByCorrelationId<OrderState>('OrderState', 'o-2');
        } while ((!row || row.data.status !== 'late') && Date.now() - start < 8000);

        expect(row?.data.status).toBe('late');

        await bus.stop();
    });
});
