import type { Bus } from './index';
/**
 * Branded type for message IDs to ensure type safety
 */
export type MessageId = string & {
    __brand: 'MessageId';
};
/**
 * Branded type for correlation IDs
 */
export type CorrelationId = string & {
    __brand: 'CorrelationId';
};
/**
 * Branded type for endpoints
 */
export type Endpoint = string & {
    __brand: 'Endpoint';
};
/**
 * Base message interface.
 * All messages must have a CorrelationId.
 */
export interface Message {
    CorrelationId: CorrelationId;
    [key: string]: unknown;
}
/**
 * Standard message headers used throughout the system
 */
export interface MessageHeaders {
    DestinationAddress?: string;
    MessageId?: MessageId;
    MessageType?: 'Send' | 'Publish';
    SourceAddress?: string;
    TimeSent?: string;
    TypeName?: string;
    FullTypeName?: string;
    ConsumerType?: string;
    Language?: string;
    RequestMessageId?: MessageId;
    ResponseMessageId?: MessageId;
    Priority?: number;
    RetryCount?: number;
    Exception?: unknown;
    TimeReceived?: string;
    TimeProcessed?: string;
    DestinationMachine?: string;
    [key: string]: unknown;
}
/**
 * Handler function type for message processing
 */
export type MessageHandler<T extends Message> = (message: T, headers: MessageHeaders, type: string, replyCallback?: ReplyCallback<Message>) => void | Promise<void>;
/**
 * Filter function type for message filtering
 */
export type MessageFilter<T extends Message> = (message: T, headers: MessageHeaders, type: string, bus: Bus) => boolean | Promise<boolean>;
/**
 * Callback for consuming raw messages from the transport
 */
export type ConsumeMessageCallback = (message: Message, headers: MessageHeaders, type: string) => Promise<void>;
/**
 * Callback for replying to messages
 */
export type ReplyCallback<T extends Message> = (type: string, message: T) => Promise<void>;
/**
 * Queue configuration options
 */
export interface QueueConfig {
    name: string;
    durable?: boolean;
    exclusive?: boolean;
    autoDelete?: boolean;
    noAck?: boolean;
    maxPriority?: number;
    arguments?: Record<string, unknown>;
    retryQueueArguments?: Record<string, unknown>;
    utilityQueueArguments?: Record<string, unknown>;
}
/**
 * SSL/TLS configuration options
 */
export interface SSLConfig {
    enabled?: boolean;
    key?: string;
    passphrase?: string;
    cert?: string;
    ca?: string[];
    pfx?: string;
    fail_if_no_peer_cert?: boolean;
    verify?: string;
}
/**
 * AMQP-specific settings
 */
export interface AMQPSettings {
    queue: QueueConfig;
    ssl?: SSLConfig;
    host: string | string[];
    retryDelay: number;
    maxRetries: number;
    errorQueue: string;
    auditQueue: string;
    auditEnabled: boolean;
    prefetch: number;
}
/**
 * Message filter configuration
 */
export interface FilterConfig {
    after: MessageFilter<Message>[];
    before: MessageFilter<Message>[];
    outgoing: MessageFilter<Message>[];
}
/**
 * Handler configuration - maps message types to handlers
 */
export type HandlersConfig = Record<string, MessageHandler<Message>[]>;
/**
 * User-provided configuration (partial, will be merged with defaults)
 */
export interface ServiceConnectConfig {
    amqpSettings: {
        queue: QueueConfig;
        ssl?: SSLConfig;
        host?: string | string[];
        retryDelay?: number;
        maxRetries?: number;
        errorQueue?: string;
        auditQueue?: string;
        auditEnabled?: boolean;
        prefetch?: number;
    };
    filters?: Partial<FilterConfig>;
    handlers?: HandlersConfig;
    client?: new (config: BusConfig, callback: ConsumeMessageCallback) => IClient;
    logger?: ILogger;
}
/**
 * Complete configuration after merging with defaults
 */
export interface BusConfig {
    amqpSettings: AMQPSettings;
    filters: FilterConfig;
    handlers: HandlersConfig;
    client: new (config: BusConfig, callback: ConsumeMessageCallback) => IClient;
    logger?: ILogger;
}
/**
 * Transport client interface (RabbitMQ, etc.)
 */
export interface IClient {
    connect(): Promise<void>;
    consumeType(type: string): Promise<void>;
    removeType(type: string): Promise<void>;
    send<T extends Message>(endpoint: string | string[], type: string, message: T, headers: MessageHeaders): Promise<void>;
    publish<T extends Message>(type: string, message: T, headers: MessageHeaders): Promise<void>;
    close(): Promise<void>;
    isConnected(): Promise<boolean>;
}
/**
 * Public Bus interface
 */
export interface IBus {
    init(): Promise<void>;
    addHandler<T extends Message>(type: string, callback: MessageHandler<T>): Promise<void>;
    removeHandler<T extends Message>(type: string, callback: MessageHandler<T>): Promise<void>;
    isHandled(type: string): boolean;
    send<T extends Message>(endpoint: string | string[], type: string, message: T, headers?: Partial<MessageHeaders>): Promise<void>;
    publish<T extends Message>(type: string, message: T, headers?: Partial<MessageHeaders>): Promise<void>;
    sendRequest<T1 extends Message, T2 extends Message>(endpoint: string | string[], type: string, message: T1, callback: MessageHandler<T2>, headers?: Partial<MessageHeaders>): Promise<void>;
    publishRequest<T1 extends Message, T2 extends Message>(type: string, message: T1, callback: MessageHandler<T2>, expected?: number | null, timeout?: number | null, headers?: Partial<MessageHeaders>): Promise<void>;
    close(): Promise<void>;
    isConnected(): Promise<boolean>;
    client: IClient | null;
    initialized: boolean;
}
/**
 * Request/reply callback tracking
 */
export interface RequestReplyCallback<T extends Message> {
    endpointCount: number;
    processedCount: number;
    callback: MessageHandler<T>;
    timeout?: NodeJS.Timeout;
}
/**
 * Logger interface
 */
export interface ILogger {
    info(message: string): void;
    error(message: string, error?: unknown): void;
    warn?(message: string): void;
    debug?(message: string): void;
}
//# sourceMappingURL=types.d.ts.map