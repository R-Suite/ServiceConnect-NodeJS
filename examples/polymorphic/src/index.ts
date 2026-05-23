import { createBus, createMessageTypeRegistry } from '@serviceconnect/core';
import { amqpUrl, announce } from '@serviceconnect/example-lib';
import { rabbitMQWithRegistry } from '@serviceconnect/rabbitmq';

interface DomainEvent {
  correlationId: string;
  source: string;
}
interface OrderShipped extends DomainEvent {
  orderId: string;
}

async function main(): Promise<number> {
  const url = amqpUrl();
  let received: DomainEvent | undefined;

  const subscriberRegistry = createMessageTypeRegistry();
  subscriberRegistry.register<DomainEvent>('DomainEvent');
  subscriberRegistry.register<OrderShipped>('OrderShipped', { parents: ['DomainEvent'] });

  const subscriber = createBus({
    transport: rabbitMQWithRegistry({ url }, subscriberRegistry),
    registry: subscriberRegistry,
    queue: { name: 'poly-example-subscriber' },
  }).handle<DomainEvent>('DomainEvent', async (msg) => {
    received = msg;
    announce('subscriber', `DomainEvent handler received ${(msg as OrderShipped).orderId}`);
  });

  const publisherRegistry = createMessageTypeRegistry();
  publisherRegistry.register<DomainEvent>('DomainEvent');
  publisherRegistry.register<OrderShipped>('OrderShipped', { parents: ['DomainEvent'] });

  const publisher = createBus({
    transport: rabbitMQWithRegistry({ url }, publisherRegistry),
    registry: publisherRegistry,
    queue: { name: 'poly-example-publisher' },
  });

  await subscriber.start();
  await publisher.start();
  await new Promise((r) => setTimeout(r, 200));

  announce('publisher', 'publishing OrderShipped');
  await publisher.publish<OrderShipped>('OrderShipped', {
    correlationId: 'c-1',
    source: 'example',
    orderId: 'order-1',
  });

  const deadline = Date.now() + 5000;
  while (!received && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }

  await publisher.stop();
  await subscriber.stop();

  if (!received) {
    announce('FAIL', 'base-type handler never fired');
    return 1;
  }
  announce('OK', 'base-type handler ran for derived message');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });
