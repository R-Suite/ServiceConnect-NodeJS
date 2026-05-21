import type { Envelope } from './envelope.js';
import {
  InvalidOperationError,
  MessageTypeNotRegisteredError,
  OutgoingFiltersBlockedError,
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
import {
  FilterAction,
  type FilterRegistration,
  type MiddlewareRegistration,
  type PipelineStage,
} from './pipeline/index.js';
import { jsonSerializer } from './serialization/json.js';
import { type IMessageTypeRegistry, createMessageTypeRegistry } from './serialization/registry.js';
import type { IMessageSerializer } from './serialization/serializer.js';
import type { StandardSchemaV1 } from './serialization/standard-schema.js';
import type { ITransportConsumer, ITransportProducer } from './transport.js';

export interface BusOptions {
  transport: { producer: ITransportProducer; consumer: ITransportConsumer };
  serializer?: IMessageSerializer;
  registry?: IMessageTypeRegistry;
  queue: { name: string };
  logger?: Logger;
  defaultRequestTimeout?: number;
}

export interface Bus extends AsyncDisposable {
  readonly queue: string;
  readonly isStarted: boolean;
  readonly isStopped: boolean;

  registerMessage<T extends Message>(
    typeName: string,
    options?: { schema?: StandardSchemaV1<T> },
  ): this;
  handle<T extends Message>(typeName: string, handler: Handler<T>): this;
  unhandle<T extends Message>(typeName: string, handler: Handler<T>): this;
  isHandled(typeName: string): boolean;
  use(stage: PipelineStage, ...items: Array<FilterRegistration | MiddlewareRegistration>): this;

  publish<T extends Message>(typeName: string, message: T, options?: PublishOptions): Promise<void>;
  send<T extends Message>(typeName: string, message: T, options: SendOptions): Promise<void>;
  sendToMany<T extends Message>(
    typeName: string,
    message: T,
    endpoints: readonly string[],
    options?: Omit<SendOptions, 'endpoint'>,
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

  start(): Promise<void>;
  stop(signal?: AbortSignal): Promise<void>;
}

class BusImpl implements Bus {
  readonly queue: string;
  private _started = false;
  private _stopped = false;

  private readonly producer: ITransportProducer;
  private readonly consumer: ITransportConsumer;
  private readonly registry: IMessageTypeRegistry;
  private readonly serializer: IMessageSerializer;
  private readonly logger: Logger;
  private readonly handlers = new HandlerRegistry();
  private readonly pipelines = {
    outgoing: new FilterPipeline('outgoing'),
    before: new FilterPipeline('beforeConsuming'),
    after: new FilterPipeline('afterConsuming'),
    onSuccess: new FilterPipeline('onConsumedSuccessfully'),
  };

  constructor(opts: BusOptions) {
    this.producer = opts.transport.producer;
    this.consumer = opts.transport.consumer;
    this.registry = opts.registry ?? createMessageTypeRegistry();
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
    const headers = stringifyHeaders(envelope.headers);
    await this.producer.publish(typeName, body, { headers, routingKey: options?.routingKey });
  }

  async send<T extends Message>(typeName: string, message: T, options: SendOptions): Promise<void> {
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
    const headers = stringifyHeaders(envelope.headers);
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
    const headers = stringifyHeaders(envelope.headers);
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

  private buildOutgoingEnvelope<T extends Message>(
    typeName: string,
    message: T,
    body: Uint8Array,
    callerHeaders?: Readonly<Record<string, string>>,
    destinationAddress?: string,
  ): Envelope {
    const headers: Record<string, unknown> = { ...(callerHeaders ?? {}) };
    headers.messageType = typeName;
    headers.correlationId = message.correlationId;
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

  sendRequest<TReq extends Message, TRep extends Message>(
    _typeName: string,
    _message: TReq,
    _options: RequestOptions,
  ): Promise<TRep> {
    throw new Error('not implemented; see Phase D');
  }

  sendRequestMulti<TReq extends Message, TRep extends Message>(
    _typeName: string,
    _message: TReq,
    _options: RequestOptions,
  ): Promise<TRep[]> {
    throw new Error('not implemented; see Phase D');
  }

  publishRequest<TReq extends Message, TRep extends Message>(
    _typeName: string,
    _message: TReq,
    _onReply: (reply: TRep) => void,
    _options?: RequestOptions,
  ): Promise<void> {
    throw new Error('not implemented; see Phase D');
  }

  async start(): Promise<void> {
    if (this._stopped) {
      throw new Error('bus is stopped; create a new instance to resume');
    }
    if (this._started) return;
    const dispatcher = createDispatcher({
      bus: this,
      logger: this.logger,
      registry: this.registry,
      serializer: this.serializer,
      handlers: this.handlers,
      pipelines: this.pipelines,
    });
    await this.consumer.start(this.queue, this.registry.allRegisteredNames(), dispatcher);
    this._started = true;
  }

  async stop(_signal?: AbortSignal): Promise<void> {
    if (this._stopped) return;
    this._stopped = true;
    await this.consumer.stop();
    await this.consumer[Symbol.asyncDispose]();
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

function stringifyHeaders(headers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    out[k] = typeof v === 'string' ? v : String(v);
  }
  return out;
}
