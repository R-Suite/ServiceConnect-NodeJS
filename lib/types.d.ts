/// <reference types="node" />
import { Bus } from "./index";
export declare type ServiceConnectConfig = {
    amqpSettings: {
        queue: {
            name: string;
            durable?: boolean;
            exclusive?: boolean;
            autoDelete?: boolean;
            noAck?: boolean;
            maxPriority?: number;
        };
        ssl?: {
            enabled?: boolean;
            key?: string;
            passphrase?: string;
            cert?: string;
            ca?: string[];
            pfx?: string;
            fail_if_no_peer_cert?: boolean;
            verify?: string;
        };
        host?: string;
        retryDelay?: number;
        maxRetries?: number;
        errorQueue?: string;
        auditQueue?: string;
        auditEnabled?: boolean;
        prefetch?: number;
    };
    filters?: {
        after?: MessageFilter[];
        before?: MessageFilter[];
        outgoing?: MessageFilter[];
    };
    handlers?: {
        [MessageType: string]: MessageHandler[];
    };
    client?: IClient;
    logger?: ILogger;
};
export declare type BusConfig = {
    amqpSettings: {
        queue: {
            name: string;
            durable: boolean;
            exclusive: boolean;
            autoDelete: boolean;
            noAck: boolean;
            maxPriority: number | null;
        };
        ssl?: {
            enabled: boolean;
            key?: string;
            passphrase?: string;
            cert?: string;
            ca?: string[];
            pfx?: string;
            fail_if_no_peer_cert: boolean;
            verify: string;
        };
        host: string;
        retryDelay: number;
        maxRetries: number;
        errorQueue: string;
        auditQueue: string;
        auditEnabled: boolean;
        prefetch: number;
    };
    filters: {
        after: MessageFilter[];
        before: MessageFilter[];
        outgoing: MessageFilter[];
    };
    handlers: {
        [MessageType: string]: MessageHandler[];
    };
    client: IClient;
    logger?: ILogger;
};
export declare type Message = {
    CorrelationId: string;
    [k: string]: unknown;
};
export declare type MessageHandler = (message: Message, headers?: {
    [k: string]: unknown;
}, type?: string, replyCallback?: ReplyCallback) => void | Promise<void>;
export declare type MessageFilter = (message: Message, headers?: {
    [k: string]: unknown;
}, type?: string, bus?: Bus) => boolean | Promise<boolean>;
export declare type ConsumeMessageCallback = (message: Message, headers: {
    [k: string]: unknown;
}, type: string) => Promise<void>;
export declare type ReplyCallback = (type: string, message: Message) => Promise<void>;
export interface IClient {
    connect: () => Promise<void>;
    consumeType: (type: string) => Promise<void>;
    removeType: (type: string) => Promise<void>;
    send: (endpoint: string | string[], type: string, message: Message, headers: {
        [k: string]: unknown;
    }) => Promise<void>;
    publish: (type: string, message: Message, headers: {
        [k: string]: unknown;
    }) => Promise<void>;
    close: () => Promise<void>;
    isConnected: () => Promise<boolean>;
}
export interface IBus {
    init(): Promise<void>;
    addHandler(type: string, callback: MessageHandler): Promise<void>;
    removeHandler(type: string, callback: MessageHandler): Promise<void>;
    isHandled(type: string): boolean;
    send(endpoint: string | string[], type: string, message: Message, headers?: {
        [k: string]: unknown;
    }): Promise<void>;
    publish(type: string, message: Message, headers?: {
        [k: string]: unknown;
    }): Promise<void>;
    sendRequest(endpoint: string | string[], type: string, message: Message, callback: MessageHandler, headers?: {
        [k: string]: unknown;
    }): Promise<void>;
    publishRequest(type: string, message: Message, callback: MessageHandler, expected?: number | null, timeout?: number | null, headers?: {
        [k: string]: unknown;
    }): Promise<void>;
    close(): Promise<void>;
    client: IClient | null;
    initialized: boolean;
    isConnected: () => Promise<boolean>;
}
export declare type RequestReplyCallback = {
    endpointCount: number;
    processedCount: number;
    callback: MessageHandler;
    timeout?: NodeJS.Timeout;
};
export interface ILogger {
    info: (message: string) => void;
    error: (message: string, error: Error) => void;
}
