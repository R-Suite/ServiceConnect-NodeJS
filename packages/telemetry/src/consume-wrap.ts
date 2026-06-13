import {
    SpanKind,
    SpanStatusCode,
    context,
    defaultTextMapGetter,
    propagation,
    trace,
} from '@opentelemetry/api';
import type { ConsumeCallback } from '@serviceconnect/core';
import {
    ATTR_MESSAGING_DESTINATION_NAME,
    ATTR_MESSAGING_MESSAGE_BODY_SIZE,
    ATTR_MESSAGING_MESSAGE_CONVERSATION_ID,
    ATTR_MESSAGING_MESSAGE_ID,
    ATTR_MESSAGING_OPERATION,
    ATTR_MESSAGING_SYSTEM,
    DEFAULT_MESSAGING_SYSTEM,
} from './attributes.js';
import { buildInstruments } from './metrics.js';
import type { TelemetryOptions } from './producer-wrap.js';

export function telemetryConsumeWrapper(
    options?: TelemetryOptions,
): (cb: ConsumeCallback) => ConsumeCallback {
    const tracer = options?.tracer ?? trace.getTracer('@serviceconnect/telemetry');
    const system = options?.messagingSystem ?? DEFAULT_MESSAGING_SYSTEM;
    const instruments = buildInstruments(options?.meter);

    return (cb: ConsumeCallback): ConsumeCallback =>
        async (envelope, signal) => {
            const headers = envelope.headers as Record<string, string>;
            const messageType =
                typeof headers.messageType === 'string' ? headers.messageType : 'unknown';
            const parent = propagation.extract(context.active(), headers, defaultTextMapGetter);
            const span = tracer.startSpan(
                `${messageType} process`,
                {
                    kind: SpanKind.CONSUMER,
                    attributes: {
                        [ATTR_MESSAGING_SYSTEM]: system,
                        [ATTR_MESSAGING_OPERATION]: 'process',
                        [ATTR_MESSAGING_DESTINATION_NAME]: messageType,
                        [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: envelope.body.byteLength,
                        ...(typeof headers.messageId === 'string'
                            ? { [ATTR_MESSAGING_MESSAGE_ID]: headers.messageId }
                            : {}),
                        ...(typeof headers.correlationId === 'string'
                            ? { [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: headers.correlationId }
                            : {}),
                    },
                },
                parent,
            );
            const start = performance.now();
            try {
                const result = await context.with(trace.setSpan(parent, span), () =>
                    cb(envelope, signal),
                );
                if (result.success) {
                    span.setStatus({ code: SpanStatusCode.OK });
                } else {
                    const message = result.error?.message ?? 'consume failed';
                    if (result.error) span.recordException(result.error);
                    span.setStatus({ code: SpanStatusCode.ERROR, message });
                }
                instruments.consumeCount.add(1, {
                    [ATTR_MESSAGING_DESTINATION_NAME]: messageType,
                });
                return result;
            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                span.recordException(error);
                span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
                throw error;
            } finally {
                instruments.duration.record(performance.now() - start, {
                    [ATTR_MESSAGING_DESTINATION_NAME]: messageType,
                    [ATTR_MESSAGING_OPERATION]: 'process',
                });
                span.end();
            }
        };
}
