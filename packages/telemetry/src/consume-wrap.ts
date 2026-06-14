import {
    SpanKind,
    SpanStatusCode,
    context,
    defaultTextMapGetter,
    propagation,
    trace,
} from '@opentelemetry/api';
import {
    ATTR_MESSAGING_DESTINATION_ANONYMOUS,
    ATTR_MESSAGING_DESTINATION_NAME,
    ATTR_MESSAGING_MESSAGE_BODY_SIZE,
    ATTR_MESSAGING_MESSAGE_CONVERSATION_ID,
    ATTR_MESSAGING_MESSAGE_ID,
    ATTR_MESSAGING_OPERATION_NAME,
    ATTR_MESSAGING_OPERATION_TYPE,
    type ConsumeCallback,
    INSTRUMENTATION_SCOPE,
    OPERATION_NAME_PROCESS,
    OPERATION_TYPE_PROCESS,
} from '@serviceconnect/core';
import {
    type TelemetryOptions,
    applySystemAttributes,
    readHeader,
    resolveSystem,
} from './common.js';

const ANONYMOUS_DESTINATION = 'anonymous';

/**
 * Wraps a consume callback to emit one CONSUMER (process) span per message, parented on the
 * inbound W3C trace context. Metrics are emitted by the transport itself (always-on), so this
 * wrapper is tracing-only.
 */
export function telemetryConsumeWrapper(
    options?: TelemetryOptions,
): (cb: ConsumeCallback) => ConsumeCallback {
    const tracer = options?.tracer ?? trace.getTracer(INSTRUMENTATION_SCOPE);
    const sys = resolveSystem(options);

    return (cb: ConsumeCallback): ConsumeCallback =>
        async (envelope, signal) => {
            const headers = envelope.headers;
            // Destination: explicit consumer queue name > inbound destinationAddress header >
            // anonymous. Matches the C# consume span, which reads the DestinationAddress header
            // and falls back to an anonymous destination.
            const destination = options?.queueName ?? readHeader(headers, 'destinationAddress');
            const hasDestination = typeof destination === 'string' && destination.length > 0;
            const displayDestination = hasDestination
                ? (destination as string)
                : ANONYMOUS_DESTINATION;

            const attrs: Record<string, string | number | boolean> = {};
            applySystemAttributes(attrs, sys);
            attrs[ATTR_MESSAGING_OPERATION_TYPE] = OPERATION_TYPE_PROCESS;
            attrs[ATTR_MESSAGING_OPERATION_NAME] = OPERATION_NAME_PROCESS;
            if (hasDestination) {
                attrs[ATTR_MESSAGING_DESTINATION_NAME] = destination as string;
            } else {
                attrs[ATTR_MESSAGING_DESTINATION_ANONYMOUS] = true;
            }
            const messageId = readHeader(headers, 'messageId');
            if (messageId) {
                attrs[ATTR_MESSAGING_MESSAGE_ID] = messageId;
            }
            const correlationId = readHeader(headers, 'correlationId');
            if (correlationId) {
                attrs[ATTR_MESSAGING_MESSAGE_CONVERSATION_ID] = correlationId;
            }
            attrs[ATTR_MESSAGING_MESSAGE_BODY_SIZE] = envelope.body.byteLength;

            const parent = propagation.extract(context.active(), headers, defaultTextMapGetter);
            const span = tracer.startSpan(
                `${displayDestination} process`,
                { kind: SpanKind.CONSUMER, attributes: attrs },
                parent,
            );

            try {
                const result = await context.with(trace.setSpan(parent, span), () =>
                    cb(envelope, signal),
                );
                if (result.success) {
                    span.setStatus({ code: SpanStatusCode.OK });
                } else if (result.error) {
                    span.recordException(result.error);
                    span.setStatus({ code: SpanStatusCode.ERROR, message: result.error.message });
                } else {
                    // Non-success result with no exception: the message was routed to the retry
                    // queue rather than failing outright.
                    span.setStatus({
                        code: SpanStatusCode.ERROR,
                        message: 'Dispatch returned success=false without an exception',
                    });
                }
                return result;
            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                span.recordException(error);
                span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
                throw error;
            } finally {
                span.end();
            }
        };
}
