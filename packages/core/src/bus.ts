import type { Aggregator } from './aggregator/aggregator.js';
import { runAggregatorBranch } from './aggregator/dispatch.js';
import { AggregatorFlushTimer } from './aggregator/flush-timer.js';
import { AggregatorRegistry } from './aggregator/registry.js';
import type { Envelope } from './envelope.js';
import {
    ArgumentError,
    ArgumentOutOfRangeError,
    InvalidOperationError,
    MessageTypeNotRegisteredError,
    OutgoingFiltersBlockedError,
    RequestSendCancelledError,
    RoutingSlipDestinationError,
} from './errors.js';
import { FilterPipeline } from './filter-pipeline.js';
import { createDispatcher } from './handlers/dispatch.js';
import type { Handler } from './handlers/index.js';
import { HandlerRegistry } from './handlers/registry.js';
import { type Logger, consoleLogger } from './logger.js';
import type { Message } from './message.js';
import { newMessageId } from './message.js';
import type { PublishOptions } from './options/publish.js';
import type { ReplyOptions } from './options/reply.js';
import type { RequestOptions } from './options/request.js';
import type { SendOptions } from './options/send.js';
import type { IAggregatorStore } from './persistence/aggregator-store.js';
import type { ProcessData } from './persistence/saga-store.js';
import {
    FilterAction,
    type FilterRegistration,
    type MiddlewareRegistration,
    type PipelineStage,
} from './pipeline/index.js';
import {
    type ProcessBuilder,
    type ProcessRuntimeOptions,
    createProcessBuilder,
} from './process/builder.js';
import { runSagaBranch } from './process/dispatch.js';
import { ProcessRegistry } from './process/registry.js';
import { TimeoutPoller } from './process/timeout-poller.js';
import { RequestReplyManager } from './request-reply.js';
import { forwardRoutingSlipIfPresent } from './routing/dispatch.js';
import {
    ROUTING_SLIP_HEADER,
    assertValidDestination,
    serialiseRoutingSlip,
} from './routing/index.js';
import { jsonSerializer } from './serialization/json.js';
import { type IMessageTypeRegistry, createMessageTypeRegistry } from './serialization/registry.js';
import type { IMessageSerializer } from './serialization/serializer.js';
import type { StandardSchemaV1 } from './serialization/standard-schema.js';
import { StreamRegistry, runStreamBranch } from './streaming/dispatch.js';
import { type StreamSender, createStreamSender } from './streaming/sender.js';
import { senderToWritableStream } from './streaming/web-streams.js';
import type { ConsumeCallback, ITransportConsumer, ITransportProducer } from './transport.js';
import { decodeWireHeaders, encodeWireHeaders } from './wire/headers.js';

export interface BusOptions {
    transport: { producer: ITransportProducer; consumer: ITransportConsumer };
    serializer?: IMessageSerializer;
    registry?: IMessageTypeRegistry;
    queue: { name: string };
    logger?: Logger;
    defaultRequestTimeout?: number;
    readonly timeoutPollIntervalMs?: number;
    readonly aggregatorFlushIntervalMs?: number;
    readonly consumeWrapper?: (cb: ConsumeCallback) => ConsumeCallback;
}

export interface Bus extends AsyncDisposable {
    readonly queue: string;
    readonly isStarted: boolean;
    readonly isStopped: boolean;
    readonly messageRegistry: IMessageTypeRegistry;
    readonly processRegistry: ProcessRegistry;
    readonly aggregatorRegistry: AggregatorRegistry;
    readonly consumer: ITransportConsumer;
    readonly producer: ITransportProducer;
    readonly lastConsumedAt: Date | undefined;

    registerMessage<T extends Message>(
        typeName: string,
        options?: { schema?: StandardSchemaV1<T> },
    ): this;
    handle<T extends Message>(typeName: string, handler: Handler<T>): this;
    unhandle<T extends Message>(typeName: string, handler: Handler<T>): this;
    isHandled(typeName: string): boolean;
    use(stage: PipelineStage, ...items: Array<FilterRegistration | MiddlewareRegistration>): this;

    registerProcessData<_TData extends ProcessData>(dataType: string): Bus;
    registerProcess(
        processName: string,
        options: ProcessRuntimeOptions & { dataType?: string },
    ): ProcessBuilder;

    registerAggregator<T extends Message>(
        messageType: string,
        aggregator: Aggregator<T>,
        options: { store: IAggregatorStore },
    ): Bus;

    publish<T extends Message>(
        typeName: string,
        message: T,
        options?: PublishOptions,
    ): Promise<void>;
    send<T extends Message>(typeName: string, message: T, options: SendOptions): Promise<void>;
    sendToMany<T extends Message>(
        typeName: string,
        message: T,
        endpoints: readonly string[],
        options?: Omit<SendOptions, 'endpoint'>,
    ): Promise<void>;
    route<T extends Message>(
        typeName: string,
        message: T,
        destinations: readonly string[],
        options?: SendOptions,
    ): Promise<void>;

    sendRequest<TReq extends Message, TRep extends Message>(
        typeName: string,
        message: TReq,
        options: RequestOptions,
    ): Promise<TRep>;
    sendRequestMulti<TReq extends Message, TRep extends Message>(
        typeName: string,
        message: TReq,
        options: RequestOptions,
    ): Promise<TRep[]>;
    publishRequest<TReq extends Message, TRep extends Message>(
        typeName: string,
        message: TReq,
        onReply: (reply: TRep) => void,
        options?: RequestOptions,
    ): Promise<void>;

    openStream<T extends Message>(endpoint: string, typeName: string): Promise<StreamSender<T>>;
    openWritableStream<T extends Message>(endpoint: string, typeName: string): WritableStream<T>;
    handleStream<T extends Message>(
        messageType: string,
        handler: (stream: AsyncIterable<T>) => Promise<void>,
    ): Bus;

    start(): Promise<void>;
    stop(signal?: AbortSignal): Promise<void>;
}

class BusImpl implements Bus {
    readonly queue: string;
    private _started = false;
    private _stopped = false;

    private readonly opts: BusOptions;
    readonly producer: ITransportProducer;
    readonly consumer: ITransportConsumer;
    private readonly registry: IMessageTypeRegistry;
    private _lastConsumedAt: Date | undefined;
    private readonly serializer: IMessageSerializer;
    private readonly logger: Logger;
    private readonly handlers: HandlerRegistry;
    private readonly requestReplyManager = new RequestReplyManager();
    private readonly pipelines = {
        outgoing: new FilterPipeline('outgoing'),
        before: new FilterPipeline('beforeConsuming'),
        after: new FilterPipeline('afterConsuming'),
        onSuccess: new FilterPipeline('onConsumedSuccessfully'),
    };
    private readonly _processRegistry = new ProcessRegistry();
    private readonly _aggregatorRegistry = new AggregatorRegistry();
    private readonly _streamRegistry = new StreamRegistry();
    private timeoutPollers: TimeoutPoller[] = [];
    private aggregatorFlushTimer?: AggregatorFlushTimer;

    constructor(opts: BusOptions) {
        this.opts = opts;
        this.producer = opts.transport.producer;
        this.consumer = opts.transport.consumer;
        this.registry = opts.registry ?? createMessageTypeRegistry();
        this.handlers = new HandlerRegistry(this.registry);
        this.serializer = opts.serializer ?? jsonSerializer(this.registry);
        this.logger = opts.logger ?? consoleLogger('info');
        this.queue = opts.queue.name;
    }

    get isStarted(): boolean {
        return this._started && !this._stopped;
    }

    get isStopped(): boolean {
        return this._stopped;
    }

    get lastConsumedAt(): Date | undefined {
        return this._lastConsumedAt;
    }

    get messageRegistry(): IMessageTypeRegistry {
        return this.registry;
    }

    get processRegistry(): ProcessRegistry {
        return this._processRegistry;
    }

    get aggregatorRegistry(): AggregatorRegistry {
        return this._aggregatorRegistry;
    }

    registerMessage<T extends Message>(
        typeName: string,
        options?: { schema?: StandardSchemaV1<T> },
    ): this {
        this.registry.register<T>(typeName, options);
        return this;
    }

    handle<T extends Message>(typeName: string, handler: Handler<T>): this {
        if (!this.registry.resolve(typeName)) {
            throw new MessageTypeNotRegisteredError(
                `type ${typeName} is not registered; call registerMessage() first`,
            );
        }
        this.handlers.add(typeName, handler);
        return this;
    }

    unhandle<T extends Message>(typeName: string, handler: Handler<T>): this {
        this.handlers.remove(typeName, handler);
        return this;
    }

    isHandled(typeName: string): boolean {
        return this.handlers.isHandled(typeName);
    }

    use(stage: PipelineStage, ...items: Array<FilterRegistration | MiddlewareRegistration>): this {
        const pipe = this.pipelineForStage(stage);
        for (const item of items) {
            pipe.add(item);
        }
        return this;
    }

    registerProcessData<_TData extends ProcessData>(dataType: string): Bus {
        this._processRegistry.registerDataType(dataType);
        return this;
    }

    registerProcess(
        processName: string,
        options: ProcessRuntimeOptions & { dataType?: string },
    ): ProcessBuilder {
        const explicitDataType = options.dataType;
        const dataType = explicitDataType ?? this._processRegistry.lastRegisteredDataType();
        if (explicitDataType !== undefined) {
            if (!this._processRegistry.isDataTypeRegistered(explicitDataType)) {
                throw new InvalidOperationError(
                    `process data type '${explicitDataType}' is not registered`,
                );
            }
        } else if (!dataType) {
            throw new InvalidOperationError(
                'call registerProcessData<TData>(typeName) before registerProcess',
            );
        }
        this._processRegistry.registerProcess(processName, {
            dataType: dataType as string,
            store: options.store,
            timeoutStore: options.timeoutStore,
        });
        return createProcessBuilder(this, this._processRegistry, processName);
    }

    registerAggregator<T extends Message>(
        messageType: string,
        aggregator: Aggregator<T>,
        options: { store: IAggregatorStore },
    ): Bus {
        this.registerMessage(messageType);
        this._aggregatorRegistry.register(messageType, aggregator, options.store);
        return this;
    }

    private pipelineForStage(stage: PipelineStage): FilterPipeline {
        switch (stage) {
            case 'outgoing':
                return this.pipelines.outgoing;
            case 'beforeConsuming':
                return this.pipelines.before;
            case 'afterConsuming':
                return this.pipelines.after;
            case 'onConsumedSuccessfully':
                return this.pipelines.onSuccess;
        }
    }

    async publish<T extends Message>(
        typeName: string,
        message: T,
        options?: PublishOptions,
    ): Promise<void> {
        if (!this.registry.resolve(typeName)) {
            throw new MessageTypeNotRegisteredError(
                `type ${typeName} is not registered; call registerMessage() first`,
            );
        }
        const body = this.serializer.serialize(message);
        const envelope = this.buildOutgoingEnvelope(typeName, message, body, options?.headers);
        await this.runOutgoing(envelope);
        const headers = encodeWireHeaders(envelope.headers, 'Publish');
        await this.producer.publish(typeName, body, { headers, routingKey: options?.routingKey });
    }

    async send<T extends Message>(
        typeName: string,
        message: T,
        options: SendOptions,
    ): Promise<void> {
        if (!this.registry.resolve(typeName)) {
            throw new MessageTypeNotRegisteredError(
                `type ${typeName} is not registered; call registerMessage() first`,
            );
        }
        const body = this.serializer.serialize(message);
        const envelope = this.buildOutgoingEnvelope(
            typeName,
            message,
            body,
            options.headers,
            options.endpoint,
        );
        await this.runOutgoing(envelope);
        const headers = encodeWireHeaders(envelope.headers, 'Send');
        await this.producer.send(options.endpoint, typeName, body, { headers });
    }

    async sendToMany<T extends Message>(
        typeName: string,
        message: T,
        endpoints: readonly string[],
        options?: Omit<SendOptions, 'endpoint'>,
    ): Promise<void> {
        if (!this.registry.resolve(typeName)) {
            throw new MessageTypeNotRegisteredError(
                `type ${typeName} is not registered; call registerMessage() first`,
            );
        }
        if (endpoints.length === 0) {
            throw new InvalidOperationError('sendToMany requires at least one endpoint');
        }
        const body = this.serializer.serialize(message);
        const envelope = this.buildOutgoingEnvelope(typeName, message, body, options?.headers);
        await this.runOutgoing(envelope);
        const headers = encodeWireHeaders(envelope.headers, 'Send');
        const errors: unknown[] = [];
        for (const endpoint of endpoints) {
            try {
                await this.producer.send(endpoint, typeName, body, { headers });
            } catch (err) {
                errors.push(err);
            }
        }
        if (errors.length > 0) {
            throw new AggregateError(
                errors,
                `sendToMany: ${errors.length} of ${endpoints.length} endpoints failed`,
            );
        }
    }

    async route<T extends Message>(
        typeName: string,
        message: T,
        destinations: readonly string[],
        options?: SendOptions,
    ): Promise<void> {
        if (this._stopped) {
            throw new InvalidOperationError('bus is stopped');
        }
        if (!this.registry.resolve(typeName)) {
            throw new MessageTypeNotRegisteredError(
                `type ${typeName} is not registered; call registerMessage() first`,
            );
        }
        if (destinations.length === 0) {
            throw new RoutingSlipDestinationError('route requires at least one destination');
        }
        for (const d of destinations) {
            assertValidDestination(d);
        }

        const firstDestination = destinations[0] as string;
        const remaining = destinations.slice(1);
        const body = this.serializer.serialize(message);
        const envelope = this.buildOutgoingEnvelope(
            typeName,
            message,
            body,
            options?.headers,
            firstDestination,
        );
        // Routing-slip sends must traverse the outgoing pipeline like every other send path, so
        // header-mutating filters apply and a FilterAction.Stop blocks the hop.
        await this.runOutgoing(envelope);
        const headers: Record<string, string> = {
            ...encodeWireHeaders(envelope.headers as Record<string, unknown>, 'Send'),
            [ROUTING_SLIP_HEADER]: serialiseRoutingSlip(remaining),
        };

        await this.producer.send(firstDestination, typeName, body, { headers });
    }

    private buildOutgoingEnvelope<T extends Message>(
        typeName: string,
        _message: T,
        body: Uint8Array,
        callerHeaders?: Readonly<Record<string, string>>,
        destinationAddress?: string,
    ): Envelope {
        const headers: Record<string, unknown> = { ...(callerHeaders ?? {}) };
        headers.messageType = typeName;
        headers.messageId = headers.messageId ?? newMessageId();
        headers.timeSent = new Date().toISOString();
        headers.sourceAddress = this.queue;
        if (destinationAddress) {
            headers.destinationAddress = destinationAddress;
        }
        return { headers, body };
    }

    private async runOutgoing(envelope: Envelope): Promise<void> {
        const ac = new AbortController();
        const action = await this.pipelines.outgoing.execute(envelope, {
            signal: ac.signal,
            logger: this.logger,
        });
        if (action === FilterAction.Stop) {
            throw new OutgoingFiltersBlockedError('outgoing filter returned Stop');
        }
    }

    async sendRequest<TReq extends Message, TRep extends Message>(
        typeName: string,
        message: TReq,
        options: RequestOptions,
    ): Promise<TRep> {
        if (this._stopped) {
            throw new InvalidOperationError('bus is stopped');
        }
        if (!this.registry.resolve(typeName)) {
            throw new MessageTypeNotRegisteredError(
                `type ${typeName} is not registered; call registerMessage() first`,
            );
        }
        if (typeof options.timeoutMs !== 'number' || options.timeoutMs <= 0) {
            throw new ArgumentOutOfRangeError(
                'RequestOptions.timeoutMs must be a positive number for sendRequest',
            );
        }

        const { requestMessageId, promise } = this.requestReplyManager.registerSingle<TRep>({
            timeoutMs: options.timeoutMs,
            signal: options.signal,
        });
        // The pending promise becomes the returned awaited value on the happy path. On the
        // send-failure path below we throw the original transport error to the caller — the
        // pending promise is abandoned, so swallow its rejection to keep Node's unhandled-
        // rejection handler quiet. Without this, every send failure would also log an
        // unhandled RequestSendCancelledError.
        promise.catch(() => {});

        const callerHeaders: Record<string, string> = {
            ...(options.headers ?? {}),
            requestMessageId,
            messageId: requestMessageId,
        };
        const body = this.serializer.serialize(message);
        const envelope = this.buildOutgoingEnvelope(
            typeName,
            message,
            body,
            callerHeaders,
            options.endpoint,
        );

        try {
            await this.runOutgoing(envelope);
            const headers = encodeWireHeaders(envelope.headers, 'Send');
            // No endpoint → broadcast publish (used by callers that target a fan-out exchange).
            if (options.endpoint) {
                await this.producer.send(options.endpoint, typeName, body, { headers });
            } else {
                await this.producer.publish(typeName, body, { headers });
            }
        } catch (err) {
            this.requestReplyManager.cancel(
                requestMessageId,
                new RequestSendCancelledError(
                    `sendRequest send failed before reaching the broker: ${err instanceof Error ? err.message : String(err)}`,
                    err,
                ),
            );
            throw err;
        }

        return promise;
    }

    async sendRequestMulti<TReq extends Message, TRep extends Message>(
        typeName: string,
        message: TReq,
        options: RequestOptions,
    ): Promise<TRep[]> {
        if (this._stopped) {
            throw new InvalidOperationError('bus is stopped');
        }
        if (!this.registry.resolve(typeName)) {
            throw new MessageTypeNotRegisteredError(
                `type ${typeName} is not registered; call registerMessage() first`,
            );
        }
        if (typeof options.timeoutMs !== 'number' || options.timeoutMs <= 0) {
            throw new ArgumentOutOfRangeError(
                'RequestOptions.timeoutMs must be a positive number for sendRequestMulti',
            );
        }

        const { requestMessageId, promise } = this.requestReplyManager.registerMulti<TRep>({
            timeoutMs: options.timeoutMs,
            expectedReplyCount: options.expectedReplyCount,
            signal: options.signal,
        });
        // See sendRequest for the rationale behind the .catch() rejection-swallow.
        promise.catch(() => {});

        const callerHeaders: Record<string, string> = {
            ...(options.headers ?? {}),
            requestMessageId,
            messageId: requestMessageId,
        };
        const body = this.serializer.serialize(message);
        const envelope = this.buildOutgoingEnvelope(
            typeName,
            message,
            body,
            callerHeaders,
            options.endpoint,
        );

        try {
            await this.runOutgoing(envelope);
            const headers = encodeWireHeaders(envelope.headers, 'Send');
            if (options.endpoint) {
                await this.producer.send(options.endpoint, typeName, body, { headers });
            } else {
                await this.producer.publish(typeName, body, { headers });
            }
        } catch (err) {
            this.requestReplyManager.cancel(
                requestMessageId,
                new RequestSendCancelledError(
                    `sendRequestMulti send failed before reaching the broker: ${err instanceof Error ? err.message : String(err)}`,
                    err,
                ),
            );
            throw err;
        }

        return promise;
    }

    async publishRequest<TReq extends Message, TRep extends Message>(
        typeName: string,
        message: TReq,
        onReply: (reply: TRep) => void,
        options: RequestOptions = {},
    ): Promise<void> {
        if (this._stopped) {
            throw new InvalidOperationError('bus is stopped');
        }
        if (!this.registry.resolve(typeName)) {
            throw new MessageTypeNotRegisteredError(
                `type ${typeName} is not registered; call registerMessage() first`,
            );
        }
        if (options.endpoint) {
            throw new ArgumentError(
                'publishRequest does not accept options.endpoint; use sendRequest for single-destination requests',
            );
        }
        // No caller-supplied (positive) timeoutMs → fall back to the documented default.
        // DEFAULT_REQUEST_TIMEOUT_MS is exported, but the literal is inlined here to keep this
        // method self-contained.
        const timeoutMs =
            typeof options.timeoutMs === 'number' && options.timeoutMs > 0
                ? options.timeoutMs
                : 10_000;

        const { requestMessageId, promise } = this.requestReplyManager.registerCallback<TRep>(
            onReply,
            {
                timeoutMs,
                expectedReplyCount: options.expectedReplyCount,
                signal: options.signal,
            },
        );
        // See sendRequest for the rationale behind the .catch() rejection-swallow.
        promise.catch(() => {});

        const callerHeaders: Record<string, string> = {
            ...(options.headers ?? {}),
            requestMessageId,
            messageId: requestMessageId,
        };
        const body = this.serializer.serialize(message);
        const envelope = this.buildOutgoingEnvelope(typeName, message, body, callerHeaders);

        try {
            await this.runOutgoing(envelope);
            const headers = encodeWireHeaders(envelope.headers, 'Send');
            await this.producer.publish(typeName, body, { headers });
        } catch (err) {
            this.requestReplyManager.cancel(
                requestMessageId,
                new RequestSendCancelledError(
                    `publishRequest publish failed before reaching the broker: ${err instanceof Error ? err.message : String(err)}`,
                    err,
                ),
            );
            throw err;
        }

        return promise;
    }

    async openStream<T extends Message>(
        endpoint: string,
        typeName: string,
    ): Promise<StreamSender<T>> {
        if (this._stopped) {
            throw new InvalidOperationError('bus is stopped');
        }
        if (!this.registry.resolve(typeName)) {
            throw new MessageTypeNotRegisteredError(typeName);
        }
        return createStreamSender<T>({
            endpoint,
            typeName,
            producer: this.producer,
            serializer: this.serializer,
        });
    }

    openWritableStream<T extends Message>(endpoint: string, typeName: string): WritableStream<T> {
        return senderToWritableStream<T>(this.openStream<T>(endpoint, typeName));
    }

    handleStream<T extends Message>(
        messageType: string,
        handler: (stream: AsyncIterable<T>) => Promise<void>,
    ): Bus {
        this.registerMessage(messageType);
        this._streamRegistry.registerHandler(messageType, handler);
        return this;
    }

    async start(): Promise<void> {
        if (this._stopped) {
            throw new Error('bus is stopped; create a new instance to resume');
        }
        if (this._started) return;
        const hasProcesses = this._processRegistry.hasAny();
        // Each process registration carries its own saga/timeout store, so the branch resolves the
        // correct store per message — no single shared runtime.
        const sagaBranch = hasProcesses
            ? (envelope: Envelope, message: object, signal: AbortSignal) =>
                  runSagaBranch(envelope, message, signal, {
                      processes: this._processRegistry,
                      bus: this,
                      logger: this.logger,
                  })
            : undefined;
        const aggregatorBranch = this._aggregatorRegistry.hasAny()
            ? (envelope: Envelope, message: object, signal: AbortSignal) =>
                  runAggregatorBranch(envelope, message as Message, signal, {
                      registry: this._aggregatorRegistry,
                      logger: this.logger,
                  })
            : undefined;
        const routingForward = async (envelope: Envelope, handlerSucceeded: boolean) => {
            await forwardRoutingSlipIfPresent({
                envelope,
                handlerSucceeded,
                producer: this.producer,
                logger: this.logger,
            });
            return true;
        };
        const streamBranch = (envelope: Envelope) =>
            runStreamBranch(envelope, {
                registry: this._streamRegistry,
                serializer: this.serializer,
                logger: this.logger,
            });
        const dispatcher = createDispatcher({
            bus: this,
            logger: this.logger,
            registry: this.registry,
            serializer: this.serializer,
            handlers: this.handlers,
            pipelines: this.pipelines,
            requestReplyManager: this.requestReplyManager,
            streamBranch,
            sagaBranch,
            aggregatorBranch,
            routingForward,
        });
        for (const timeoutStore of this._processRegistry.distinctTimeoutStores()) {
            const poller = new TimeoutPoller({
                store: timeoutStore,
                intervalMs: this.opts.timeoutPollIntervalMs ?? 1000,
                logger: this.logger,
                publish: async (messageType, body) => {
                    if (!this.registry.resolve(messageType)) {
                        this.registerMessage(messageType);
                    }
                    // Deliver the timeout point-to-point to this bus's own queue rather than to a fanout
                    // exchange. The owning saga always consumes from this queue, so delivery never depends
                    // on a type-exchange binding existing (which it would not for a type first seen at poll
                    // time) — the message can never be silently published into a binding-less exchange.
                    await this.send(messageType, body as Message, { endpoint: this.queue });
                },
            });
            poller.start();
            this.timeoutPollers.push(poller);
        }
        if (this._aggregatorRegistry.hasAny()) {
            this.aggregatorFlushTimer = new AggregatorFlushTimer({
                registry: this._aggregatorRegistry,
                intervalMs: this.opts.aggregatorFlushIntervalMs ?? 250,
                leaseMs: 30_000,
                logger: this.logger,
            });
            this.aggregatorFlushTimer.start();
        }
        const withHeartbeat: ConsumeCallback = async (env, signal) => {
            const decoded: Envelope = {
                ...env,
                headers: decodeWireHeaders(env.headers as Record<string, unknown>),
            };
            const result = await dispatcher(decoded, signal);
            this._lastConsumedAt = new Date();
            return result;
        };

        const finalCallback = this.opts.consumeWrapper?.(withHeartbeat) ?? withHeartbeat;
        await this.consumer.start(this.queue, this.registry.allRegisteredNames(), finalCallback);
        this._started = true;
    }

    async stop(_signal?: AbortSignal): Promise<void> {
        if (this._stopped) return;
        this._stopped = true;
        // Order matters: drain the consumer FIRST so in-flight handlers can finish their reply
        // paths through the still-live RequestReplyManager. Only after the consumer has stopped
        // accepting new work do we tear down the manager (which rejects every remaining pending
        // request — by then there shouldn't be any in-flight messages still expecting replies).
        await this.consumer.stop();
        await this.consumer[Symbol.asyncDispose]();
        if (this.timeoutPollers.length > 0) {
            await Promise.all(this.timeoutPollers.map((p) => p.stop()));
            this.timeoutPollers = [];
        }
        if (this.aggregatorFlushTimer) {
            await this.aggregatorFlushTimer.stop();
            this.aggregatorFlushTimer = undefined;
        }
        this.requestReplyManager.shutdown(new InvalidOperationError('bus is stopped'));
        await this._streamRegistry.drain();
        await this.producer[Symbol.asyncDispose]();
    }

    async [Symbol.asyncDispose](): Promise<void> {
        await this.stop();
    }
}

export function createBus(options: BusOptions): Bus {
    return new BusImpl(options);
}

// `ReplyOptions` re-exported here for surface-stability when Task 12+ extends the bus.
export type { ReplyOptions };
