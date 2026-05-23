import { randomUUID } from 'node:crypto';
import {
  type ISagaStore,
  type ITimeoutStore,
  type Message,
  type ProcessContext,
  type ProcessData,
  type ProcessHandler,
  createBus,
} from '@serviceconnect/core';
import { amqpUrl, announce, mongoUri } from '@serviceconnect/example-lib';
import { memorySagaStore, memoryTimeoutStore } from '@serviceconnect/persistence-memory';
import { mongoSagaStore, mongoTimeoutStore } from '@serviceconnect/persistence-mongodb';
import { createRabbitMQTransport } from '@serviceconnect/rabbitmq';
import { MongoClient } from 'mongodb';

interface OrderState extends ProcessData {
  status: 'new' | 'pending' | 'paid';
}
interface OrderCreated extends Message {
  orderId: string;
}
interface PaymentReceived extends Message {
  orderId: string;
}

class OnOrderCreated implements ProcessHandler<OrderState, OrderCreated> {
  async handle(_msg: OrderCreated, data: OrderState): Promise<void> {
    data.status = 'pending';
  }
  correlate(msg: OrderCreated): string {
    return msg.orderId;
  }
}

class OnPaymentReceived implements ProcessHandler<OrderState, PaymentReceived> {
  async handle(_msg: PaymentReceived, data: OrderState, ctx: ProcessContext): Promise<void> {
    data.status = 'paid';
    ctx.markComplete();
  }
  correlate(msg: PaymentReceived): string {
    return msg.orderId;
  }
}

async function createStores(
  kind: 'inmemory' | 'mongo',
): Promise<{ sagaStore: ISagaStore; timeoutStore: ITimeoutStore; dispose: () => Promise<void> }> {
  if (kind === 'inmemory') {
    return {
      sagaStore: memorySagaStore(),
      timeoutStore: memoryTimeoutStore(),
      dispose: async () => undefined,
    };
  }
  const client = await MongoClient.connect(mongoUri());
  const db = client.db(`saga-example-${randomUUID().slice(0, 8)}`);
  const sagaStore = mongoSagaStore({ db });
  const timeoutStore = mongoTimeoutStore({ db });
  await sagaStore.ensureIndexes();
  await timeoutStore.ensureIndexes();
  return {
    sagaStore,
    timeoutStore,
    dispose: async () => {
      await db.dropDatabase().catch(() => undefined);
      await client.close();
    },
  };
}

async function main(): Promise<number> {
  const persistence: 'inmemory' | 'mongo' =
    process.argv.includes('--persistence') &&
    process.argv[process.argv.indexOf('--persistence') + 1] === 'mongo'
      ? 'mongo'
      : 'inmemory';
  announce('saga', `using persistence: ${persistence}`);

  const { sagaStore, timeoutStore, dispose } = await createStores(persistence);

  const bus = createBus({
    transport: createRabbitMQTransport({ url: amqpUrl() }),
    queue: { name: 'saga-example-bus' },
    timeoutPollIntervalMs: 100,
  });
  bus
    .registerProcessData<OrderState>('OrderState')
    .registerProcess('OrderProcess', { store: sagaStore, timeoutStore })
    .startsWith<OrderCreated>('OrderCreated', new OnOrderCreated())
    .handles<PaymentReceived>('PaymentReceived', new OnPaymentReceived());

  await bus.start();

  try {
    announce('bus', 'publishing OrderCreated');
    await bus.publish<OrderCreated>('OrderCreated', { correlationId: 'c', orderId: 'o-1' });

    const start = Date.now();
    while (
      !(await sagaStore.findByCorrelationId<OrderState>('OrderState', 'o-1')) &&
      Date.now() - start < 3000
    ) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const afterCreate = await sagaStore.findByCorrelationId<OrderState>('OrderState', 'o-1');
    if (afterCreate?.data.status !== 'pending') {
      announce('FAIL', `expected status 'pending', got ${afterCreate?.data.status}`);
      return 1;
    }
    announce('saga', 'saga is pending after OrderCreated');

    announce('bus', 'publishing PaymentReceived');
    await bus.publish<PaymentReceived>('PaymentReceived', { correlationId: 'c', orderId: 'o-1' });

    const completed = Date.now();
    while (
      (await sagaStore.findByCorrelationId<OrderState>('OrderState', 'o-1')) &&
      Date.now() - completed < 3000
    ) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const afterPaid = await sagaStore.findByCorrelationId<OrderState>('OrderState', 'o-1');
    if (afterPaid !== undefined) {
      announce('FAIL', `expected saga deleted, still present: ${JSON.stringify(afterPaid)}`);
      return 1;
    }
    announce('saga', 'saga row deleted after markComplete');
    announce('OK', 'saga lifecycle complete');
    return 0;
  } finally {
    await bus.stop();
    await dispose();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });
