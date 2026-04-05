import client from './clients/rabbitMQ';
import type { BusConfig, ConsumeMessageCallback, IClient, ILogger, ServiceConnectConfig } from './types';

/**
 * Default settings for ServiceConnect
 */
export default function settings(): ServiceConnectConfig {
  return {
    amqpSettings: {
      queue: {
        name: '',
        durable: true,
        exclusive: false,
        autoDelete: false,
        noAck: false
      },
      ssl: {
        enabled: false,
        key: null,
        passphrase: null,
        cert: null,
        ca: [],
        pfx: null,
        fail_if_no_peer_cert: false,
        verify: 'verify_peer'
      },
      host: 'amqp://localhost',
      retryDelay: 3000,
      maxRetries: 3,
      errorQueue: 'errors',
      auditQueue: 'audit',
      auditEnabled: false,
      prefetch: 100
    },
    filters: {
      after: [],
      before: [],
      outgoing: []
    },
    handlers: {},
    client: client as unknown as new (config: BusConfig, callback: ConsumeMessageCallback) => IClient,
    logger: {
      info: (message: string): void => console.log(message),
      error: (message: string, err?: unknown): void => {
        console.error(message);
        if (err) console.error(err);
      }
    } as ILogger
  };
}
