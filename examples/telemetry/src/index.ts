import { context, propagation, trace } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
    BasicTracerProvider,
    InMemorySpanExporter,
    SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { type Message, createBus } from '@serviceconnect/core';
import { amqpUrl, announce } from '@serviceconnect/example-lib';
import { createRabbitMQTransport } from '@serviceconnect/rabbitmq';
import { telemetryConsumeWrapper, telemetryProducer } from '@serviceconnect/telemetry';

interface OrderPlaced extends Message {
    orderId: string;
}

async function main(): Promise<number> {
    const ctxMgr = new AsyncHooksContextManager();
    ctxMgr.enable();
    context.setGlobalContextManager(ctxMgr);
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());

    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    trace.setGlobalTracerProvider(provider);

    const url = amqpUrl();

    const senderTransport = createRabbitMQTransport({ url });
    const sender = createBus({
        transport: { ...senderTransport, producer: telemetryProducer(senderTransport.producer) },
        queue: { name: 'telemetry-example-sender' },
    }).registerMessage<OrderPlaced>('OrderPlaced');

    let received = false;
    const receiver = createBus({
        transport: createRabbitMQTransport({ url }),
        queue: { name: 'telemetry-example-receiver' },
        consumeWrapper: telemetryConsumeWrapper(),
    })
        .registerMessage<OrderPlaced>('OrderPlaced')
        .handle<OrderPlaced>('OrderPlaced', async (msg) => {
            received = true;
            announce('receiver', `received ${msg.orderId}`);
        });

    await sender.start();
    await receiver.start();
    await new Promise((r) => setTimeout(r, 200));

    try {
        announce('sender', 'sending OrderPlaced');
        await sender.send<OrderPlaced>(
            'OrderPlaced',
            { correlationId: 'c-1', orderId: 'order-1' },
            { endpoint: 'telemetry-example-receiver' },
        );

        const deadline = Date.now() + 5000;
        while (!received && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 50));
        }
        await new Promise((r) => setTimeout(r, 200));

        const spans = exporter.getFinishedSpans();
        const producerSpan = spans.find((s) => s.attributes['messaging.operation'] === 'send');
        const consumerSpan = spans.find((s) => s.attributes['messaging.operation'] === 'process');

        if (!producerSpan || !consumerSpan) {
            announce(
                'FAIL',
                `expected producer + consumer spans, got ${spans.map((s) => s.name).join(', ')}`,
            );
            return 1;
        }
        if (consumerSpan.parentSpanId !== producerSpan.spanContext().spanId) {
            announce(
                'FAIL',
                `consumer parent ${consumerSpan.parentSpanId} != producer span ${producerSpan.spanContext().spanId}`,
            );
            return 1;
        }
        announce('OK', 'telemetry spans verified: PRODUCER → CONSUMER linked by traceparent');
        return 0;
    } finally {
        await sender.stop();
        await receiver.stop();
        await provider.shutdown();
    }
}

main()
    .then((code) => process.exit(code))
    .catch((err) => {
        process.stderr.write(`fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
        process.exit(1);
    });
