import RabbitMQClient from './clients/rabbitMQ';
import type { ILogger, ServiceConnectConfig } from './types';

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
        verify: 'verify_peer'
      },
      host: 'amqp://localhost',
      retryDelay: 3000,
      maxRetries: 3,
      errorQueue: 'errors',
      auditQueue: 'audit',
      auditEnabled: false,
      prefetch: 100,
      connectionTimeout: 30000,
      connectionRetryDelay: 30000,
      connectionMaxRetries: 5,
      defaultRequestTimeout: 10000
    },
    filters: {
      after: [],
      before: [],
      outgoing: []
    },
    handlers: {},
    client: RabbitMQClient,
    logger: {
      info: (message: string): void => console.log(message),
      error: (message: string, err?: unknown): void => {
        console.error(message);
        if (err) console.error(err);
      }
    } as ILogger
  };
}
