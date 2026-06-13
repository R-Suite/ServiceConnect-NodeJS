import {
    type Message,
    ROUTING_SLIP_HEADER,
    asMiddleware,
    createBus,
    parseRoutingSlip,
} from '@serviceconnect/core';
import { amqpUrl, announce } from '@serviceconnect/example-lib';
import { createRabbitMQTransport } from '@serviceconnect/rabbitmq';

interface Step extends Message {
    payload: string;
}

function makeHop(url: string, label: string, queueName: string, visits: string[]) {
    const bus = createBus({
        transport: createRabbitMQTransport({ url }),
        queue: { name: queueName },
    }).registerMessage<Step>('Step');

    bus.use(
        'beforeConsuming',
        asMiddleware(async (context, next) => {
            const raw = context.envelope.headers[ROUTING_SLIP_HEADER];
            const slip = parseRoutingSlip(typeof raw === 'string' ? raw : undefined);
            announce(label, `visited (slip remaining: ${slip.length})`);
            visits.push(label);
            await next();
        }),
    );

    bus.handle<Step>('Step', async () => undefined);
    return bus;
}

async function main(): Promise<number> {
    const url = amqpUrl();
    const visits: string[] = [];

    const qA = 'rs-example-a';
    const qB = 'rs-example-b';
    const qC = 'rs-example-c';

    const busA = makeHop(url, 'queueA', qA, visits);
    const busB = makeHop(url, 'queueB', qB, visits);
    const busC = makeHop(url, 'queueC', qC, visits);

    const starter = createBus({
        transport: createRabbitMQTransport({ url }),
        queue: { name: 'rs-example-starter' },
    }).registerMessage<Step>('Step');

    await busA.start();
    await busB.start();
    await busC.start();
    await starter.start();

    try {
        announce('starter', 'routing through 3 hops');
        await starter.route<Step>('Step', { correlationId: 'c-1', payload: 'hello' }, [qA, qB, qC]);

        const deadline = Date.now() + 8000;
        while (visits.length < 3 && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 100));
        }

        if (visits.join(',') !== 'queueA,queueB,queueC') {
            announce('FAIL', `expected queueA,queueB,queueC, got ${visits.join(',') || '(none)'}`);
            return 1;
        }
        announce('OK', 'all 3 hops visited in order');
        return 0;
    } finally {
        await starter.stop();
        await busA.stop();
        await busB.stop();
        await busC.stop();
    }
}

main()
    .then((code) => process.exit(code))
    .catch((err) => {
        process.stderr.write(`fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
        process.exit(1);
    });
