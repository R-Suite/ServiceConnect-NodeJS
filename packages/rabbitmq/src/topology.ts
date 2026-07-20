import type { ResolvedConsumerOptions } from './options.js';

/**
 * Derives the pub/sub fanout exchange name from a message type, matching the C# `master`
 * convention `Type.FullName.Replace(".", "")` so Node and .NET share the same exchange.
 * The registered type name is the .NET FullName, e.g. "MyApp.Messages.OrderPlaced"
 * -> "MyAppMessagesOrderPlaced".
 */
export function exchangeNameForType(typeName: string): string {
    return typeName.replace(/\./g, '');
}

export interface ExchangeSpec {
    exchange: string;
    type: 'fanout' | 'direct' | 'topic' | 'headers';
    durable: boolean;
}

export interface QueueSpec {
    queue: string;
    durable: boolean;
    arguments?: Record<string, unknown>;
}

export interface QueueBindingSpec {
    exchange: string;
    queue: string;
    routingKey?: string;
}

export interface ConsumerTopology {
    queues: QueueSpec[];
    exchanges: ExchangeSpec[];
    queueBindings: QueueBindingSpec[];
}

export interface RetryExchangeNames {
    retryQueue: string;
    deadLetterExchange: string;
}

export function buildTypeExchangeSpec(typeName: string): ExchangeSpec {
    return { exchange: exchangeNameForType(typeName), type: 'fanout', durable: true };
}

export function buildRetryExchangeNames(queueName: string): RetryExchangeNames {
    return {
        retryQueue: `${queueName}.Retries`,
        deadLetterExchange: `${queueName}.Retries.DeadLetter`,
    };
}

export function buildConsumerTopology(
    queueName: string,
    messageTypes: readonly string[],
    opts: ResolvedConsumerOptions,
): ConsumerTopology {
    const names = buildRetryExchangeNames(queueName);

    // Main queue carries only the caller's arguments (master keeps it plain re: retries).
    const queues: QueueSpec[] = [
        { queue: queueName, durable: true, arguments: { ...opts.queueArguments } },
    ];
    const exchanges: ExchangeSpec[] = [];
    const queueBindings: QueueBindingSpec[] = [];

    if (opts.maxRetries > 0) {
        queues.push({
            queue: names.retryQueue,
            durable: true,
            arguments: {
                ...opts.retryQueueArguments,
                'x-message-ttl': opts.retryDelay,
                'x-dead-letter-exchange': names.deadLetterExchange,
            },
        });
        exchanges.push({ exchange: names.deadLetterExchange, type: 'direct', durable: true });
        queueBindings.push({
            exchange: names.deadLetterExchange,
            queue: queueName,
            routingKey: names.retryQueue,
        });
    }

    if (opts.errorQueue !== null) {
        exchanges.push({ exchange: opts.errorQueue, type: 'direct', durable: false });
        queues.push({
            queue: opts.errorQueue,
            durable: true,
            arguments: { ...opts.errorQueueArguments },
        });
        queueBindings.push({ exchange: opts.errorQueue, queue: opts.errorQueue, routingKey: '' });
    }
    if (opts.auditEnabled) {
        exchanges.push({ exchange: opts.auditQueue, type: 'direct', durable: false });
        queues.push({
            queue: opts.auditQueue,
            durable: true,
            arguments: { ...opts.auditQueueArguments },
        });
        queueBindings.push({ exchange: opts.auditQueue, queue: opts.auditQueue, routingKey: '' });
    }

    for (const typeName of messageTypes) {
        exchanges.push(buildTypeExchangeSpec(typeName));
        queueBindings.push({ exchange: exchangeNameForType(typeName), queue: queueName });
    }

    return { queues, exchanges, queueBindings };
}
