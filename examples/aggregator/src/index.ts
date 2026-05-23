import { Aggregator, type Message, createBus } from '@serviceconnect/core';
import { amqpUrl, announce } from '@serviceconnect/example-lib';
import { memoryAggregatorStore } from '@serviceconnect/persistence-memory';
import { createRabbitMQTransport } from '@serviceconnect/rabbitmq';

interface OrderEvent extends Message {
  orderId: string;
}

class OrderBatchAggregator extends Aggregator<OrderEvent> {
  public batches: (readonly OrderEvent[])[] = [];
  batchSize(): number {
    return 3;
  }
  timeout(): number {
    return 60_000;
  }
  async execute(messages: readonly OrderEvent[], _signal: AbortSignal): Promise<void> {
    this.batches.push(messages);
    announce('aggregator', `received batch of ${messages.length}`);
  }
}

async function main(): Promise<number> {
  const url = amqpUrl();
  const agg = new OrderBatchAggregator();
  const bus = createBus({
    transport: createRabbitMQTransport({ url }),
    queue: { name: 'aggregator-example-bus' },
    aggregatorFlushIntervalMs: 100,
  });
  bus.registerAggregator<OrderEvent>('OrderEvent', agg, { store: memoryAggregatorStore() });

  await bus.start();

  try {
    announce('publisher', 'publishing 3 OrderEvent messages');
    for (let i = 0; i < 3; i++) {
      await bus.publish<OrderEvent>('OrderEvent', {
        correlationId: 'c',
        orderId: `order-${i}`,
      });
    }

    const deadline = Date.now() + 5000;
    while (agg.batches.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }

    if (agg.batches.length !== 1 || agg.batches[0]?.length !== 3) {
      announce(
        'FAIL',
        `expected 1 batch of 3, got ${agg.batches.length} batch(es) of ${agg.batches.map((b) => b.length).join(',')}`,
      );
      return 1;
    }
    announce('OK', 'aggregator received expected batch');
    return 0;
  } finally {
    await bus.stop();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });
