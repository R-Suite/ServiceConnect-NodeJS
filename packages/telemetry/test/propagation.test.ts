import { context, propagation, trace } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import type { ConsumeResult, Envelope, ITransportProducer } from '@serviceconnect/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { telemetryConsumeWrapper } from '../src/consume-wrap.js';
import { telemetryProducer } from '../src/producer-wrap.js';

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

beforeAll(() => {
  const ctxMgr = new AsyncHooksContextManager();
  ctxMgr.enable();
  context.setGlobalContextManager(ctxMgr);
  trace.setGlobalTracerProvider(provider);
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
});

afterAll(async () => {
  await provider.shutdown();
});

describe('trace context propagation round-trip', () => {
  it('publish-side traceparent is extracted by consume-side as parent', async () => {
    exporter.reset();

    let capturedHeaders: Record<string, string> = {};
    const underlying: ITransportProducer = {
      get isHealthy() {
        return true;
      },
      supportsRoutingKey: false,
      maxMessageSize: Number.POSITIVE_INFINITY,
      async publish(_t, _b, options) {
        capturedHeaders = { ...(options?.headers ?? {}) };
      },
      async send() {},
      async sendBytes() {},
      async [Symbol.asyncDispose]() {},
    };
    const producer = telemetryProducer(underlying);
    const consume = telemetryConsumeWrapper();

    const tracer = trace.getTracer('test');
    await tracer.startActiveSpan('test-parent', async (parent) => {
      await producer.publish('OrderCreated', new Uint8Array(4), {
        headers: { correlationId: 'c', messageId: 'm' },
      });
      parent.end();
    });

    const inboundEnvelope: Envelope = {
      headers: {
        messageType: 'OrderCreated',
        correlationId: 'c',
        messageId: 'm',
        ...capturedHeaders,
      },
      body: new Uint8Array(4),
    };

    const ok: ConsumeResult = { success: true, notHandled: false, terminalFailure: false };
    await consume(async () => ok)(inboundEnvelope, new AbortController().signal);

    const spans = exporter.getFinishedSpans();
    const publish = spans.find((s) => s.name === 'OrderCreated publish');
    const process = spans.find((s) => s.name === 'OrderCreated process');
    const parent = spans.find((s) => s.name === 'test-parent');
    expect(publish).toBeDefined();
    expect(process).toBeDefined();
    expect(parent).toBeDefined();
    expect(publish?.parentSpanId).toBe(parent?.spanContext().spanId);
    expect(process?.parentSpanId).toBe(publish?.spanContext().spanId);
    expect(process?.spanContext().traceId).toBe(parent?.spanContext().traceId);
  });
});
