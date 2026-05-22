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

  // Standard AMQP properties win over caller-supplied headers when both present.
  if (msg.contentType) headers.ContentType = msg.contentType;
  if (msg.correlationId) headers.CorrelationId = msg.correlationId;
  if (msg.messageId) headers.MessageId = msg.messageId;
  if (msg.timestamp) headers.TimeSent = new Date(msg.timestamp * 1000).toISOString();

  return {
    headers,
    body: new Uint8Array(msg.body),
  };
}
