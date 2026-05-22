import type { IMessageTypeRegistry, Message } from '@serviceconnect/core';
import { PACKAGE_NAME as CORE_NAME } from '@serviceconnect/core';
import type { RabbitMQTransportOptions } from './options.js';
import { type RabbitMQTransport, createRabbitMQTransport } from './transport.js';

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

/**
 * Convenience helper that wires a transport with `parentsOf` derived from the supplied
 * `IMessageTypeRegistry`. Equivalent to:
 *   createRabbitMQTransport({ ...opts, parentsOf: (n) => registry.parentsOf(n) })
 */
export function rabbitMQWithRegistry(
  opts: Omit<RabbitMQTransportOptions, 'parentsOf'>,
  registry: IMessageTypeRegistry,
): RabbitMQTransport {
  return createRabbitMQTransport({
    ...opts,
    parentsOf: (n) => registry.parentsOf(n),
  });
}

// Legacy probe surface — kept so existing smoke tests still pass.
export const PACKAGE_NAME = '@serviceconnect/rabbitmq' as const;
export const CORE_DEPENDENCY = CORE_NAME;
export type RabbitMQMessage = Message;
