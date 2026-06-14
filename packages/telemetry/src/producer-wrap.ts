import {
    SpanKind,
    SpanStatusCode,
    context,
    defaultTextMapSetter,
    propagation,
    trace,
} from '@opentelemetry/api';
import type { ITransportProducer } from '@serviceconnect/core';
import {
    ATTR_ERROR_TYPE,
    ATTR_MESSAGING_DESTINATION_NAME,
    ATTR_MESSAGING_DESTINATION_ROUTING_KEY,
    ATTR_MESSAGING_MESSAGE_CONVERSATION_ID,
    ATTR_MESSAGING_MESSAGE_ID,
    ATTR_MESSAGING_OPERATION_NAME,
    ATTR_MESSAGING_OPERATION_TYPE,
    ATTR_MESSAGING_SYSTEM,
    INSTRUMENTATION_SCOPE,
    OPERATION_NAME_PUBLISH,
    OPERATION_NAME_SEND,
    OPERATION_TYPE_PUBLISH,
} from './attributes.js';
import {
    type TelemetryOptions,
    applySystemAttributes,
    readHeader,
    resolveSystem,
} from './common.js';
import { buildInstruments } from './metrics.js';

export type { TelemetryOptions };

interface HeaderBearingOptions {
    headers?: Readonly<Record<string, string>>;
}

export function telemetryProducer(
    underlying: ITransportProducer,
    options?: TelemetryOptions,
): ITransportProducer {
    const tracer = options?.tracer ?? trace.getTracer(INSTRUMENTATION_SCOPE);
    const sys = resolveSystem(options);
    const instruments = buildInstruments(options?.meter);

    // Producer metrics carry a uniform (publish, publish) operation regardless of whether
    // the call was a publish or a send — only the destination differs. This mirrors the C#
    // producer, which funnels publish/send/request through one metric emitter. The span,
    // however, records the real operation name so publish and send stay distinguishable.
    function recordPublishMetrics(destination: string, seconds: number, errorType?: string): void {
        const tags: Record<string, string> = {
            [ATTR_MESSAGING_SYSTEM]: sys.system,
            [ATTR_MESSAGING_OPERATION_TYPE]: OPERATION_TYPE_PUBLISH,
            [ATTR_MESSAGING_OPERATION_NAME]: OPERATION_NAME_PUBLISH,
            [ATTR_MESSAGING_DESTINATION_NAME]: destination,
        };
        instruments.publishDuration.record(
            seconds,
            errorType ? { ...tags, [ATTR_ERROR_TYPE]: errorType } : tags,
        );
        // published.messages counts successes only.
        if (!errorType) {
            instruments.publishedMessages.add(1, tags);
        }
    }

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
        const start = performance.now();
        try {
            const result = await context.with(trace.setSpan(context.active(), span), () =>
                invoke(nextOpts),
            );
            span.setStatus({ code: SpanStatusCode.OK });
            recordPublishMetrics(destination, (performance.now() - start) / 1000);
            return result;
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
            recordPublishMetrics(destination, (performance.now() - start) / 1000, error.name);
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
