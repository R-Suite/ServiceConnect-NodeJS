// Bus
export { createBus } from './bus.js';
export type { Bus, BusOptions } from './bus.js';

// Message + headers
export { newCorrelationId, newMessageId } from './message.js';
export type { CorrelationId, Message, MessageHeaders, MessageId } from './message.js';

// Envelope
export type { Envelope } from './envelope.js';

// ConsumeContext
export { createConsumeContext } from './consume-context.js';
export type { ConsumeContext } from './consume-context.js';

// Handlers
export type { Handler, HandlerClass, HandlerFactory, HandlerFn } from './handlers/index.js';

// Pipeline
export { FilterAction, asFilter, asMiddleware } from './pipeline/index.js';
export type {
  Filter,
  FilterRegistration,
  Middleware,
  MiddlewareRegistration,
  PipelineContext,
  PipelineStage,
} from './pipeline/index.js';

// Options
export { DEFAULT_REQUEST_TIMEOUT_MS } from './options/request.js';
export type { PublishOptions } from './options/publish.js';
export type { ReplyOptions } from './options/reply.js';
export type { RequestOptions } from './options/request.js';
export type { SendOptions } from './options/send.js';

// Serialization
export { jsonSerializer } from './serialization/json.js';
export { createMessageTypeRegistry } from './serialization/registry.js';
export type {
  IMessageSerializer,
  IMessageTypeRegistry,
  MessageRegistration,
} from './serialization/registry.js';
export type { StandardSchemaV1 } from './serialization/standard-schema.js';

// Transport
export type {
  ConsumeCallback,
  ConsumeResult,
  ITransportConsumer,
  ITransportProducer,
} from './transport.js';

// Logger
export { consoleLogger } from './logger.js';
export type { LogLevel, Logger } from './logger.js';

// Errors
export {
  HandlerNotRegisteredError,
  InvalidOperationError,
  MessageTypeNotRegisteredError,
  OutgoingFiltersBlockedError,
  ServiceConnectError,
  TerminalDeserializationError,
  ValidationError,
} from './errors.js';

// Legacy probe constant — kept for the existing inter-package wiring test in @serviceconnect/rabbitmq
export const PACKAGE_NAME = '@serviceconnect/core' as const;
