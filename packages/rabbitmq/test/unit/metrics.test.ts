import { metrics } from '@opentelemetry/api';
import {
    AggregationTemporality,
    InMemoryMetricExporter,
    MeterProvider,
    PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import type { ConsumeResult } from '@serviceconnect/core';
import type {
    AsyncMessage,
    Connection,
    Consumer,
    ConsumerHandler,
    Publisher,
} from 'rabbitmq-client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createConsumer } from '../../src/consumer.js';
import { resolveConsumerOptions, resolveProducerOptions } from '../../src/options.js';
import { createProducer } from '../../src/producer.js';

const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 5_000 });
const provider = new MeterProvider({ readers: [reader] });

const URL = 'amqp://guest:guest@broker-1:5672';

beforeAll(() => {
    metrics.setGlobalMeterProvider(provider);
});

afterAll(async () => {
    await provider.shutdown();
});

async function collectMetrics(): Promise<
    Map<string, { value: number; attrs: Record<string, unknown> }[]>
> {
    await reader.forceFlush();
    const map = new Map<string, { value: number; attrs: Record<string, unknown> }[]>();
    for (const resourceMetric of exporter.getMetrics()) {
        for (const scopeMetric of resourceMetric.scopeMetrics) {
            for (const metric of scopeMetric.metrics) {
                const entries = metric.dataPoints.map((dp) => ({
                    value:
                        typeof dp.value === 'object'
                            ? (dp.value as { count: number }).count
                            : (dp.value as number),
                    attrs: { ...dp.attributes },
                }));
                map.set(
                    metric.descriptor.name,
                    (map.get(metric.descriptor.name) ?? []).concat(entries),
                );
            }
        }
    }
    return map;
}

function fakeProducerConnection(sendImpl: () => Promise<void> = async () => {}) {
    const publisher = {
        send: vi.fn(sendImpl),
        close: vi.fn(async () => {}),
        exchanges: [] as Array<{ exchange: string }>,
    } as unknown as Publisher;
    const connection = {
        createPublisher: vi.fn(() => publisher),
        exchangeDeclare: vi.fn(async () => undefined),
        exchangeBind: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
        get ready() {
            return true;
        },
    } as unknown as Connection;
    return { connection };
}

function fakeConsumerConnection() {
    const dispatchPublisher = {
        send: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
    } as unknown as Publisher;
    let consumerHandler: ConsumerHandler | undefined;
    const consumer = {
        close: vi.fn(async () => {}),
        on: vi.fn(),
        once: vi.fn((event: string, cb: () => void) => {
            if (event === 'ready') cb();
        }),
    } as unknown as Consumer;
    const connection = {
        queueDeclare: vi.fn(async () => undefined),
        exchangeDeclare: vi.fn(async () => undefined),
        queueBind: vi.fn(async () => undefined),
        createPublisher: vi.fn(() => dispatchPublisher),
        createConsumer: vi.fn((_props: object, handler: ConsumerHandler) => {
            consumerHandler = handler;
            return consumer;
        }),
        close: vi.fn(async () => undefined),
        get ready() {
            return true;
        },
    } as unknown as Connection;
    return { connection, getHandler: () => consumerHandler };
}

function asyncMessage(headers: Record<string, unknown> = {}): AsyncMessage {
    return { body: Buffer.from('{}'), headers, routingKey: 'q-self' } as unknown as AsyncMessage;
}

function has(
    points: { attrs: Record<string, unknown> }[] | undefined,
    match: Record<string, unknown>,
): boolean {
    return (points ?? []).some((p) => Object.entries(match).every(([k, v]) => p.attrs[k] === v));
}

describe('transport metrics (always-on)', () => {
    it('publish emits published.messages + publish.duration with OTel/server tags', async () => {
        const { connection } = fakeProducerConnection();
        const producer = createProducer(connection, resolveProducerOptions({ url: URL }));
        await producer.publish('OrderCreated', new Uint8Array(4));

        const got = await collectMetrics();
        expect(
            has(got.get('messaging.client.published.messages'), {
                'messaging.system': 'rabbitmq',
                'messaging.operation.type': 'publish',
                'messaging.operation.name': 'publish',
                'messaging.destination.name': 'OrderCreated',
                'network.protocol.name': 'amqp',
                'server.address': 'broker-1',
                'server.port': 5672,
            }),
        ).toBe(true);
        expect(
            has(got.get('messaging.publish.duration'), {
                'messaging.destination.name': 'OrderCreated',
            }),
        ).toBe(true);
    });

    it('send tags the publish metrics with the endpoint destination', async () => {
        const { connection } = fakeProducerConnection();
        const producer = createProducer(connection, resolveProducerOptions({ url: URL }));
        await producer.send('q-target', 'OrderShipped', new Uint8Array(2));

        const got = await collectMetrics();
        expect(
            has(got.get('messaging.client.published.messages'), {
                'messaging.operation.name': 'publish',
                'messaging.destination.name': 'q-target',
            }),
        ).toBe(true);
    });

    it('failed publish records duration with error.type and no published.messages', async () => {
        const { connection } = fakeProducerConnection(async () => {
            throw new TypeError('broker-down');
        });
        const producer = createProducer(connection, resolveProducerOptions({ url: URL }));
        await expect(producer.publish('FailType', new Uint8Array(0))).rejects.toThrow(
            'broker-down',
        );

        const got = await collectMetrics();
        expect(
            has(got.get('messaging.publish.duration'), {
                'messaging.destination.name': 'FailType',
                'error.type': 'TypeError',
            }),
        ).toBe(true);
        expect(
            has(got.get('messaging.client.published.messages'), {
                'messaging.destination.name': 'FailType',
            }),
        ).toBe(false);
    });

    it('consume success emits consumed.messages outcome=success + process.duration', async () => {
        const { connection, getHandler } = fakeConsumerConnection();
        const consumer = createConsumer(connection, resolveConsumerOptions({ url: URL }));
        const ok: ConsumeResult = { success: true, notHandled: false, terminalFailure: false };
        await consumer.start('orders-queue', [], async () => ok);
        await getHandler()?.(asyncMessage({ MessageType: 'Foo' }));

        const got = await collectMetrics();
        expect(
            has(got.get('messaging.client.consumed.messages'), {
                'messaging.operation.type': 'process',
                'messaging.destination.name': 'orders-queue',
                'messaging.outcome': 'success',
            }),
        ).toBe(true);
        expect(
            has(got.get('messaging.process.duration'), {
                'messaging.destination.name': 'orders-queue',
            }),
        ).toBe(true);
    });

    it('consume retry emits consumed.messages outcome=retry', async () => {
        const { connection, getHandler } = fakeConsumerConnection();
        const consumer = createConsumer(
            connection,
            resolveConsumerOptions({ url: URL, consumer: { maxRetries: 3 } }),
        );
        await consumer.start('retry-queue', [], async () => ({
            success: false,
            notHandled: false,
            terminalFailure: false,
            error: new Error('boom'),
        }));
        await getHandler()?.(asyncMessage({ RetryCount: 0 }));

        const got = await collectMetrics();
        expect(
            has(got.get('messaging.client.consumed.messages'), {
                'messaging.destination.name': 'retry-queue',
                'messaging.outcome': 'retry',
            }),
        ).toBe(true);
    });

    it('consume terminal failure emits outcome=error with error.type', async () => {
        const { connection, getHandler } = fakeConsumerConnection();
        const consumer = createConsumer(connection, resolveConsumerOptions({ url: URL }));
        await consumer.start('error-queue', [], async () => ({
            success: false,
            notHandled: false,
            terminalFailure: true,
            error: new RangeError('bad'),
        }));
        await getHandler()?.(asyncMessage());

        const got = await collectMetrics();
        expect(
            has(got.get('messaging.client.consumed.messages'), {
                'messaging.destination.name': 'error-queue',
                'messaging.outcome': 'error',
                'error.type': 'RangeError',
            }),
        ).toBe(true);
    });
});
