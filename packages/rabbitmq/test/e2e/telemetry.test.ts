import { randomUUID } from 'node:crypto';
import { context, propagation, trace } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { type Message, createBus } from '@serviceconnect/core';
import { telemetryConsumeWrapper, telemetryProducer } from '@serviceconnect/telemetry';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRabbitMQTransport } from '../../src/transport.js';

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

interface Order extends Message {
  orderId: string;
}

describe('E2E telemetry', () => {
  it('publish + consume spans link through the broker via traceparent header', async () => {
    const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
    const senderQ = `q-tel-s-${randomUUID().slice(0, 8)}`;
    const receiverQ = `q-tel-r-${randomUUID().slice(0, 8)}`;
    const typeName = `Order-${randomUUID().slice(0, 8)}`;

    const senderTransport = createRabbitMQTransport({ url });
    const sender = createBus({
      transport: { ...senderTransport, producer: telemetryProducer(senderTransport.producer) },
      queue: { name: senderQ },
    }).registerMessage<Order>(typeName);

    let received = false;
    const receiverTransport = createRabbitMQTransport({ url });
    const receiver = createBus({
      transport: receiverTransport,
      queue: { name: receiverQ },
      consumeWrapper: telemetryConsumeWrapper(),
    })
      .registerMessage<Order>(typeName)
      .handle<Order>(typeName, async () => {
        received = true;
      });

    await sender.start();
    await receiver.start();

    const tracer = trace.getTracer('e2e-test');
    await tracer.startActiveSpan('test-parent', async (parent) => {
      await sender.send<Order>(
        typeName,
        { correlationId: 'c', orderId: 'o-1' },
        {
          endpoint: receiverQ,
        },
      );
      parent.end();
    });

    const start = Date.now();
    while (!received && Date.now() - start < 5000) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(received).toBe(true);

    await new Promise((r) => setTimeout(r, 100));

    const spans = exporter.getFinishedSpans();
    const parent = spans.find((s) => s.name === 'test-parent');
    const sendSpan = spans.find((s) => s.name === `${receiverQ} send`);
    const processSpan = spans.find((s) => s.name === `${typeName} process`);

    expect(parent).toBeDefined();
    expect(sendSpan).toBeDefined();
    expect(processSpan).toBeDefined();

    expect(sendSpan?.parentSpanId).toBe(parent?.spanContext().spanId);
    expect(processSpan?.parentSpanId).toBe(sendSpan?.spanContext().spanId);
    expect(processSpan?.spanContext().traceId).toBe(parent?.spanContext().traceId);

    await sender.stop();
    await receiver.stop();
  });
});
