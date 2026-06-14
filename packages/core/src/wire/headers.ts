import type { MessageHeaders } from '../message.js';

/** Producer operation stamped into the master `MessageType` header. */
export type WireOperation = 'Publish' | 'Send';

// internal camelCase header key -> master wire PascalCase header name.
// `messageType` is intentionally absent: it maps to `TypeName` (see encode/decode), not `MessageType`.
const INTERNAL_TO_WIRE: Record<string, string> = {
    messageId: 'MessageId',
    sourceAddress: 'SourceAddress',
    destinationAddress: 'DestinationAddress',
    timeSent: 'TimeSent',
    requestMessageId: 'RequestMessageId',
    responseMessageId: 'ResponseMessageId',
    routingKey: 'RoutingKey',
    retryCount: 'RetryCount',
};
const WIRE_TO_INTERNAL: Record<string, string> = Object.fromEntries(
    Object.entries(INTERNAL_TO_WIRE).map(([k, v]) => [v, k]),
);

/** Internal camelCase headers + operation -> master PascalCase wire headers (string values). */
export function encodeWireHeaders(
    internal: Record<string, unknown>,
    operation: WireOperation,
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(internal)) {
        if (v === undefined || v === null) continue;
        if (k === 'messageType') {
            out.TypeName = String(v);
            continue;
        }
        if (k === 'correlationId') continue;
        const mapped = INTERNAL_TO_WIRE[k];
        out[mapped ?? k] = typeof v === 'string' ? v : String(v);
    }
    out.MessageType = operation;
    out.ConsumerType = 'RabbitMQ';
    out.Language = 'Node';
    return out;
}

/** Reduces an AssemblyQualifiedName to its FullName (the part before the first comma). */
function fullNameOf(typeHeader: string): string {
    const comma = typeHeader.indexOf(',');
    return comma === -1 ? typeHeader : typeHeader.slice(0, comma).trim();
}

/** Master PascalCase wire headers -> internal camelCase MessageHeaders. */
export function decodeWireHeaders(wire: Record<string, unknown>): MessageHeaders {
    const out: Record<string, unknown> = {};
    let typeName: string | undefined;
    let fullTypeName: string | undefined;
    for (const [k, v] of Object.entries(wire)) {
        if (v === undefined || v === null) continue;
        const value = typeof v === 'string' ? v : String(v);
        if (k === 'TypeName') {
            typeName = value;
            continue;
        }
        if (k === 'FullTypeName') {
            fullTypeName = value;
            continue;
        }
        if (k === 'MessageType') continue;
        const mapped = WIRE_TO_INTERNAL[k];
        out[mapped ?? k] = value;
    }
    const resolved = fullTypeName ? fullNameOf(fullTypeName) : typeName;
    if (resolved !== undefined) out.messageType = resolved;
    return out as MessageHeaders;
}
