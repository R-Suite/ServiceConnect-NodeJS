import { describe, expect, it } from 'vitest';
import { resolveConsumerOptions } from '../../src/options.js';
import {
    buildConsumerTopology,
    buildRetryExchangeNames,
    buildTypeExchangeSpec,
    exchangeNameForType,
} from '../../src/topology.js';

describe('buildTypeExchangeSpec', () => {
    it('returns durable fanout exchange spec named exactly after the type', () => {
        const spec = buildTypeExchangeSpec('OrderCreated');
        expect(spec).toEqual({
            exchange: 'OrderCreated',
            type: 'fanout',
            durable: true,
        });
    });
});

describe('retry/error/audit topology (master parity)', () => {
    const opts = resolveConsumerOptions({ url: '', consumer: { auditEnabled: true } });
    const topo = buildConsumerTopology('svc', ['MyApp.Foo'], opts);
    it('names: retry queue + direct dead-letter exchange', () => {
        expect(buildRetryExchangeNames('svc')).toEqual({
            retryQueue: 'svc.Retries',
            deadLetterExchange: 'svc.Retries.DeadLetter',
        });
    });
    it('main queue is plain (no retry dead-letter args)', () => {
        const main = topo.queues.find((q) => q.queue === 'svc');
        expect(main?.arguments?.['x-dead-letter-exchange']).toBeUndefined();
        expect(main?.arguments?.['x-dead-letter-routing-key']).toBeUndefined();
    });
    it('retry queue TTLs and dead-letters to the DLX', () => {
        const retry = topo.queues.find((q) => q.queue === 'svc.Retries');
        expect(retry?.arguments?.['x-message-ttl']).toBe(opts.retryDelay);
        expect(retry?.arguments?.['x-dead-letter-exchange']).toBe('svc.Retries.DeadLetter');
    });
    it('declares the direct durable DLX and binds the main queue back via the retry key', () => {
        expect(topo.exchanges).toContainEqual({
            exchange: 'svc.Retries.DeadLetter',
            type: 'direct',
            durable: true,
        });
        expect(topo.queueBindings).toContainEqual({
            exchange: 'svc.Retries.DeadLetter',
            queue: 'svc',
            routingKey: 'svc.Retries',
        });
    });
    it('declares non-durable direct error + audit exchanges bound to durable queues', () => {
        expect(topo.exchanges).toContainEqual({
            exchange: 'errors',
            type: 'direct',
            durable: false,
        });
        expect(topo.exchanges).toContainEqual({
            exchange: 'audit',
            type: 'direct',
            durable: false,
        });
        expect(topo.queues).toContainEqual({ queue: 'errors', durable: true });
        expect(topo.queueBindings).toContainEqual({
            exchange: 'errors',
            queue: 'errors',
            routingKey: '',
        });
        expect(topo.queueBindings).toContainEqual({
            exchange: 'audit',
            queue: 'audit',
            routingKey: '',
        });
    });
    it('omits retry topology when maxRetries is 0', () => {
        const noRetry = buildConsumerTopology(
            'svc',
            [],
            resolveConsumerOptions({ url: '', consumer: { maxRetries: 0 } }),
        );
        expect(noRetry.queues.some((q) => q.queue === 'svc.Retries')).toBe(false);
        expect(noRetry.exchanges.some((e) => e.exchange === 'svc.Retries.DeadLetter')).toBe(false);
    });
});

describe('buildConsumerTopology (general)', () => {
    const baseOpts = resolveConsumerOptions({ url: '', consumer: { maxRetries: 3 } });

    it('declares the error queue when errorQueue is non-null', () => {
        const t = buildConsumerTopology('q-self', [], baseOpts);
        expect(t.queues.find((q) => q.queue === 'errors')).toBeDefined();
    });

    it('omits the error queue when errorQueue is null', () => {
        const t = buildConsumerTopology(
            'q-self',
            [],
            resolveConsumerOptions({ url: '', consumer: { errorQueue: null } }),
        );
        expect(t.queues.find((q) => q.queue === 'errors')).toBeUndefined();
    });

    it('declares the audit queue only when auditEnabled is true', () => {
        const off = buildConsumerTopology('q-self', [], baseOpts);
        expect(off.queues.find((q) => q.queue === 'audit')).toBeUndefined();
        const on = buildConsumerTopology(
            'q-self',
            [],
            resolveConsumerOptions({ url: '', consumer: { auditEnabled: true } }),
        );
        expect(on.queues.find((q) => q.queue === 'audit')).toBeDefined();
    });

    it('declares fanout exchanges per message type', () => {
        const t = buildConsumerTopology('q-self', ['OrderCreated', 'OrderShipped'], baseOpts);
        expect(t.exchanges).toContainEqual({
            exchange: 'OrderCreated',
            type: 'fanout',
            durable: true,
        });
        expect(t.exchanges).toContainEqual({
            exchange: 'OrderShipped',
            type: 'fanout',
            durable: true,
        });
    });

    it('binds main queue to every type-exchange', () => {
        const t = buildConsumerTopology('q-self', ['A', 'B'], baseOpts);
        expect(t.queueBindings).toContainEqual({ exchange: 'A', queue: 'q-self' });
        expect(t.queueBindings).toContainEqual({ exchange: 'B', queue: 'q-self' });
    });

    it('merges caller queueArguments into the main queue', () => {
        const t = buildConsumerTopology(
            'q-self',
            [],
            resolveConsumerOptions({
                url: '',
                consumer: { maxRetries: 3, queueArguments: { 'x-max-priority': 10 } },
            }),
        );
        const main = t.queues.find((q) => q.queue === 'q-self');
        expect(main?.arguments?.['x-max-priority']).toBe(10);
    });
});

describe('exchangeNameForType', () => {
    it('strips dots from the .NET FullName (master convention)', () => {
        expect(exchangeNameForType('MyApp.Messages.OrderPlaced')).toBe('MyAppMessagesOrderPlaced');
    });
    it('is a no-op for a name without dots', () => {
        expect(exchangeNameForType('OrderPlaced')).toBe('OrderPlaced');
    });
    it('removes every dot, not just the first', () => {
        expect(exchangeNameForType('A.B.C.D')).toBe('ABCD');
    });
});

describe('consumer topology uses derived exchange names', () => {
    it('declares and binds the type exchange as FullName-stripped', () => {
        const topo = buildConsumerTopology(
            'svc-queue',
            ['MyApp.Messages.OrderPlaced'],
            resolveConsumerOptions({ url: '' }),
        );
        expect(topo.exchanges).toContainEqual({
            exchange: 'MyAppMessagesOrderPlaced',
            type: 'fanout',
            durable: true,
        });
        expect(topo.queueBindings).toContainEqual({
            exchange: 'MyAppMessagesOrderPlaced',
            queue: 'svc-queue',
        });
    });
});
