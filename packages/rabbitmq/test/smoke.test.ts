import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  CORE_DEPENDENCY,
  PACKAGE_NAME,
  type RabbitMQMessage,
  type RabbitMQTransport,
  type RabbitMQTransportOptions,
  createRabbitMQTransport,
} from '../src/index.js';

describe('@serviceconnect/rabbitmq public surface', () => {
  it('legacy probe constants are preserved', () => {
    expect(PACKAGE_NAME).toBe('@serviceconnect/rabbitmq');
    expect(CORE_DEPENDENCY).toBe('@serviceconnect/core');
  });

  it('re-exports the Message type from core', () => {
    expectTypeOf<RabbitMQMessage>().toMatchTypeOf<{ correlationId: string }>();
  });

  it('createRabbitMQTransport requires a url and returns producer + consumer', async () => {
    expect(() => createRabbitMQTransport({} as unknown as RabbitMQTransportOptions)).toThrow(/url/);
    // Construction with a (possibly-invalid) url should NOT throw; connection is deferred.
    const t: RabbitMQTransport = createRabbitMQTransport({ url: 'amqp://localhost' });
    expect(typeof t.producer.publish).toBe('function');
    expect(typeof t.consumer.start).toBe('function');
    // Close both connections so rabbitmq-client stops retrying in the background.
    await t.producer[Symbol.asyncDispose]();
    await t.consumer[Symbol.asyncDispose]();
  });
});
