import type { ResolvedConsumerOptions } from './options.js';

/**
 * Derives the pub/sub fanout exchange name from a message type, matching the C# `master`
 * convention `Type.FullName.Replace(".", "")` so Node and .NET share the same exchange.
 * The registered type name is the .NET FullName (Phase 1), e.g. "MyApp.Messages.OrderPlaced"
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
    retriesExchange: string;
    mainBackExchange: string;
    retryQueue: string;
}

export function buildTypeExchangeSpec(typeName: string): ExchangeSpec {
    return { exchange: exchangeNameForType(typeName), type: 'fanout', durable: true };
}

export function buildRetryExchangeNames(queueName: string): RetryExchangeNames {
    return {
        retriesExchange: `${queueName}.Retries.Exchange`,
        mainBackExchange: `${queueName}.MainBack.Exchange`,
        retryQueue: `${queueName}.Retries`,
    };
}

export function buildConsumerTopology(
    queueName: string,
    messageTypes: readonly string[],
    opts: ResolvedConsumerOptions,
): ConsumerTopology {
    const names = buildRetryExchangeNames(queueName);

    const queues: QueueSpec[] = [
        {
            queue: queueName,
            durable: true,
            arguments: {
                ...opts.queueArguments,
                'x-dead-letter-exchange': names.retriesExchange,
                'x-dead-letter-routing-key': queueName,
            },
        },
        {
            queue: names.retryQueue,
            durable: true,
            arguments: {
                ...opts.retryQueueArguments,
                'x-message-ttl': opts.retryDelay,
                'x-dead-letter-exchange': names.mainBackExchange,
            },
        },
    ];

    if (opts.errorQueue !== null) {
        queues.push({ queue: opts.errorQueue, durable: true });
    }

    if (opts.auditEnabled) {
        queues.push({ queue: opts.auditQueue, durable: true });
    }

    const exchanges: ExchangeSpec[] = [
        { exchange: names.retriesExchange, type: 'direct', durable: true },
        { exchange: names.mainBackExchange, type: 'fanout', durable: true },
        ...messageTypes.map(buildTypeExchangeSpec),
    ];

    const queueBindings: QueueBindingSpec[] = [
        { exchange: names.retriesExchange, queue: names.retryQueue, routingKey: queueName },
        { exchange: names.mainBackExchange, queue: queueName },
        ...messageTypes.map((typeName) => ({
            exchange: exchangeNameForType(typeName),
            queue: queueName,
        })),
    ];

    return { queues, exchanges, queueBindings };
}
