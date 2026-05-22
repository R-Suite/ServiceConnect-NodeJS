export interface RabbitMQTransportOptions {
  /** AMQP URL — single source of truth for host, port, vhost, credentials. */
  url: string;
  /** Connection-level tuning passed through to rabbitmq-client. */
  acquireTimeout?: number;
  heartbeat?: number;
  retryLow?: number;
  retryHigh?: number;
  /** Connection name shown in RabbitMQ management UI. */
  connectionName?: string;
  /** Optional lookup of polymorphic parents for a given message type. The producer declares
   *  exchange-to-exchange bindings derived → parent at publish time so subscribers bound
   *  to the parent receive derived messages. Typically wired with `registry.parentsOf` from
   *  `@serviceconnect/core`. */
  parentsOf?: (typeName: string) => readonly string[];
  producer?: {
    publishConfirmTimeoutMs?: number;
    maxAttempts?: number;
    maxMessageSize?: number;
  };
  consumer?: {
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
  };
}

export interface ResolvedProducerOptions {
  readonly publishConfirmTimeoutMs: number;
  readonly maxAttempts: number;
  readonly maxMessageSize: number;
}

export interface ResolvedConsumerOptions {
  readonly prefetch: number;
  readonly retryDelay: number;
  readonly maxRetries: number;
  readonly errorQueue: string | null;
  readonly auditQueue: string;
  readonly auditEnabled: boolean;
  readonly deadLetterUnhandled: boolean;
  readonly queueArguments: Readonly<Record<string, unknown>>;
  readonly retryQueueArguments: Readonly<Record<string, unknown>>;
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
    prefetch: c.prefetch ?? 100,
    retryDelay: c.retryDelay ?? 3000,
    maxRetries: c.maxRetries ?? 3,
    errorQueue: c.errorQueue === null ? null : (c.errorQueue ?? 'errors'),
    auditQueue: c.auditQueue ?? 'audit',
    auditEnabled: c.auditEnabled ?? false,
    deadLetterUnhandled: c.deadLetterUnhandled ?? false,
    queueArguments: c.queueArguments ?? {},
    retryQueueArguments: c.retryQueueArguments ?? {},
  };
}
