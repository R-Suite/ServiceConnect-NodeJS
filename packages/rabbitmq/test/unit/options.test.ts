import { describe, expect, it } from 'vitest';
import {
    type RabbitMQTransportOptions,
    resolveConsumerOptions,
    resolveProducerOptions,
} from '../../src/options.js';

describe('resolveProducerOptions', () => {
    it('returns defaults when no producer options supplied', () => {
        const opts: RabbitMQTransportOptions = { url: 'amqp://localhost' };
        const resolved = resolveProducerOptions(opts);
        expect(resolved.publishConfirmTimeoutMs).toBe(30_000);
        expect(resolved.maxAttempts).toBe(3);
        expect(resolved.maxMessageSize).toBe(128 * 1024 * 1024);
    });

    it('caller overrides win', () => {
        const opts: RabbitMQTransportOptions = {
            url: 'amqp://localhost',
            producer: { maxAttempts: 7, maxMessageSize: 1024 },
        };
        const resolved = resolveProducerOptions(opts);
        expect(resolved.maxAttempts).toBe(7);
        expect(resolved.maxMessageSize).toBe(1024);
        expect(resolved.publishConfirmTimeoutMs).toBe(30_000);
    });
});

describe('resolveConsumerOptions', () => {
    it('returns defaults when no consumer options supplied', () => {
        const opts: RabbitMQTransportOptions = { url: 'amqp://localhost' };
        const resolved = resolveConsumerOptions(opts);
        expect(resolved.prefetch).toBe(100);
        expect(resolved.retryDelay).toBe(3000);
        expect(resolved.maxRetries).toBe(3);
        expect(resolved.errorQueue).toBe('errors');
        expect(resolved.auditQueue).toBe('audit');
        expect(resolved.auditEnabled).toBe(false);
        expect(resolved.deadLetterUnhandled).toBe(false);
        expect(resolved.queueArguments).toEqual({});
        expect(resolved.retryQueueArguments).toEqual({});
        expect(resolved.errorQueueArguments).toEqual({});
        expect(resolved.auditQueueArguments).toEqual({});
    });

    it('caller overrides win', () => {
        const opts: RabbitMQTransportOptions = {
            url: 'amqp://localhost',
            consumer: {
                prefetch: 50,
                retryDelay: 1000,
                maxRetries: 5,
                errorQueue: 'my-errors',
                auditEnabled: true,
                queueArguments: { 'x-max-priority': 10 },
                errorQueueArguments: { 'x-queue-type': 'quorum' },
                auditQueueArguments: { 'x-queue-type': 'quorum' },
            },
        };
        const resolved = resolveConsumerOptions(opts);
        expect(resolved.prefetch).toBe(50);
        expect(resolved.retryDelay).toBe(1000);
        expect(resolved.maxRetries).toBe(5);
        expect(resolved.errorQueue).toBe('my-errors');
        expect(resolved.auditEnabled).toBe(true);
        expect(resolved.queueArguments).toEqual({ 'x-max-priority': 10 });
        expect(resolved.errorQueueArguments).toEqual({ 'x-queue-type': 'quorum' });
        expect(resolved.auditQueueArguments).toEqual({ 'x-queue-type': 'quorum' });
    });

    it('errorQueue: null opts out of error-queue routing', () => {
        const opts: RabbitMQTransportOptions = {
            url: 'amqp://localhost',
            consumer: { errorQueue: null },
        };
        const resolved = resolveConsumerOptions(opts);
        expect(resolved.errorQueue).toBeNull();
    });
});
