import type { Envelope } from '@serviceconnect/core';
import type { AsyncMessage } from 'rabbitmq-client';

export function normalizeHeaderValue(value: unknown): unknown {
    if (Buffer.isBuffer(value)) {
        return value.toString('utf-8');
    }
    return value;
}

export function toEnvelope(msg: AsyncMessage): Envelope {
    const headers: Record<string, unknown> = {};

    if (msg.headers) {
        for (const [key, value] of Object.entries(msg.headers)) {
            headers[key] = normalizeHeaderValue(value);
        }
    }

    // rabbitmq-client auto-parses the body when contentType is 'application/json',
    // giving us a plain JS value instead of a Buffer. Re-serialise so callers always
    // receive a Uint8Array regardless of how the message was published.
    let rawBody: Uint8Array;
    if (Buffer.isBuffer(msg.body)) {
        rawBody = new Uint8Array(msg.body.buffer, msg.body.byteOffset, msg.body.byteLength);
    } else if (msg.body instanceof Uint8Array) {
        rawBody = msg.body;
    } else if (typeof msg.body === 'string') {
        rawBody = new TextEncoder().encode(msg.body);
    } else {
        // Parsed JSON object — re-serialise to bytes so the envelope body is always a
        // Uint8Array, matching the ITransportConsumer contract.
        rawBody = new TextEncoder().encode(JSON.stringify(msg.body));
    }

    return {
        headers,
        body: rawBody,
    };
}
