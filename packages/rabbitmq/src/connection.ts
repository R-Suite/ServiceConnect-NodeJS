import { Connection, type ConnectionOptions } from 'rabbitmq-client';
import type { RabbitMQTransportOptions } from './options.js';

export function buildConnectionOptions(
    opts: RabbitMQTransportOptions,
    role: 'producer' | 'consumer',
): ConnectionOptions {
    const baseName = opts.connectionName ?? 'serviceconnect';
    return {
        url: opts.url,
        acquireTimeout: opts.acquireTimeout ?? 60_000,
        heartbeat: opts.heartbeat ?? 0,
        retryLow: opts.retryLow ?? 1000,
        retryHigh: opts.retryHigh ?? 30_000,
        connectionName: `${baseName}.${role}`,
        // Forward TLS so mutual-TLS / private-CA brokers can be configured (a bare amqps:// URL only
        // enables TLS against the default CA store). Omitted when unset so behaviour is unchanged.
        ...(opts.tls !== undefined ? { tls: opts.tls } : {}),
    };
}

export function createRabbitMQConnection(
    opts: RabbitMQTransportOptions,
    role: 'producer' | 'consumer',
): Connection {
    const connection = new Connection(buildConnectionOptions(opts, role));
    // rabbitmq-client's Connection is an EventEmitter that emits 'error' on the first unexpected
    // socket close even though it auto-reconnects. Without a listener, Node throws ERR_UNHANDLED_ERROR
    // as an uncaught exception and the whole process crashes on any transient broker disconnect.
    connection.on('error', (err: Error) => {
        opts.onConnectionError?.(err, role);
    });
    return connection;
}
