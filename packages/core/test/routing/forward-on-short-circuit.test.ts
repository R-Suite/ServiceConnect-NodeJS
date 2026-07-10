import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { AggregatorBranchOutcome } from '../../src/aggregator/dispatch.js';
import type { Bus } from '../../src/bus.js';
import type { Envelope } from '../../src/envelope.js';
import { FilterPipeline } from '../../src/filter-pipeline.js';
import { createDispatcher } from '../../src/handlers/dispatch.js';
import { HandlerRegistry } from '../../src/handlers/registry.js';
import { consoleLogger } from '../../src/logger.js';
import type { Message, MessageHeaders } from '../../src/message.js';
import type { SagaBranchOutcome } from '../../src/process/dispatch.js';
import { forwardRoutingSlipIfPresent } from '../../src/routing/dispatch.js';
import { ROUTING_SLIP_HEADER } from '../../src/routing/slip.js';
import { jsonSerializer } from '../../src/serialization/json.js';
import { createMessageTypeRegistry } from '../../src/serialization/registry.js';

// Regression for handlers/dispatch.ts: the routing-slip forward must run on EVERY
// success-classified consume exit (saga branch, aggregator branch, no-handler), not only
// the normal post-handler path — otherwise a routed message consumed by a saga/aggregator,
// or one with no handler, is acked and the remaining itinerary is silently dropped.

interface Step extends Message {
    payload: string;
}

function fakeProducer() {
    const sent: { endpoint: string; type: string; headers: Record<string, string> }[] = [];
    return {
        sent,
        async send(
            endpoint: string,
            type: string,
            _body: Uint8Array,
            options?: { headers?: Record<string, string> },
        ): Promise<void> {
            sent.push({ endpoint, type, headers: options?.headers ?? {} });
        },
    };
}

function setup(opts: {
    sagaBranch?: SagaBranchOutcome;
    aggregatorBranch?: AggregatorBranchOutcome;
    withHandler?: boolean;
}) {
    const typeName = `Step_${randomUUID().slice(0, 8)}`;
    const registry = createMessageTypeRegistry();
    registry.register<Step>(typeName);
    const handlers = new HandlerRegistry(registry);
    const logger = consoleLogger('fatal');
    const producer = fakeProducer();

    if (opts.withHandler) {
        handlers.add(typeName, async () => undefined);
    }

    const routingForward = vi.fn(
        async (envelope: Envelope, handlerSucceeded: boolean): Promise<boolean> =>
            forwardRoutingSlipIfPresent({ envelope, handlerSucceeded, producer, logger }),
    );

    const dispatch = createDispatcher({
        bus: {} as Bus,
        logger,
        registry,
        serializer: jsonSerializer(registry),
        handlers,
        pipelines: {
            before: new FilterPipeline('beforeConsuming'),
            after: new FilterPipeline('afterConsuming'),
            onSuccess: new FilterPipeline('onConsumedSuccessfully'),
        },
        sagaBranch: opts.sagaBranch ? async () => opts.sagaBranch as SagaBranchOutcome : undefined,
        aggregatorBranch: opts.aggregatorBranch
            ? async () => opts.aggregatorBranch as AggregatorBranchOutcome
            : undefined,
        routingForward,
    });

    return { dispatch, producer, routingForward, typeName };
}

function envelopeFor(typeName: string, nextDestinations: string[]): Envelope {
    return {
        headers: {
            messageType: typeName,
            correlationId: `c-${randomUUID().slice(0, 8)}`,
            [ROUTING_SLIP_HEADER]: JSON.stringify(nextDestinations),
        } as MessageHeaders,
        body: new TextEncoder().encode(JSON.stringify({ correlationId: 'c', payload: 'hop' })),
    };
}

describe('routing-slip forwards on every success-classified consume exit', () => {
    it('forwards after a successful saga short-circuit', async () => {
        const next = `dest-${randomUUID().slice(0, 8)}`;
        const after = `dest-${randomUUID().slice(0, 8)}`;
        const { dispatch, producer, typeName } = setup({
            sagaBranch: {
                ran: true,
                result: { success: true, notHandled: false, terminalFailure: false },
            },
        });

        const result = await dispatch(
            envelopeFor(typeName, [next, after]),
            new AbortController().signal,
        );

        expect(result.success).toBe(true);
        expect(producer.sent).toHaveLength(1);
        expect(producer.sent[0]?.endpoint).toBe(next);
        expect(JSON.parse(producer.sent[0]?.headers[ROUTING_SLIP_HEADER] ?? 'null')).toEqual([
            after,
        ]);
    });

    it('forwards after a successful aggregator short-circuit', async () => {
        const next = `dest-${randomUUID().slice(0, 8)}`;
        const { dispatch, producer, typeName } = setup({
            aggregatorBranch: {
                ran: true,
                result: { success: true, notHandled: false, terminalFailure: false },
            },
        });

        await dispatch(envelopeFor(typeName, [next]), new AbortController().signal);

        expect(producer.sent).toHaveLength(1);
        expect(producer.sent[0]?.endpoint).toBe(next);
    });

    it('forwards when the type is registered but has no handler', async () => {
        const next = `dest-${randomUUID().slice(0, 8)}`;
        const { dispatch, producer, typeName } = setup({ withHandler: false });

        const result = await dispatch(envelopeFor(typeName, [next]), new AbortController().signal);

        expect(result.success).toBe(true);
        expect(producer.sent).toHaveLength(1);
        expect(producer.sent[0]?.endpoint).toBe(next);
    });

    it('does NOT forward when the saga branch fails (message will be retried)', async () => {
        const next = `dest-${randomUUID().slice(0, 8)}`;
        const { dispatch, producer, typeName } = setup({
            sagaBranch: {
                ran: true,
                result: {
                    success: false,
                    notHandled: false,
                    terminalFailure: false,
                    error: new Error('boom'),
                },
            },
        });

        await dispatch(envelopeFor(typeName, [next]), new AbortController().signal);

        expect(producer.sent).toHaveLength(0);
    });

    it('still forwards on the normal handler path (unchanged)', async () => {
        const next = `dest-${randomUUID().slice(0, 8)}`;
        const { dispatch, producer, typeName } = setup({ withHandler: true });

        await dispatch(envelopeFor(typeName, [next]), new AbortController().signal);

        expect(producer.sent).toHaveLength(1);
        expect(producer.sent[0]?.endpoint).toBe(next);
    });
});
