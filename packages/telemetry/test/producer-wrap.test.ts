import { SpanStatusCode, propagation, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
    BasicTracerProvider,
    InMemorySpanExporter,
    SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import type { ITransportProducer } from '@serviceconnect/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { telemetryProducer } from '../src/producer-wrap.js';

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

beforeAll(() => {
    trace.setGlobalTracerProvider(provider);
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
});

afterAll(async () => {
    await provider.shutdown();
});

function fakeProducer(): ITransportProducer & {
    publishes: { typeName: string; body: Uint8Array; headers: Record<string, string> }[];
    sends: {
        endpoint: string;
        typeName: string;
        body: Uint8Array;
        headers: Record<string, string>;
    }[];
} {
    const publishes: { typeName: string; body: Uint8Array; headers: Record<string, string> }[] = [];
    const sends: {
        endpoint: string;
        typeName: string;
        body: Uint8Array;
        headers: Record<string, string>;
    }[] = [];
    return {
        publishes,
        sends,
        get isHealthy() {
            return true;
        },
        supportsRoutingKey: false,
        maxMessageSize: Number.POSITIVE_INFINITY,
        async publish(typeName, body, options) {
            publishes.push({ typeName, body, headers: { ...(options?.headers ?? {}) } });
        },
        async send(endpoint, typeName, body, options) {
            sends.push({ endpoint, typeName, body, headers: { ...(options?.headers ?? {}) } });
        },
        async sendBytes(endpoint, typeName, body, options) {
            sends.push({ endpoint, typeName, body, headers: { ...(options?.headers ?? {}) } });
        },
        async [Symbol.asyncDispose]() {},
    };
}

describe('telemetryProducer', () => {
    it('emits a PRODUCER publish span with OTel operation type/name attributes', async () => {
        exporter.reset();
        const wrapped = telemetryProducer(fakeProducer());
        await wrapped.publish('OrderCreated', new Uint8Array(7), {
            headers: { correlationId: 'c-1', messageId: 'm-1' },
            routingKey: 'orders.created',
        });

        const spans = exporter.getFinishedSpans();
        expect(spans).toHaveLength(1);
        expect(spans[0]?.name).toBe('OrderCreated publish');
        expect(spans[0]?.attributes['messaging.system']).toBe('rabbitmq');
        expect(spans[0]?.attributes['network.protocol.name']).toBe('amqp');
        expect(spans[0]?.attributes['messaging.operation.type']).toBe('publish');
        expect(spans[0]?.attributes['messaging.operation.name']).toBe('publish');
        expect(spans[0]?.attributes['messaging.destination.name']).toBe('OrderCreated');
        expect(spans[0]?.attributes['messaging.rabbitmq.destination.routing_key']).toBe(
            'orders.created',
        );
        expect(spans[0]?.attributes['messaging.message.id']).toBe('m-1');
        expect(spans[0]?.attributes['messaging.message.conversation_id']).toBe('c-1');
        // Producer spans do not carry body size (matches the C# publish span).
        expect(spans[0]?.attributes['messaging.message.body.size']).toBeUndefined();
        // The deprecated single-attribute form must not be emitted.
        expect(spans[0]?.attributes['messaging.operation']).toBeUndefined();
        expect(spans[0]?.status.code).toBe(SpanStatusCode.OK);
    });

    it('emits a send span with operation.name=send but OTel operation.type=publish', async () => {
        exporter.reset();
        const wrapped = telemetryProducer(fakeProducer());
        await wrapped.send('shipping-queue', 'OrderShipped', new Uint8Array(4));

        const spans = exporter.getFinishedSpans();
        expect(spans).toHaveLength(1);
        expect(spans[0]?.name).toBe('shipping-queue send');
        expect(spans[0]?.attributes['messaging.operation.type']).toBe('publish');
        expect(spans[0]?.attributes['messaging.operation.name']).toBe('send');
        expect(spans[0]?.attributes['messaging.destination.name']).toBe('shipping-queue');
    });

    it('injects traceparent into outbound headers', async () => {
        exporter.reset();
        const underlying = fakeProducer();
        const wrapped = telemetryProducer(underlying);
        await wrapped.publish('OrderCreated', new Uint8Array(0));
        expect(underlying.publishes[0]?.headers.traceparent).toMatch(
            /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/,
        );
    });

    it('marks span ERROR + rethrows when underlying producer fails', async () => {
        exporter.reset();
        const bad: ITransportProducer = {
            get isHealthy() {
                return true;
            },
            supportsRoutingKey: false,
            maxMessageSize: Number.POSITIVE_INFINITY,
            async publish() {
                throw new Error('broker-down');
            },
            async send() {
                throw new Error('broker-down');
            },
            async sendBytes() {
                throw new Error('broker-down');
            },
            async [Symbol.asyncDispose]() {},
        };
        const wrapped = telemetryProducer(bad);
        await expect(wrapped.publish('X', new Uint8Array(0))).rejects.toThrow('broker-down');
        const spans = exporter.getFinishedSpans();
        expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);
        expect(spans[0]?.events.some((e) => e.name === 'exception')).toBe(true);
    });

    it('respects the messagingSystem, protocol, and server.* options', async () => {
        exporter.reset();
        const wrapped = telemetryProducer(fakeProducer(), {
            messagingSystem: 'inmemory',
            protocolName: 'inproc',
            serverAddress: 'broker-1',
            serverPort: 5672,
        });
        await wrapped.publish('X', new Uint8Array(0));
        const spans = exporter.getFinishedSpans();
        expect(spans[0]?.attributes['messaging.system']).toBe('inmemory');
        expect(spans[0]?.attributes['network.protocol.name']).toBe('inproc');
        expect(spans[0]?.attributes['server.address']).toBe('broker-1');
        expect(spans[0]?.attributes['server.port']).toBe(5672);
    });
});
