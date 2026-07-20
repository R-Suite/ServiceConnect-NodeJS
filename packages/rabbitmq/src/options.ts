export interface RabbitMQTransportOptions {
    /** AMQP URL — single source of truth for host, port, vhost, credentials. */
    url: string;
    /**
     * TLS configuration forwarded to rabbitmq-client. Pass `true` to enable TLS with the default CA
     * store (equivalent to an `amqps://` URL), or a node:tls connection-options object to supply a
     * custom CA, client certificate/key, or pfx for mutual-TLS / private-CA brokers.
     */
    tls?: boolean | import('node:tls').ConnectionOptions;
    /**
     * Invoked when a connection emits an `error` (typically a transient broker disconnect, which
     * rabbitmq-client recovers from by auto-reconnecting). Use for logging/metrics. If omitted,
     * connection errors are swallowed so a transient disconnect never becomes an uncaught exception
     * that crashes the process.
     */
    onConnectionError?: (error: Error, role: 'producer' | 'consumer') => void;
    /** Connection-level tuning passed through to rabbitmq-client. */
    acquireTimeout?: number;
    heartbeat?: number;
    retryLow?: number;
    retryHigh?: number;
    /** Connection name shown in RabbitMQ management UI. */
    connectionName?: string;
    /** Optional lookup of polymorphic parents for a given message type. At publish time the
     *  producer publishes a copy of a derived message to its own exchange and to every declared
     *  parent's exchange (the ancestor closure), so subscribers bound to a parent receive derived
     *  messages. Typically wired with `registry.parentsOf` from `@serviceconnect/core`. */
    parentsOf?: (typeName: string) => readonly string[];
    producer?: {
        publishConfirmTimeoutMs?: number;
        maxAttempts?: number;
        maxMessageSize?: number;
    };
    consumer?: {
        /**
         * Maximum number of messages processed concurrently by this consumer. Unset (the default)
         * leaves it unbounded (rabbitmq-client processes up to `prefetch` messages at once). Set to 1
         * for strict in-order, one-at-a-time processing — e.g. when sagas or other handlers require a
         * message and its follow-ups to be processed in the order they were published.
         */
        concurrency?: number;
        prefetch?: number;
        retryDelay?: number;
        maxRetries?: number;
        /** Set to `null` to disable error-queue routing (retry-exhaustion and terminal-failure paths log+ack instead). */
        errorQueue?: string | null;
        auditQueue?: string;
        auditEnabled?: boolean;
        deadLetterUnhandled?: boolean;
        queueArguments?: Record<string, unknown>;
        retryQueueArguments?: Record<string, unknown>;
        errorQueueArguments?: Record<string, unknown>;
        auditQueueArguments?: Record<string, unknown>;
    };
}

export interface ResolvedProducerOptions {
    readonly publishConfirmTimeoutMs: number;
    readonly maxAttempts: number;
    readonly maxMessageSize: number;
}

export interface ResolvedConsumerOptions {
    /** Max concurrent in-flight messages; undefined = unbounded (rabbitmq-client default). */
    readonly concurrency?: number;
    readonly prefetch: number;
    readonly retryDelay: number;
    readonly maxRetries: number;
    readonly errorQueue: string | null;
    readonly auditQueue: string;
    readonly auditEnabled: boolean;
    readonly deadLetterUnhandled: boolean;
    readonly queueArguments: Readonly<Record<string, unknown>>;
    readonly retryQueueArguments: Readonly<Record<string, unknown>>;
    readonly errorQueueArguments: Readonly<Record<string, unknown>>;
    readonly auditQueueArguments: Readonly<Record<string, unknown>>;
}

export function resolveProducerOptions(opts: RabbitMQTransportOptions): ResolvedProducerOptions {
    const p = opts.producer ?? {};
    return {
        publishConfirmTimeoutMs: p.publishConfirmTimeoutMs ?? 30_000,
        maxAttempts: p.maxAttempts ?? 3,
        maxMessageSize: p.maxMessageSize ?? 128 * 1024 * 1024,
    };
}

export function resolveConsumerOptions(opts: RabbitMQTransportOptions): ResolvedConsumerOptions {
    const c = opts.consumer ?? {};
    return {
        concurrency: c.concurrency,
        prefetch: c.prefetch ?? 100,
        retryDelay: c.retryDelay ?? 3000,
        maxRetries: c.maxRetries ?? 3,
        errorQueue: c.errorQueue === null ? null : (c.errorQueue ?? 'errors'),
        auditQueue: c.auditQueue ?? 'audit',
        auditEnabled: c.auditEnabled ?? false,
        deadLetterUnhandled: c.deadLetterUnhandled ?? false,
        queueArguments: c.queueArguments ?? {},
        retryQueueArguments: c.retryQueueArguments ?? {},
        errorQueueArguments: c.errorQueueArguments ?? {},
        auditQueueArguments: c.auditQueueArguments ?? {},
    };
}
