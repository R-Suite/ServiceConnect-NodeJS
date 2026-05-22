import type { Connection, Publisher } from 'rabbitmq-client';
import { describe, expect, it, vi } from 'vitest';
import { RabbitMQPayloadTooLargeError } from '../../src/errors.js';
import { resolveProducerOptions } from '../../src/options.js';
import { createProducer } from '../../src/producer.js';

function fakeConnection() {
  const publisher = {
    send: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    exchanges: [] as Array<{ exchange: string }>,
  } as unknown as Publisher;
  const connection = {
    createPublisher: vi.fn(() => publisher),
    exchangeDeclare: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    get ready() {
      return true;
    },
  } as unknown as Connection & { ready: boolean };
  return { publisher, connection };
}

describe('createProducer', () => {
  it('reports isHealthy based on the connection.ready getter', () => {
    const { connection } = fakeConnection();
    const producer = createProducer(connection, resolveProducerOptions({ url: '' }));
    expect(producer.isHealthy).toBe(true);
  });

  it('reports supportsRoutingKey=true and the configured maxMessageSize', () => {
    const { connection } = fakeConnection();
    const producer = createProducer(
      connection,
      resolveProducerOptions({ url: '', producer: { maxMessageSize: 1024 } }),
    );
    expect(producer.supportsRoutingKey).toBe(true);
    expect(producer.maxMessageSize).toBe(1024);
  });

  it('publish() declares the exchange lazily on first use; subsequent publishes reuse the cache', async () => {
    const { connection, publisher } = fakeConnection();
    const producer = createProducer(connection, resolveProducerOptions({ url: '' }));
    await producer.publish('OrderCreated', new Uint8Array([1]));
    await producer.publish('OrderCreated', new Uint8Array([2]));
    expect(connection.exchangeDeclare).toHaveBeenCalledTimes(1);
    expect(connection.exchangeDeclare).toHaveBeenCalledWith({
      exchange: 'OrderCreated',
      type: 'fanout',
      durable: true,
    });
    expect(publisher.send).toHaveBeenCalledTimes(2);
  });

  it('publish() routes to the type-fanout exchange with optional routing key', async () => {
    const { connection, publisher } = fakeConnection();
    const producer = createProducer(connection, resolveProducerOptions({ url: '' }));
    await producer.publish('OrderCreated', new Uint8Array([1]), {
      routingKey: 'rk',
      headers: { Custom: 'v' },
    });
    const call = (publisher.send as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[0]).toMatchObject({
      exchange: 'OrderCreated',
      routingKey: 'rk',
      contentType: 'application/json',
      deliveryMode: 2,
      headers: { Custom: 'v' },
    });
  });

  it('send() routes through default exchange to the endpoint queue and stamps MessageType header', async () => {
    const { connection, publisher } = fakeConnection();
    const producer = createProducer(connection, resolveProducerOptions({ url: '' }));
    await producer.send('q-target', 'OrderCreated', new Uint8Array([1]), {
      headers: { Custom: 'v' },
    });
    const call = (publisher.send as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[0]).toMatchObject({
      exchange: '',
      routingKey: 'q-target',
      contentType: 'application/json',
      deliveryMode: 2,
      headers: { MessageType: 'OrderCreated', Custom: 'v' },
    });
  });

  it('send() stamps RoutingSlipHopsCompleted header when provided', async () => {
    const { connection, publisher } = fakeConnection();
    const producer = createProducer(connection, resolveProducerOptions({ url: '' }));
    await producer.send('q-target', 'OrderCreated', new Uint8Array([1]), {
      routingSlipHopsCompleted: 3,
    });
    const call = (publisher.send as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[0]?.headers?.RoutingSlipHopsCompleted).toBe('3');
  });

  it('sendBytes() uses application/octet-stream content type', async () => {
    const { connection, publisher } = fakeConnection();
    const producer = createProducer(connection, resolveProducerOptions({ url: '' }));
    await producer.sendBytes('q-target', 'Chunk', new Uint8Array([1]));
    const call = (publisher.send as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[0]?.contentType).toBe('application/octet-stream');
  });

  it('throws RabbitMQPayloadTooLargeError when body exceeds maxMessageSize', async () => {
    const { connection } = fakeConnection();
    const producer = createProducer(
      connection,
      resolveProducerOptions({ url: '', producer: { maxMessageSize: 4 } }),
    );
    await expect(producer.publish('Foo', new Uint8Array(10))).rejects.toBeInstanceOf(
      RabbitMQPayloadTooLargeError,
    );
  });

  it('snapshot() tracks publishCount and lastPublishAt', async () => {
    const { connection } = fakeConnection();
    const producer = createProducer(connection, resolveProducerOptions({ url: '' }));
    const before = producer.snapshot();
    expect(before.publishCount).toBe(0);
    expect(before.lastPublishAt).toBeNull();
    await producer.publish('Foo', new Uint8Array([1]));
    const after = producer.snapshot();
    expect(after.publishCount).toBe(1);
    expect(after.lastPublishAt).not.toBeNull();
  });

  it('[Symbol.asyncDispose] closes the publisher and connection', async () => {
    const { connection, publisher } = fakeConnection();
    const producer = createProducer(connection, resolveProducerOptions({ url: '' }));
    await producer[Symbol.asyncDispose]();
    expect(publisher.close).toHaveBeenCalledOnce();
    expect(connection.close).toHaveBeenCalledOnce();
  });
});
