import { createBus } from '@serviceconnect/core';
import { amqpUrl, announce } from '@serviceconnect/example-lib';
import { createRabbitMQTransport } from '@serviceconnect/rabbitmq';

interface OrderPlaced {
  correlationId: string;
  orderId: string;
}

async function main(): Promise<number> {
  const url = amqpUrl();
  let receivedCount = 0;

  const subscriber = createBus({
    transport: createRabbitMQTransport({ url }),
    queue: { name: 'pubsub-example-subscriber' },
  })
    .registerMessage<OrderPlaced>('OrderPlaced')
    .handle<OrderPlaced>('OrderPlaced', async (msg) => {
      receivedCount++;
      announce('subscriber', `received ${msg.orderId}`);
    });

  const publisher = createBus({
    transport: createRabbitMQTransport({ url }),
    queue: { name: 'pubsub-example-publisher' },
  }).registerMessage<OrderPlaced>('OrderPlaced');

  await subscriber.start();
  await publisher.start();

  announce('publisher', 'publishing 3 messages');
  for (let i = 0; i < 3; i++) {
    await publisher.publish<OrderPlaced>('OrderPlaced', {
      correlationId: `c-${i}`,
      orderId: `order-${i}`,
    });
  }

  const deadline = Date.now() + 5000;
  while (receivedCount < 3 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }

  await publisher.stop();
  await subscriber.stop();

  if (receivedCount !== 3) {
    announce('FAIL', `expected 3 messages, received ${receivedCount}`);
    return 1;
  }
  announce('OK', 'received all 3 messages');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });
