import type { Message } from '@serviceconnect/core';
import { PACKAGE_NAME as CORE_NAME } from '@serviceconnect/core';

// Real public surface — landed in Phase C.
export { createRabbitMQTransport } from './transport.js';
export type { RabbitMQTransport } from './transport.js';
export type { RabbitMQTransportOptions } from './options.js';
export type { RabbitMQProducer, ProducerSnapshot } from './producer.js';
export type { RabbitMQConsumer, ConsumerSnapshot } from './consumer.js';
export {
  RabbitMQPayloadTooLargeError,
  RabbitMQPublishConfirmTimeoutError,
  RabbitMQTopologyMismatchError,
} from './errors.js';

// Legacy probe surface — kept so existing smoke tests still pass.
export const PACKAGE_NAME = '@serviceconnect/rabbitmq' as const;
export const CORE_DEPENDENCY = CORE_NAME;
export type RabbitMQMessage = Message;
