import { describe, expect, it, vi } from 'vitest';
import { consoleLogger } from '../../src/logger.js';
import { forwardRoutingSlipIfPresent } from '../../src/routing/dispatch.js';
import { ROUTING_SLIP_HEADER } from '../../src/routing/slip.js';

function fakeProducer(): {
    sent: { endpoint: string; type: string; headers: Record<string, string> }[];
    send: (
        endpoint: string,
        type: string,
        body: Uint8Array,
        options?: { headers?: Record<string, string> },
    ) => Promise<void>;
} {
    const sent: { endpoint: string; type: string; headers: Record<string, string> }[] = [];
    return {
        sent,
        async send(endpoint, type, _body, options) {
            sent.push({ endpoint, type, headers: options?.headers ?? {} });
        },
    };
}

describe('routing-slip forward hook', () => {
    it('forwards to the first remaining destination when handler succeeded', async () => {
        const producer = fakeProducer();
        const result = await forwardRoutingSlipIfPresent({
            envelope: {
                headers: {
                    messageType: 'Foo',
                    correlationId: 'c',
                    [ROUTING_SLIP_HEADER]: JSON.stringify(['next', 'after']),
                },
                body: new TextEncoder().encode('{}'),
            },
            handlerSucceeded: true,
            producer,
            logger: consoleLogger('fatal'),
        });
        expect(result).toBe(true);
        expect(producer.sent).toHaveLength(1);
        expect(producer.sent[0]?.endpoint).toBe('next');
        const headers = producer.sent[0]?.headers;
        const slip = JSON.parse(headers?.[ROUTING_SLIP_HEADER] ?? 'null');
        expect(slip).toEqual(['after']);
    });

    it('does not forward when handler failed', async () => {
        const producer = fakeProducer();
        const result = await forwardRoutingSlipIfPresent({
            envelope: {
                headers: {
                    messageType: 'Foo',
                    correlationId: 'c',
                    [ROUTING_SLIP_HEADER]: JSON.stringify(['next']),
                },
                body: new TextEncoder().encode('{}'),
            },
            handlerSucceeded: false,
            producer,
            logger: consoleLogger('fatal'),
        });
        expect(result).toBe(false);
        expect(producer.sent).toHaveLength(0);
    });

    it('does not forward when slip is empty or absent', async () => {
        const producer = fakeProducer();
        await forwardRoutingSlipIfPresent({
            envelope: {
                headers: {
                    messageType: 'Foo',
                    correlationId: 'c',
                    [ROUTING_SLIP_HEADER]: JSON.stringify([]),
                },
                body: new TextEncoder().encode('{}'),
            },
            handlerSucceeded: true,
            producer,
            logger: consoleLogger('fatal'),
        });
        await forwardRoutingSlipIfPresent({
            envelope: {
                headers: { messageType: 'Foo', correlationId: 'c' },
                body: new TextEncoder().encode('{}'),
            },
            handlerSucceeded: true,
            producer,
            logger: consoleLogger('fatal'),
        });
        expect(producer.sent).toHaveLength(0);
    });

    it('logs + drops when the next destination is invalid (defence-in-depth)', async () => {
        const producer = fakeProducer();
        const logger = consoleLogger('fatal');
        const warn = vi.spyOn(logger, 'warn');
        const result = await forwardRoutingSlipIfPresent({
            envelope: {
                headers: {
                    messageType: 'Foo',
                    correlationId: 'c',
                    [ROUTING_SLIP_HEADER]: JSON.stringify(['amq.bad']),
                },
                body: new TextEncoder().encode('{}'),
            },
            handlerSucceeded: true,
            producer,
            logger,
        });
        expect(result).toBe(false);
        expect(producer.sent).toHaveLength(0);
        expect(warn).toHaveBeenCalled();
    });
});
