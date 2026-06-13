import { createBus } from '@serviceconnect/core';
import { amqpUrl, announce } from '@serviceconnect/example-lib';
import { createRabbitMQTransport } from '@serviceconnect/rabbitmq';

interface Req {
    correlationId: string;
    q: string;
}
interface Rep {
    correlationId: string;
    a: string;
}

async function singleReply(url: string): Promise<boolean> {
    const requester = createBus({
        transport: createRabbitMQTransport({ url }),
        queue: { name: 'rr-example-single-req' },
    })
        .registerMessage<Req>('Req')
        .registerMessage<Rep>('Rep');

    const responder = createBus({
        transport: createRabbitMQTransport({ url }),
        queue: { name: 'rr-example-single-rsp' },
    })
        .registerMessage<Req>('Req')
        .registerMessage<Rep>('Rep')
        .handle<Req>('Req', async (msg, ctx) => {
            await ctx.reply<Rep>('Rep', { correlationId: msg.correlationId, a: `pong:${msg.q}` });
        });

    await responder.start();
    await requester.start();

    try {
        const reply = await requester.sendRequest<Req, Rep>(
            'Req',
            { correlationId: 'c-1', q: 'hello' },
            { endpoint: 'rr-example-single-rsp', timeoutMs: 5000 },
        );
        announce('requester', `sendRequest: hello → got ${reply.a}`);
        return reply.a === 'pong:hello';
    } finally {
        await requester.stop();
        await responder.stop();
    }
}

async function scatterGather(url: string): Promise<boolean> {
    const reqType = 'MultiReq';
    const repType = 'MultiRep';
    const requester = createBus({
        transport: createRabbitMQTransport({ url }),
        queue: { name: 'rr-example-multi-req' },
    })
        .registerMessage<Req>(reqType)
        .registerMessage<Rep>(repType);

    const responders = await Promise.all(
        [0, 1, 2].map(async (i) => {
            const responder = createBus({
                transport: createRabbitMQTransport({ url }),
                queue: { name: `rr-example-multi-rsp-${i}` },
            })
                .registerMessage<Req>(reqType)
                .registerMessage<Rep>(repType)
                .handle<Req>(reqType, async (msg, ctx) => {
                    await ctx.reply<Rep>(repType, {
                        correlationId: msg.correlationId,
                        a: `r${i}`,
                    });
                });
            await responder.start();
            return responder;
        }),
    );
    await requester.start();

    try {
        announce('requester', 'sendRequestMulti to 3 responders');
        const replies = await requester.sendRequestMulti<Req, Rep>(
            reqType,
            { correlationId: 'c-multi', q: 'broadcast' },
            { timeoutMs: 5000, expectedReplyCount: 3 },
        );
        const sorted = replies.map((r) => r.a).sort();
        announce('requester', `got ${replies.length} replies: [${sorted.join(', ')}]`);
        return replies.length === 3 && sorted.join(',') === 'r0,r1,r2';
    } finally {
        await requester.stop();
        for (const r of responders) await r.stop();
    }
}

async function main(): Promise<number> {
    const url = amqpUrl();
    const okSingle = await singleReply(url);
    const okMulti = await scatterGather(url);
    if (okSingle && okMulti) {
        announce('OK', 'both scenarios passed');
        return 0;
    }
    announce('FAIL', `single=${okSingle} multi=${okMulti}`);
    return 1;
}

main()
    .then((code) => process.exit(code))
    .catch((err) => {
        process.stderr.write(`fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
        process.exit(1);
    });
