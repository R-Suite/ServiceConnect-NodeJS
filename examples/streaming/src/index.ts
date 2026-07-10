import { type Message, createBus } from '@serviceconnect/core';
import { amqpUrl, announce } from '@serviceconnect/example-lib';
import { createRabbitMQTransport } from '@serviceconnect/rabbitmq';

interface Chunk extends Message {
    index: number;
}

const CHUNKS = 50;
const RECEIVER_QUEUE = 'streaming-example-receiver';

async function main(): Promise<number> {
    const url = amqpUrl();
    const received: number[] = [];

    const receiver = createBus({
        transport: createRabbitMQTransport({ url }),
        queue: { name: RECEIVER_QUEUE },
    })
        .registerMessage<Chunk>('Chunk')
        .handleStream<Chunk>('Chunk', async (stream) => {
            for await (const chunk of stream) {
                received.push(chunk.index);
            }
        });

    const sender = createBus({
        transport: createRabbitMQTransport({ url }),
        queue: { name: 'streaming-example-sender' },
    }).registerMessage<Chunk>('Chunk');

    await receiver.start();
    await sender.start();
    await new Promise((r) => setTimeout(r, 200));

    try {
        announce('sender', `opening stream to ${RECEIVER_QUEUE}`);
        const stream = await sender.openStream<Chunk>(RECEIVER_QUEUE, 'Chunk');
        for (let i = 0; i < CHUNKS; i++) {
            await stream.sendChunk({ correlationId: 'c-1', index: i });
        }
        await stream.complete();
        announce('sender', `sent ${CHUNKS} chunks`);

        const deadline = Date.now() + 10_000;
        while (received.length < CHUNKS && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 50));
        }

        if (received.length !== CHUNKS) {
            announce('FAIL', `expected ${CHUNKS} chunks, received ${received.length}`);
            return 1;
        }
        const inOrder = received.every((v, i) => v === i);
        if (!inOrder) {
            announce(
                'FAIL',
                `chunks arrived out of order: first 10 = ${received.slice(0, 10).join(',')}`,
            );
            return 1;
        }
        announce('receiver', `consumed ${received.length} chunks in order`);
        announce('OK', 'streaming round-trip complete');
        return 0;
    } finally {
        await sender.stop();
        await receiver.stop();
    }
}

main()
    .then((code) => process.exit(code))
    .catch((err) => {
        process.stderr.write(`fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
        process.exit(1);
    });
