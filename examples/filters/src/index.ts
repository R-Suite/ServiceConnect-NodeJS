import {
    FilterAction,
    type Message,
    asFilter,
    asMiddleware,
    createBus,
} from '@serviceconnect/core';
import { amqpUrl, announce } from '@serviceconnect/example-lib';
import { createRabbitMQTransport } from '@serviceconnect/rabbitmq';

interface Note extends Message {
    body: string;
}

async function main(): Promise<number> {
    const url = amqpUrl();
    const seenByMiddleware: string[] = [];
    const handled: string[] = [];

    const bus = createBus({
        transport: createRabbitMQTransport({ url }),
        queue: { name: 'filters-example-bus' },
    }).registerMessage<Note>('Note');

    bus.use(
        'beforeConsuming',
        asFilter((envelope) => {
            // Incoming filters run before deserialization, and correlationId now travels in the
            // body (master wire format) rather than a header — so discriminate on a custom header.
            const id = String(envelope.headers.noteId ?? '');
            if (id.startsWith('drop-')) {
                announce('filter', `dropped ${id}`);
                return FilterAction.Stop;
            }
            return FilterAction.Continue;
        }),
        asMiddleware(async (context, next) => {
            const id = String(context.envelope.headers.noteId ?? '');
            seenByMiddleware.push(id);
            announce('middleware', `saw ${id}`);
            await next();
        }),
    );

    bus.handle<Note>('Note', async (msg) => {
        handled.push(msg.correlationId);
        announce('handler', `processed ${msg.correlationId}`);
    });

    await bus.start();

    try {
        announce('publisher', 'publishing 3 messages (2 normal + 1 drop)');
        await bus.publish<Note>(
            'Note',
            { correlationId: 'c-1', body: 'first' },
            {
                headers: { noteId: 'c-1' },
            },
        );
        await bus.publish<Note>(
            'Note',
            { correlationId: 'c-2', body: 'second' },
            {
                headers: { noteId: 'c-2' },
            },
        );
        await bus.publish<Note>(
            'Note',
            { correlationId: 'drop-1', body: 'dropped' },
            {
                headers: { noteId: 'drop-1' },
            },
        );

        const deadline = Date.now() + 5000;
        while (handled.length < 2 && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 50));
        }
        await new Promise((r) => setTimeout(r, 200));

        const handledOk =
            handled.length === 2 && handled.includes('c-1') && handled.includes('c-2');
        if (!handledOk) {
            announce(
                'FAIL',
                `expected handler to fire for [c-1, c-2], got [${handled.join(', ')}]`,
            );
            return 1;
        }
        if (seenByMiddleware.length !== 2) {
            announce(
                'FAIL',
                `expected middleware to see 2 messages, saw [${seenByMiddleware.join(', ')}]`,
            );
            return 1;
        }
        announce('OK', 'handler ran twice; filter dropped 1; middleware saw 2');
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
