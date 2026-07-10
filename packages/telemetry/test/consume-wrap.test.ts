import { SpanStatusCode, propagation, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
    BasicTracerProvider,
    InMemorySpanExporter,
    SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import type { ConsumeCallback, ConsumeResult, Envelope } from '@serviceconnect/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { telemetryConsumeWrapper } from '../src/consume-wrap.js';

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

function envelope(headers: Record<string, string>, body = '{}'): Envelope {
    return { headers, body: new TextEncoder().encode(body) };
}

const ok: ConsumeResult = { success: true, notHandled: false, terminalFailure: false };
const fail: ConsumeResult = {
    success: false,
    notHandled: false,
    error: new Error('boom'),
    terminalFailure: false,
};

describe('telemetryConsumeWrapper', () => {
    it('opens a process span named after the destination and ends OK on success', async () => {
        exporter.reset();
        const wrap = telemetryConsumeWrapper();
        const cb: ConsumeCallback = async () => ok;
        const wrapped = wrap(cb);
        await wrapped(
            envelope({
                messageType: 'OrderCreated',
                correlationId: 'c-1',
                destinationAddress: 'order-queue',
            }),
            new AbortController().signal,
        );
        const spans = exporter.getFinishedSpans();
        expect(spans).toHaveLength(1);
        expect(spans[0]?.name).toBe('order-queue process');
        expect(spans[0]?.status.code).toBe(SpanStatusCode.OK);
        expect(spans[0]?.attributes['messaging.operation.type']).toBe('process');
        expect(spans[0]?.attributes['messaging.operation.name']).toBe('process');
        expect(spans[0]?.attributes['messaging.destination.name']).toBe('order-queue');
        expect(spans[0]?.attributes['messaging.operation']).toBeUndefined();
    });

    it('falls back to an anonymous destination when no destinationAddress is present', async () => {
        exporter.reset();
        const wrap = telemetryConsumeWrapper();
        const wrapped = wrap(async () => ok);
        await wrapped(envelope({ messageType: 'OrderCreated' }), new AbortController().signal);
        const spans = exporter.getFinishedSpans();
        expect(spans[0]?.name).toBe('anonymous process');
        expect(spans[0]?.attributes['messaging.destination.anonymous']).toBe(true);
        expect(spans[0]?.attributes['messaging.destination.name']).toBeUndefined();
    });

    it('uses the queueName option as the destination when supplied', async () => {
        exporter.reset();
        const wrap = telemetryConsumeWrapper({ queueName: 'my-service-queue' });
        const wrapped = wrap(async () => ok);
        await wrapped(envelope({ messageType: 'OrderCreated' }), new AbortController().signal);
        const spans = exporter.getFinishedSpans();
        expect(spans[0]?.name).toBe('my-service-queue process');
        expect(spans[0]?.attributes['messaging.destination.name']).toBe('my-service-queue');
    });

    it('reads PascalCase headers from C#-produced messages', async () => {
        exporter.reset();
        const wrap = telemetryConsumeWrapper();
        const wrapped = wrap(async () => ok);
        await wrapped(
            envelope({
                MessageType: 'OrderCreated',
                CorrelationId: 'c-cs',
                MessageId: 'm-cs',
                DestinationAddress: 'csharp-queue',
            }),
            new AbortController().signal,
        );
        const spans = exporter.getFinishedSpans();
        expect(spans[0]?.name).toBe('csharp-queue process');
        expect(spans[0]?.attributes['messaging.destination.name']).toBe('csharp-queue');
        expect(spans[0]?.attributes['messaging.message.id']).toBe('m-cs');
        expect(spans[0]?.attributes['messaging.message.conversation_id']).toBe('c-cs');
    });

    it('marks span ERROR when ConsumeResult.success is false', async () => {
        exporter.reset();
        const wrap = telemetryConsumeWrapper();
        const wrapped = wrap(async () => fail);
        await wrapped(
            envelope({ messageType: 'OrderCreated', correlationId: 'c' }),
            new AbortController().signal,
        );
        const spans = exporter.getFinishedSpans();
        expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);
        expect(spans[0]?.events.some((e) => e.name === 'exception')).toBe(true);
    });

    it('marks span ERROR + rethrows when the callback throws', async () => {
        exporter.reset();
        const wrap = telemetryConsumeWrapper();
        const wrapped = wrap(async () => {
            throw new Error('handler-crash');
        });
        await expect(
            wrapped(
                envelope({ messageType: 'X', correlationId: 'c' }),
                new AbortController().signal,
            ),
        ).rejects.toThrow('handler-crash');
        const spans = exporter.getFinishedSpans();
        expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);
    });

    it('extracts traceparent and parents the span on the upstream context', async () => {
        exporter.reset();
        const tracer = trace.getTracer('test-upstream');
        const parent = tracer.startSpan('test-parent');
        parent.end();
        const finished = exporter.getFinishedSpans();
        const traceId = finished[0]?.spanContext().traceId as string;
        const spanId = finished[0]?.spanContext().spanId as string;
        expect(traceId).toBeTruthy();

        exporter.reset();
        const wrap = telemetryConsumeWrapper();
        const wrapped = wrap(async () => ok);
        await wrapped(
            envelope({
                messageType: 'X',
                correlationId: 'c',
                traceparent: `00-${traceId}-${spanId}-01`,
            }),
            new AbortController().signal,
        );
        const spans = exporter.getFinishedSpans();
        expect(spans[0]?.spanContext().traceId).toBe(traceId);
        expect(spans[0]?.parentSpanId).toBe(spanId);
    });

    it('records body size and message id attributes', async () => {
        exporter.reset();
        const wrap = telemetryConsumeWrapper();
        const wrapped = wrap(async () => ok);
        await wrapped(
            envelope({ messageType: 'X', correlationId: 'c-99', messageId: 'm-42' }, 'hello-world'),
            new AbortController().signal,
        );
        const spans = exporter.getFinishedSpans();
        expect(spans[0]?.attributes['messaging.message.id']).toBe('m-42');
        expect(spans[0]?.attributes['messaging.message.conversation_id']).toBe('c-99');
        expect(spans[0]?.attributes['messaging.message.body.size']).toBe(11);
    });
});
