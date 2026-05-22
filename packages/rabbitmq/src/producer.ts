import type { ITransportProducer } from '@serviceconnect/core';
import type { Connection, Publisher } from 'rabbitmq-client';
import { RabbitMQPayloadTooLargeError } from './errors.js';
import type { ResolvedProducerOptions } from './options.js';

export interface ProducerSnapshot {
  readonly isHealthy: boolean;
  readonly isConnected: boolean;
  readonly supportsRoutingKey: boolean;
  readonly maxMessageSize: number;
  readonly publishCount: number;
  readonly lastPublishAt: string | null;
}

export interface RabbitMQProducer extends ITransportProducer {
  snapshot(): ProducerSnapshot;
}

interface PublisherWithExchanges extends Publisher {
  exchanges?: Array<{ exchange: string; type: string; durable?: boolean }>;
}

function isConnectionReady(connection: Connection): boolean {
  return Boolean((connection as unknown as { ready?: boolean }).ready);
}

export function createProducer(
  connection: Connection,
  opts: ResolvedProducerOptions,
): RabbitMQProducer {
  const publisher = connection.createPublisher({
    confirm: true,
    maxAttempts: opts.maxAttempts,
    exchanges: [],
  }) as PublisherWithExchanges;
  const declaredExchanges = new Set<string>();
  let publishCount = 0;
  let lastPublishAt: string | null = null;

  async function ensureExchangeDeclared(typeName: string): Promise<void> {
    if (declaredExchanges.has(typeName)) return;
    const spec = { exchange: typeName, type: 'fanout' as const, durable: true };
    await connection.exchangeDeclare(spec);
    // Also push into the publisher's exchanges list so rabbitmq-client re-declares
    // it on reconnect. Without this, a broker that loses exchange state across a
    // restart would leave the publisher trying to publish to a missing exchange.
    if (publisher.exchanges) {
      publisher.exchanges.push(spec);
    }
    declaredExchanges.add(typeName);
  }

  function validateBodySize(body: Uint8Array): void {
    if (body.byteLength > opts.maxMessageSize) {
      throw new RabbitMQPayloadTooLargeError(
        `message body of ${body.byteLength} bytes exceeds maxMessageSize ${opts.maxMessageSize}`,
      );
    }
  }

  function recordPublish(): void {
    publishCount += 1;
    lastPublishAt = new Date().toISOString();
  }

  // rabbitmq-client's Publisher.send doesn't accept an AbortSignal, so the
  // caller-supplied signal can only be honoured by short-circuiting before the
  // publish starts. In-flight publishes are not cancellable.
  function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw signal.reason ?? new Error('publish aborted');
    }
  }

  return {
    get isHealthy(): boolean {
      return isConnectionReady(connection);
    },
    supportsRoutingKey: true,
    maxMessageSize: opts.maxMessageSize,

    async publish(typeName, body, options, signal) {
      throwIfAborted(signal);
      validateBodySize(body);
      await ensureExchangeDeclared(typeName);
      throwIfAborted(signal);
      await publisher.send(
        {
          exchange: typeName,
          routingKey: options?.routingKey ?? '',
          headers: { ...(options?.headers ?? {}) },
          contentType: 'application/json',
          durable: true,
        },
        Buffer.from(body),
      );
      recordPublish();
    },

    async send(endpoint, typeName, body, options, signal) {
      throwIfAborted(signal);
      validateBodySize(body);
      const headers: Record<string, unknown> = {
        MessageType: typeName,
        ...(options?.headers ?? {}),
      };
      if (options?.routingSlipHopsCompleted !== undefined) {
        headers.RoutingSlipHopsCompleted = String(options.routingSlipHopsCompleted);
      }
      await publisher.send(
        {
          exchange: '',
          routingKey: endpoint,
          headers,
          contentType: 'application/json',
          durable: true,
        },
        Buffer.from(body),
      );
      recordPublish();
    },

    async sendBytes(endpoint, typeName, body, options, signal) {
      throwIfAborted(signal);
      validateBodySize(body);
      await publisher.send(
        {
          exchange: '',
          routingKey: endpoint,
          headers: { MessageType: typeName, ...(options?.headers ?? {}) },
          contentType: 'application/octet-stream',
          durable: true,
        },
        Buffer.from(body),
      );
      recordPublish();
    },

    snapshot() {
      const connected = isConnectionReady(connection);
      return {
        isHealthy: connected,
        isConnected: connected,
        supportsRoutingKey: true,
        maxMessageSize: opts.maxMessageSize,
        publishCount,
        lastPublishAt,
      };
    },

    async [Symbol.asyncDispose]() {
      await publisher.close();
      await connection.close();
    },
  };
}
