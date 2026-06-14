import type { ITransportProducer } from '@serviceconnect/core';
import type { Connection, Publisher } from 'rabbitmq-client';
import { RabbitMQPayloadTooLargeError } from './errors.js';
import type { ResolvedProducerOptions } from './options.js';
import { exchangeNameForType } from './topology.js';

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
    parentsOf?: (typeName: string) => readonly string[],
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
        const spec = {
            exchange: exchangeNameForType(typeName),
            type: 'fanout' as const,
            durable: true,
        };
        await connection.exchangeDeclare(spec);
        // Re-declare on reconnect (see rabbitmq-client publisher.exchanges).
        if (publisher.exchanges) {
            publisher.exchanges.push(spec);
        }
        declaredExchanges.add(typeName);
    }

    // The published type plus the transitive closure of parentsOf, deduped and cycle-guarded.
    // Master publishes a derived message to its own exchange AND every ancestor exchange.
    function ancestorClosure(typeName: string): string[] {
        const out: string[] = [];
        const seen = new Set<string>();
        const stack = [typeName];
        while (stack.length > 0) {
            const t = stack.pop() as string;
            if (seen.has(t)) continue;
            seen.add(t);
            out.push(t);
            for (const parent of parentsOf?.(t) ?? []) {
                stack.push(parent);
            }
        }
        return out;
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
            const buf = Buffer.from(body);
            for (const ancestor of ancestorClosure(typeName)) {
                await ensureExchangeDeclared(ancestor);
                throwIfAborted(signal);
                await publisher.send(
                    {
                        exchange: exchangeNameForType(ancestor),
                        routingKey: options?.routingKey ?? '',
                        headers: { ...(options?.headers ?? {}) },
                        contentType: 'application/json',
                        contentEncoding: 'identity',
                        durable: true,
                    },
                    buf,
                );
            }
            recordPublish();
        },

        async send(endpoint, _typeName, body, options, signal) {
            throwIfAborted(signal);
            validateBodySize(body);
            const headers: Record<string, unknown> = { ...(options?.headers ?? {}) };
            if (options?.routingSlipHopsCompleted !== undefined) {
                headers.RoutingSlipHopsCompleted = String(options.routingSlipHopsCompleted);
            }
            await publisher.send(
                {
                    exchange: '',
                    routingKey: endpoint,
                    headers,
                    contentType: 'application/json',
                    // See publish(): suppresses redundant auto-parse so the body is deserialized once.
                    contentEncoding: 'identity',
                    durable: true,
                },
                Buffer.from(body),
            );
            recordPublish();
        },

        async sendBytes(endpoint, _typeName, body, options, signal) {
            throwIfAborted(signal);
            validateBodySize(body);
            await publisher.send(
                {
                    exchange: '',
                    routingKey: endpoint,
                    headers: { ...(options?.headers ?? {}) },
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
