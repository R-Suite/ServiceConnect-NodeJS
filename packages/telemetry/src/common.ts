import type { Tracer } from '@opentelemetry/api';
import {
    DEFAULT_MESSAGING_SYSTEM,
    DEFAULT_PROTOCOL_NAME,
    messagingSystemAttributes,
} from '@serviceconnect/core';

export interface TelemetryOptions {
    readonly tracer?: Tracer;
    /** OTel messaging.system identifier. Defaults to `rabbitmq`. */
    readonly messagingSystem?: string;
    /** network.protocol.name value. Defaults to `amqp`. */
    readonly protocolName?: string;
    /** Broker host for the server.address attribute. Omitted from spans when unset. */
    readonly serverAddress?: string;
    /** Broker port for the server.port attribute. Omitted from spans when not a positive number. */
    readonly serverPort?: number;
    /**
     * Consume-only: the physical queue this consumer is attached to. Used as the
     * messaging.destination.name on consume spans, mirroring the C# stack's consumer-queue
     * tagging. Falls back to the inbound `destinationAddress` header, then to an anonymous
     * destination.
     */
    readonly queueName?: string;
}

export interface ResolvedSystem {
    readonly system: string;
    readonly protocolName: string;
    readonly serverAddress?: string;
    readonly serverPort?: number;
}

export function resolveSystem(options?: TelemetryOptions): ResolvedSystem {
    return {
        system: options?.messagingSystem ?? DEFAULT_MESSAGING_SYSTEM,
        protocolName: options?.protocolName ?? DEFAULT_PROTOCOL_NAME,
        serverAddress: options?.serverAddress,
        serverPort: options?.serverPort,
    };
}

/**
 * Stamps messaging.system, network.protocol.name, and server.address/port onto a span's
 * attributes, delegating to the core builder so spans and transport metrics tag servers identically.
 */
export function applySystemAttributes(
    attrs: Record<string, string | number | boolean>,
    sys: ResolvedSystem,
): void {
    Object.assign(attrs, messagingSystemAttributes(sys));
}

/**
 * Reads a header value by name, matching case-insensitively. The Node bus stamps wire
 * headers in camelCase (`correlationId`) while the C# stack uses PascalCase
 * (`CorrelationId`); a case-insensitive lookup lets the wrappers label spans correctly
 * regardless of which runtime produced the message.
 */
export function readHeader(
    headers: Readonly<Record<string, unknown>> | undefined,
    name: string,
): string | undefined {
    if (!headers) {
        return undefined;
    }
    const direct = headers[name];
    if (typeof direct === 'string') {
        return direct;
    }
    const lower = name.toLowerCase();
    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === lower) {
            const value = headers[key];
            if (typeof value === 'string') {
                return value;
            }
        }
    }
    return undefined;
}
