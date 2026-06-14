import {
    SpanKind,
    SpanStatusCode,
    context,
    defaultTextMapSetter,
    propagation,
    trace,
} from '@opentelemetry/api';
import {
    ATTR_MESSAGING_DESTINATION_NAME,
    ATTR_MESSAGING_DESTINATION_ROUTING_KEY,
    ATTR_MESSAGING_MESSAGE_CONVERSATION_ID,
    ATTR_MESSAGING_MESSAGE_ID,
    ATTR_MESSAGING_OPERATION_NAME,
    ATTR_MESSAGING_OPERATION_TYPE,
    INSTRUMENTATION_SCOPE,
    type ITransportProducer,
    OPERATION_NAME_PUBLISH,
    OPERATION_NAME_SEND,
    OPERATION_TYPE_PUBLISH,
} from '@serviceconnect/core';
import {
    type TelemetryOptions,
    applySystemAttributes,
    readHeader,
    resolveSystem,
} from './common.js';

export type { TelemetryOptions };

interface HeaderBearingOptions {
    headers?: Readonly<Record<string, string>>;
}

/**
 * Wraps a transport producer to emit one PRODUCER span per publish/send and inject the W3C
 * trace context into outgoing headers. Metrics are emitted by the transport itself (always-on),
 * so this wrapper is tracing-only.
 */
export function telemetryProducer(
    underlying: ITransportProducer,
    options?: TelemetryOptions,
): ITransportProducer {
    const tracer = options?.tracer ?? trace.getTracer(INSTRUMENTATION_SCOPE);
    const sys = resolveSystem(options);

    async function withSpan<TOptions extends HeaderBearingOptions, TResult>(
        operationName: typeof OPERATION_NAME_PUBLISH | typeof OPERATION_NAME_SEND,
        destination: string,
        opts: TOptions | undefined,
        routingKey: string | undefined,
        includeMessageId: boolean,
        invoke: (next: TOptions) => Promise<TResult>,
    ): Promise<TResult> {
        const attrs: Record<string, string | number | boolean> = {};
        applySystemAttributes(attrs, sys);
        attrs[ATTR_MESSAGING_OPERATION_TYPE] = OPERATION_TYPE_PUBLISH;
        attrs[ATTR_MESSAGING_OPERATION_NAME] = operationName;
        attrs[ATTR_MESSAGING_DESTINATION_NAME] = destination;
        const correlationId = readHeader(opts?.headers, 'correlationId');
        if (correlationId) {
            attrs[ATTR_MESSAGING_MESSAGE_CONVERSATION_ID] = correlationId;
        }
        if (includeMessageId) {
            const messageId = readHeader(opts?.headers, 'messageId');
            if (messageId) {
                attrs[ATTR_MESSAGING_MESSAGE_ID] = messageId;
            }
        }
        if (routingKey) {
            attrs[ATTR_MESSAGING_DESTINATION_ROUTING_KEY] = routingKey;
        }

        const span = tracer.startSpan(`${destination} ${operationName}`, {
            kind: SpanKind.PRODUCER,
            attributes: attrs,
        });
        const headers = { ...(opts?.headers ?? {}) };
        propagation.inject(trace.setSpan(context.active(), span), headers, defaultTextMapSetter);
        const nextOpts = { ...(opts ?? ({} as TOptions)), headers } as TOptions;
        try {
            const result = await context.with(trace.setSpan(context.active(), span), () =>
                invoke(nextOpts),
            );
            span.setStatus({ code: SpanStatusCode.OK });
            return result;
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
            throw error;
        } finally {
            span.end();
        }
    }

    return {
        get isHealthy() {
            return underlying.isHealthy;
        },
        supportsRoutingKey: underlying.supportsRoutingKey,
        maxMessageSize: underlying.maxMessageSize,
        async publish(typeName, body, opts) {
            await withSpan(OPERATION_NAME_PUBLISH, typeName, opts, opts?.routingKey, true, (next) =>
                underlying.publish(typeName, body, next),
            );
        },
        async send(endpoint, typeName, body, opts) {
            await withSpan(OPERATION_NAME_SEND, endpoint, opts, undefined, false, (next) =>
                underlying.send(endpoint, typeName, body, next),
            );
        },
        async sendBytes(endpoint, typeName, body, opts) {
            await withSpan(OPERATION_NAME_SEND, endpoint, opts, undefined, false, (next) =>
                underlying.sendBytes(endpoint, typeName, body, next),
            );
        },
        async [Symbol.asyncDispose]() {
            await underlying[Symbol.asyncDispose]();
        },
    };
}
