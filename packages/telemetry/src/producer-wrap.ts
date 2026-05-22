import {
  type Meter,
  SpanKind,
  SpanStatusCode,
  type Tracer,
  context,
  defaultTextMapSetter,
  propagation,
  trace,
} from '@opentelemetry/api';
import type { ITransportProducer } from '@serviceconnect/core';
import {
  ATTR_ERROR_TYPE,
  ATTR_MESSAGING_DESTINATION_NAME,
  ATTR_MESSAGING_MESSAGE_BODY_SIZE,
  ATTR_MESSAGING_MESSAGE_CONVERSATION_ID,
  ATTR_MESSAGING_MESSAGE_ID,
  ATTR_MESSAGING_OPERATION,
  ATTR_MESSAGING_SYSTEM,
  DEFAULT_MESSAGING_SYSTEM,
} from './attributes.js';
import { buildInstruments } from './metrics.js';

export interface TelemetryOptions {
  readonly tracer?: Tracer;
  readonly meter?: Meter;
  readonly messagingSystem?: string;
}

interface HeaderBearingOptions {
  headers?: Record<string, string>;
}

function buildAttributes(
  system: string,
  operation: 'publish' | 'send',
  destinationName: string,
  body: Uint8Array,
  headers: Record<string, string> | undefined,
): Record<string, string | number> {
  const attrs: Record<string, string | number> = {
    [ATTR_MESSAGING_SYSTEM]: system,
    [ATTR_MESSAGING_OPERATION]: operation,
    [ATTR_MESSAGING_DESTINATION_NAME]: destinationName,
    [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: body.byteLength,
  };
  if (headers?.messageId) attrs[ATTR_MESSAGING_MESSAGE_ID] = headers.messageId;
  if (headers?.correlationId) attrs[ATTR_MESSAGING_MESSAGE_CONVERSATION_ID] = headers.correlationId;
  return attrs;
}

export function telemetryProducer(
  underlying: ITransportProducer,
  options?: TelemetryOptions,
): ITransportProducer {
  const tracer = options?.tracer ?? trace.getTracer('@serviceconnect/telemetry');
  const system = options?.messagingSystem ?? DEFAULT_MESSAGING_SYSTEM;
  const instruments = buildInstruments(options?.meter);

  async function withSpan<TOptions extends HeaderBearingOptions, TResult>(
    operation: 'publish' | 'send',
    destinationName: string,
    body: Uint8Array,
    opts: TOptions | undefined,
    invoke: (next: TOptions) => Promise<TResult>,
  ): Promise<TResult> {
    const span = tracer.startSpan(`${destinationName} ${operation}`, {
      kind: SpanKind.PRODUCER,
      attributes: buildAttributes(system, operation, destinationName, body, opts?.headers),
    });
    const headers = { ...(opts?.headers ?? {}) };
    propagation.inject(trace.setSpan(context.active(), span), headers, defaultTextMapSetter);
    const nextOpts = { ...(opts ?? ({} as TOptions)), headers } as TOptions;
    try {
      const result = await context.with(trace.setSpan(context.active(), span), () =>
        invoke(nextOpts),
      );
      span.setStatus({ code: SpanStatusCode.OK });
      instruments.publishCount.add(1, {
        [ATTR_MESSAGING_DESTINATION_NAME]: destinationName,
        [ATTR_MESSAGING_OPERATION]: operation,
      });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      instruments.errorCount.add(1, {
        [ATTR_MESSAGING_OPERATION]: operation,
        [ATTR_ERROR_TYPE]: error.name,
      });
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
      await withSpan('publish', typeName, body, opts, (next) =>
        underlying.publish(typeName, body, next),
      );
    },
    async send(endpoint, typeName, body, opts) {
      await withSpan('send', endpoint, body, opts, (next) =>
        underlying.send(endpoint, typeName, body, next),
      );
    },
    async sendBytes(endpoint, typeName, body, opts) {
      await withSpan('send', endpoint, body, opts, (next) =>
        underlying.sendBytes(endpoint, typeName, body, next),
      );
    },
    async [Symbol.asyncDispose]() {
      await underlying[Symbol.asyncDispose]();
    },
  };
}
