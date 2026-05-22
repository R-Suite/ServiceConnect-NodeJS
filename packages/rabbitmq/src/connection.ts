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
  };
}

export function createRabbitMQConnection(
  opts: RabbitMQTransportOptions,
  role: 'producer' | 'consumer',
): Connection {
  return new Connection(buildConnectionOptions(opts, role));
}
