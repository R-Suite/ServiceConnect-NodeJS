import { createRabbitMQConnection } from './connection.js';
import { type RabbitMQConsumer, createConsumer } from './consumer.js';
import {
  type RabbitMQTransportOptions,
  resolveConsumerOptions,
  resolveProducerOptions,
} from './options.js';
import { type RabbitMQProducer, createProducer } from './producer.js';

export interface RabbitMQTransport {
  readonly producer: RabbitMQProducer;
  readonly consumer: RabbitMQConsumer;
}

export function createRabbitMQTransport(opts: RabbitMQTransportOptions): RabbitMQTransport {
  if (!opts.url) {
    throw new Error('RabbitMQTransportOptions.url is required');
  }

  const producerConnection = createRabbitMQConnection(opts, 'producer');
  const consumerConnection = createRabbitMQConnection(opts, 'consumer');

  const producer = createProducer(producerConnection, resolveProducerOptions(opts));
  const consumer = createConsumer(consumerConnection, resolveConsumerOptions(opts));

  return { producer, consumer };
}
