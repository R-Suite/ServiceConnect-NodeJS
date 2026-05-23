import { createBus } from '@serviceconnect/core';
import { amqpUrl, announce } from '@serviceconnect/example-lib';
import { createRabbitMQTransport } from '@serviceconnect/rabbitmq';

interface OrderRequest {
  correlationId: string;
  orderId: string;
}

const RECEIVER_QUEUE = 'send-example-receiver';

async function main(): Promise<number> {
  const url = amqpUrl();
  let received: OrderRequest | undefined;

  const receiver = createBus({
    transport: createRabbitMQTransport({ url }),
    queue: { name: RECEIVER_QUEUE },
  })
    .registerMessage<OrderRequest>('OrderRequest')
    .handle<OrderRequest>('OrderRequest', async (msg) => {
      received = msg;
      announce('receiver', `got ${msg.correlationId} for ${msg.orderId}`);
    });

  const sender = createBus({
    transport: createRabbitMQTransport({ url }),
    queue: { name: 'send-example-sender' },
  }).registerMessage<OrderRequest>('OrderRequest');

  await receiver.start();
  await sender.start();

  announce('sender', `sending to ${RECEIVER_QUEUE}`);
  await sender.send<OrderRequest>(
    'OrderRequest',
    { correlationId: 'c-42', orderId: 'order-42' },
    { endpoint: RECEIVER_QUEUE },
  );

  const deadline = Date.now() + 5000;
  while (!received && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }

  await sender.stop();
  await receiver.stop();

  if (!received || received.correlationId !== 'c-42' || received.orderId !== 'order-42') {
    announce('FAIL', `expected c-42/order-42, got ${JSON.stringify(received)}`);
    return 1;
  }
  announce('OK', 'received expected message');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });
