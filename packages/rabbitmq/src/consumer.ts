import type EventEmitter from 'node:events';
import {
    type ConsumeCallback,
    type ConsumeResult,
    type ITransportConsumer,
    OUTCOME_ERROR,
    OUTCOME_RETRY,
    OUTCOME_SUCCESS,
    messagingSystemAttributes,
} from '@serviceconnect/core';
import type { AsyncMessage, Connection, Consumer, Publisher } from 'rabbitmq-client';
import { publishAudit } from './audit.js';
import { toEnvelope } from './envelope.js';
import type { ResolvedConsumerOptions } from './options.js';
import { type DispositionAction, decideDispositionAction } from './retry.js';
import { emitConsumeMetrics } from './telemetry.js';
import { buildConsumerTopology, buildRetryExchangeNames } from './topology.js';

function outcomeForAction(kind: DispositionAction['kind']): string {
    switch (kind) {
        case 'ack':
            return OUTCOME_SUCCESS;
        case 'republishToRetry':
            return OUTCOME_RETRY;
        // republishToError and ackAndLog both represent a failed message (dead-lettered or
        // logged-and-acked because no error queue is configured).
        default:
            return OUTCOME_ERROR;
    }
}

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
    // True only while the underlying rabbitmq-client Consumer is actively consuming (it has emitted
    // 'ready' and not since emitted 'error'). Drives isConnected so a consumer that the broker
    // cancelled — or that is stuck reconnect-looping on a failing passive declare after its queue was
    // deleted — reports unhealthy instead of healthy.
    let consuming = false;
    let queueName: string | null = null;
    let consumedCount = 0;
    let lastConsumedAt: string | null = null;
    let consumer: Consumer | undefined;
    let dispatchPublisher: Publisher | undefined;
    const ac = new AbortController();

    // Constant messaging.system / protocol / server.* tags, built once for the consumer's lifetime.
    const metricBase = messagingSystemAttributes({
        serverAddress: opts.serverAddress,
        serverPort: opts.serverPort,
    });

    async function declareTopology(name: string, messageTypes: readonly string[]): Promise<void> {
        const topology = buildConsumerTopology(name, messageTypes, opts);
        for (const queue of topology.queues) {
            try {
                await connection.queueDeclare({
                    queue: queue.queue,
                    durable: queue.durable,
                    arguments: queue.arguments,
                });
            } catch (err) {
                // PRECONDITION_FAILED means the queue already exists with different
                // arguments (e.g. a plain error queue being re-declared with DLX args).
                // Fall back to a passive declare which just asserts the queue exists.
                const msg = err instanceof Error ? err.message : String(err);
                if (msg.includes('PRECONDITION_FAILED') || msg.includes('inequivalent arg')) {
                    await connection.queueDeclare({ queue: queue.queue, passive: true });
                } else {
                    throw err;
                }
            }
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
        const start = performance.now();
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

        // Emit process.duration + consumed.messages (tagged by outcome) before disposition
        // routing so every return path below is covered. The disposition action is the
        // authoritative outcome: ack=success, retry, dead-letter/log=error.
        const outcome = outcomeForAction(action.kind);
        const errorType = outcome === OUTCOME_ERROR ? result.error?.name : undefined;
        emitConsumeMetrics(
            metricBase,
            queueName ?? 'anonymous',
            (performance.now() - start) / 1000,
            outcome,
            errorType,
        );

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
                    // durable:true so the message survives a broker restart while parked in the durable retry
                    // queue — the producer publishes everything persistent, and the retry/error queues are
                    // declared durable, so a transient republish would otherwise be silently lost.
                    durable: true,
                    contentType: msg.contentType,
                    contentEncoding: msg.contentEncoding,
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
        // durable:true so a dead-lettered message survives a broker restart in the durable error queue.
        await publisher.send(
            {
                exchange: '',
                routingKey: action.errorQueue,
                durable: true,
                contentType: msg.contentType,
                contentEncoding: msg.contentEncoding,
                headers,
            },
            msg.body,
        );
    }

    return {
        get isConnected(): boolean {
            return (
                Boolean((connection as unknown as { ready?: boolean }).ready) &&
                consuming &&
                !cancelledByBroker
            );
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
                {
                    queue: name,
                    // passive:true means "assert the queue exists without re-declaring it",
                    // which avoids a PRECONDITION_FAILED error when declareTopology has
                    // already created the queue as durable:true and rabbitmq-client's
                    // internal consumer setup would otherwise re-declare with durable:false.
                    queueOptions: { passive: true },
                    qos: { prefetchCount: opts.prefetch },
                    // Only set concurrency when configured; otherwise rabbitmq-client defaults to unbounded
                    // (up to prefetch), preserving existing behaviour.
                    ...(opts.concurrency !== undefined ? { concurrency: opts.concurrency } : {}),
                },
                async (msg) => {
                    await handle(msg, callback);
                },
            );
            // rabbitmq-client emits 'ready' once basicConsume is acknowledged and re-emits it after each
            // successful reconnect; it emits 'error' on a server-side basic.cancel (e.g. the queue was
            // deleted) and on every failed setup/reconnect. There is no 'cancel' event. Track the live
            // consuming state from these transitions.
            consumer.on('ready', () => {
                consuming = true;
                cancelledByBroker = false;
            });
            consumer.on('error', () => {
                // If we were consuming and then errored, the broker dropped/cancelled the consumer. It stays
                // cancelled until a subsequent 'ready' clears it (which never comes if, e.g., the queue was
                // deleted and the passive re-declare keeps failing).
                if (consuming) cancelledByBroker = true;
                consuming = false;
            });
            // Wait until the broker has acknowledged our basicConsume so that
            // callers can immediately publish after start() resolves without
            // hitting a race where messages arrive before the consumer is ready.
            await new Promise<void>((resolve, reject) => {
                const c = consumer as unknown as EventEmitter;
                c.once('ready', resolve);
                c.once('error', reject);
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
                isConnected: connected && consuming && !cancelledByBroker,
                isCancelledByBroker: cancelledByBroker,
                isStopped: stopped,
                queueName,
                consumedCount,
                lastConsumedAt,
            };
        },
    };
}
