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
};
export declare type MessageHandler = (message: any, headers?: {
    [k: string]: unknown;
}, type?: string, replyCallback?: (type: string, message: any) => void) => void | Promise<void>;
export declare type MessageFilter = (message: any, headers?: {
    [k: string]: unknown;
}, type?: string, bus?: Bus) => boolean | Promise<boolean>;
export interface IClient extends Events {
    connect: () => void;
    consumeType: (type: string) => void;
    removeType: (type: string) => void;
    send: (endpoint: string | string[], type: string, message: object, headers: {
        [k: string]: unknown;
    }) => Promise<void>;
    publish: (type: string, message: object, headers: {
        [k: string]: unknown;
    }) => Promise<void>;
    close: () => Promise<void>;
}
export declare type RequestReplyCallback = {
    endpointCount: number;
    processedCount: number;
    callback: MessageHandler;
    timeout?: NodeJS.Timeout;
};
export declare type ConsumeMessageCallback = (message: any, headers: {
    [k: string]: unknown;
}, type: string) => Promise<void>;
export interface Events {
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    off(event: string | symbol, listener: (...args: any[]) => void): this;
    emit(event: string | symbol, ...args: any[]): boolean;
}
export interface IBus extends Events {
    init(): Promise<void>;
    addHandler(message: string, callback: MessageHandler): void;
    removeHandler(message: string, callback: MessageHandler): void;
    isHandled(message: string): boolean;
    send(endpoint: string | string[], type: string, message: any, headers?: {
        [k: string]: unknown;
    }): Promise<void>;
    publish(type: string, message: any, headers?: {
        [k: string]: unknown;
    }): Promise<void>;
    sendRequest(endpoint: string | string[], type: string, message: any, callback: MessageHandler, headers?: {
        [k: string]: unknown;
    }): Promise<void>;
    publishRequest(type: string, message: any, callback: MessageHandler, expected?: number | null, timeout?: number | null, headers?: {
        [k: string]: unknown;
    }): Promise<void>;
    close(): Promise<void>;
    client: IClient | null;
}
