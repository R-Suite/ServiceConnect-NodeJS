import { describe, expect, it } from 'vitest';
import {
    buildConsumerTopology,
    buildRetryExchangeNames,
    buildTypeExchangeSpec,
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

describe('buildRetryExchangeNames', () => {
    it('derives retry-routing exchange names from the queue name', () => {
        const names = buildRetryExchangeNames('q-self');
        expect(names.retriesExchange).toBe('q-self.Retries.Exchange');
        expect(names.mainBackExchange).toBe('q-self.MainBack.Exchange');
        expect(names.retryQueue).toBe('q-self.Retries');
    });
});

describe('buildConsumerTopology', () => {
    const baseOpts = {
        prefetch: 100,
        retryDelay: 3000,
        maxRetries: 3,
        errorQueue: 'errors' as const,
        auditQueue: 'audit',
        auditEnabled: false,
        deadLetterUnhandled: false,
        queueArguments: {},
        retryQueueArguments: {},
    };

    it('declares the main queue with dead-letter routing back to the retries exchange', () => {
        const t = buildConsumerTopology('q-self', ['OrderCreated'], baseOpts);
        const main = t.queues.find((q) => q.queue === 'q-self');
        expect(main).toBeDefined();
        expect(main?.durable).toBe(true);
        expect(main?.arguments?.['x-dead-letter-exchange']).toBe('q-self.Retries.Exchange');
        expect(main?.arguments?.['x-dead-letter-routing-key']).toBe('q-self');
    });

    it('declares the retry queue with TTL and dead-letter routing back to the main-back exchange', () => {
        const t = buildConsumerTopology('q-self', [], baseOpts);
        const retry = t.queues.find((q) => q.queue === 'q-self.Retries');
        expect(retry).toBeDefined();
        expect(retry?.arguments?.['x-message-ttl']).toBe(3000);
        expect(retry?.arguments?.['x-dead-letter-exchange']).toBe('q-self.MainBack.Exchange');
    });

    it('declares the error queue when errorQueue is non-null', () => {
        const t = buildConsumerTopology('q-self', [], baseOpts);
        expect(t.queues.find((q) => q.queue === 'errors')).toBeDefined();
    });

    it('omits the error queue when errorQueue is null', () => {
        const t = buildConsumerTopology('q-self', [], { ...baseOpts, errorQueue: null });
        expect(t.queues.find((q) => q.queue === 'errors')).toBeUndefined();
    });

    it('declares the audit queue only when auditEnabled is true', () => {
        const off = buildConsumerTopology('q-self', [], baseOpts);
        expect(off.queues.find((q) => q.queue === 'audit')).toBeUndefined();
        const on = buildConsumerTopology('q-self', [], { ...baseOpts, auditEnabled: true });
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

    it('declares helper exchanges for retry routing', () => {
        const t = buildConsumerTopology('q-self', [], baseOpts);
        expect(t.exchanges).toContainEqual({
            exchange: 'q-self.Retries.Exchange',
            type: 'direct',
            durable: true,
        });
        expect(t.exchanges).toContainEqual({
            exchange: 'q-self.MainBack.Exchange',
            type: 'fanout',
            durable: true,
        });
    });

    it('binds main queue to every type-exchange', () => {
        const t = buildConsumerTopology('q-self', ['A', 'B'], baseOpts);
        expect(t.queueBindings).toContainEqual({ exchange: 'A', queue: 'q-self' });
        expect(t.queueBindings).toContainEqual({ exchange: 'B', queue: 'q-self' });
    });

    it('binds retry queue to retries exchange with queue name as routing key', () => {
        const t = buildConsumerTopology('q-self', [], baseOpts);
        expect(t.queueBindings).toContainEqual({
            exchange: 'q-self.Retries.Exchange',
            queue: 'q-self.Retries',
            routingKey: 'q-self',
        });
    });

    it('binds main queue to mainBack exchange so retried messages return', () => {
        const t = buildConsumerTopology('q-self', [], baseOpts);
        expect(t.queueBindings).toContainEqual({
            exchange: 'q-self.MainBack.Exchange',
            queue: 'q-self',
        });
    });

    it('merges caller queueArguments with framework keys winning on collision', () => {
        const t = buildConsumerTopology('q-self', [], {
            ...baseOpts,
            queueArguments: { 'x-max-priority': 10, 'x-dead-letter-exchange': 'caller-override' },
        });
        const main = t.queues.find((q) => q.queue === 'q-self');
        expect(main?.arguments?.['x-max-priority']).toBe(10);
        expect(main?.arguments?.['x-dead-letter-exchange']).toBe('q-self.Retries.Exchange');
    });
});
