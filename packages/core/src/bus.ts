import { MessageTypeNotRegisteredError } from './errors.js';
import { FilterPipeline } from './filter-pipeline.js';
import { createDispatcher } from './handlers/dispatch.js';
import type { Handler } from './handlers/index.js';
import { HandlerRegistry } from './handlers/registry.js';
import { type Logger, consoleLogger } from './logger.js';
import type { Message } from './message.js';
import type { PublishOptions } from './options/publish.js';
import type { ReplyOptions } from './options/reply.js';
import type { RequestOptions } from './options/request.js';
import type { SendOptions } from './options/send.js';
import type {
  FilterRegistration,
  MiddlewareRegistration,
  PipelineStage,
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

  publish<T extends Message>(
    _typeName: string,
    _message: T,
    _options?: PublishOptions,
  ): Promise<void> {
    throw new Error('publish() is implemented in Task 12');
  }

  send<T extends Message>(_typeName: string, _message: T, _options: SendOptions): Promise<void> {
    throw new Error('send() is implemented in Task 12');
  }

  sendToMany<T extends Message>(
    _typeName: string,
    _message: T,
    _endpoints: readonly string[],
    _options?: Omit<SendOptions, 'endpoint'>,
  ): Promise<void> {
    throw new Error('sendToMany() is implemented in Task 12');
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
