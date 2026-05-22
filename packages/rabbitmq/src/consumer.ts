import type { ConsumeCallback, ConsumeResult, ITransportConsumer } from '@serviceconnect/core';
import type { AsyncMessage, Connection, Consumer, Publisher } from 'rabbitmq-client';
import { publishAudit } from './audit.js';
import { toEnvelope } from './envelope.js';
import type { ResolvedConsumerOptions } from './options.js';
import { decideDispositionAction } from './retry.js';
import { buildConsumerTopology, buildRetryExchangeNames } from './topology.js';

export interface ConsumerSnapshot {
  readonly isConnected: boolean;
  readonly isCancelledByBroker: boolean;
  readonly isStopped: boolean;
  readonly queueName: string | null;
  readonly consumedCount: number;
  readonly lastConsumedAt: string | null;
}

export interface RabbitMQConsumer extends ITransportConsumer {
  snapshot(): ConsumerSnapshot;
}

function readRetryCount(msg: AsyncMessage): number {
  const raw = msg.headers?.RetryCount;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') return Number.parseInt(raw, 10) || 0;
  return 0;
}

export function createConsumer(
  connection: Connection,
  opts: ResolvedConsumerOptions,
): RabbitMQConsumer {
  let started = false;
  let stopped = false;
  let cancelledByBroker = false;
  let queueName: string | null = null;
  let consumedCount = 0;
  let lastConsumedAt: string | null = null;
  let consumer: Consumer | undefined;
  let dispatchPublisher: Publisher | undefined;
  const ac = new AbortController();

  async function declareTopology(name: string, messageTypes: readonly string[]): Promise<void> {
    const topology = buildConsumerTopology(name, messageTypes, opts);
    for (const queue of topology.queues) {
      await connection.queueDeclare({
        queue: queue.queue,
        durable: queue.durable,
        arguments: queue.arguments,
      });
    }
    for (const exchange of topology.exchanges) {
      await connection.exchangeDeclare({
        exchange: exchange.exchange,
        type: exchange.type,
        durable: exchange.durable,
      });
    }
    for (const binding of topology.queueBindings) {
      await connection.queueBind({
        exchange: binding.exchange,
        queue: binding.queue,
        // AMQP queue.bind requires a routing key field; fanout ignores it
        // but topic/direct bindings (added later) require an explicit value.
        routingKey: binding.routingKey ?? '',
      });
    }
  }

  async function handle(msg: AsyncMessage, callback: ConsumeCallback): Promise<void> {
    const envelope = toEnvelope(msg);
    const retryCount = readRetryCount(msg);
    let result: ConsumeResult;
    try {
      result = await callback(envelope, ac.signal);
    } catch (error) {
      // Coerce thrown handler errors into a non-terminal failure result so that the
      // dispatch-publisher retry-queue routing runs. If we re-threw here, rabbitmq-client
      // would auto-nack and the broker's own redelivery would bypass our retry-count
      // tracking and TTL'd retry queue. Keeping retries in-process is the design contract.
      const err = error instanceof Error ? error : new Error(String(error));
      result = { success: false, notHandled: false, terminalFailure: false, error: err };
    }

    consumedCount += 1;
    lastConsumedAt = new Date().toISOString();

    const action = decideDispositionAction({
      result,
      retryCount,
      maxRetries: opts.maxRetries,
      errorQueue: opts.errorQueue,
      deadLetterUnhandled: opts.deadLetterUnhandled,
    });

    const publisher = dispatchPublisher;
    if (!publisher) {
      // Unreachable in practice: dispatchPublisher is assigned synchronously before
      // createConsumer registers this handler in start(). Throw rather than silent
      // drop so the broker redelivers via standard nack rather than losing the message.
      throw new Error('dispatch publisher not initialised; consumer not fully started');
    }

    if (action.kind === 'ack') {
      if (opts.auditEnabled && result.success && !result.notHandled) {
        await publishAudit(publisher, opts.auditQueue, msg);
      }
      return;
    }

    if (action.kind === 'ackAndLog') {
      // No republish (errorQueue is null); the Bus-layer logger handles the message.
      return;
    }

    if (action.kind === 'republishToRetry') {
      const names = buildRetryExchangeNames(queueName ?? '');
      await publisher.send(
        {
          exchange: names.retriesExchange,
          routingKey: queueName ?? '',
          headers: {
            ...(msg.headers ?? {}),
            RetryCount: action.newRetryCount,
          },
        },
        msg.body,
      );
      return;
    }

    // republishToError
    const headers: Record<string, unknown> = {
      ...(msg.headers ?? {}),
    };
    if (action.error) {
      const stack = action.error.stack;
      headers.Exception = `${action.error.message}${stack ? `\n${stack.slice(0, 2048)}` : ''}`;
    }
    if (action.reason === 'terminal') {
      headers.TerminalFailure = 'true';
    }
    if (typeof action.finalRetryCount === 'number') {
      headers.RetryCount = action.finalRetryCount;
    }
    await publisher.send({ exchange: '', routingKey: action.errorQueue, headers }, msg.body);
  }

  return {
    get isConnected(): boolean {
      return Boolean((connection as unknown as { ready?: boolean }).ready) && !cancelledByBroker;
    },
    get isStopped(): boolean {
      return stopped;
    },
    get isCancelledByBroker(): boolean {
      return cancelledByBroker;
    },

    async start(name, messageTypes, callback) {
      if (stopped) {
        throw new Error('consumer is stopped; create a new transport to resume');
      }
      if (started) {
        throw new Error('consumer is already started');
      }
      started = true;
      queueName = name;

      await declareTopology(name, messageTypes);
      dispatchPublisher = connection.createPublisher({ confirm: true });
      consumer = connection.createConsumer(
        { queue: name, qos: { prefetch: opts.prefetch } },
        async (msg) => {
          await handle(msg, callback);
        },
      );
      consumer.on('error', () => {
        // Errors are surfaced via isCancelledByBroker / isConnected; logging is the bus layer's job.
      });
      consumer.on('cancel', () => {
        cancelledByBroker = true;
      });
    },

    async stop() {
      if (stopped) return;
      stopped = true;
      ac.abort();
      if (consumer) {
        await consumer.close();
      }
      if (dispatchPublisher) {
        await dispatchPublisher.close();
      }
    },

    async [Symbol.asyncDispose]() {
      await this.stop();
      await connection.close();
    },

    snapshot() {
      const connected = Boolean((connection as unknown as { ready?: boolean }).ready);
      return {
        isConnected: connected && !cancelledByBroker,
        isCancelledByBroker: cancelledByBroker,
        isStopped: stopped,
        queueName,
        consumedCount,
        lastConsumedAt,
      };
    },
  };
}
