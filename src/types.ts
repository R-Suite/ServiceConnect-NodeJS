import { Bus } from "./index"

export type ServiceConnectConfig = {
    amqpSettings: {
        queue: {
            name: string,
            durable?: boolean,
            exclusive?: boolean,
            autoDelete?: boolean,
            noAck?: boolean,
            maxPriority?: number
        },
        ssl?: {
            enabled?: boolean,
            key?: string,
            passphrase?: string,
            cert?: string,
            ca?: string[],
            pfx?: string,
            fail_if_no_peer_cert?: boolean,
            verify?: string
        },
        host?: string,
        retryDelay?: number,
        maxRetries?: number,
        errorQueue?: string,
        auditQueue?: string,
        auditEnabled?: boolean,
        prefetch?: number
    },
    filters?: {
      after?: MessageFilter<Message>[],
      before?: MessageFilter<Message>[],
      outgoing?: MessageFilter<Message>[]
    },
    handlers?: {
        [MessageType:string]: MessageHandler<Message>[]
    },
    client?: IClient,
    logger?: ILogger
}

export type BusConfig = {
    amqpSettings: {
        queue: {
            name: string,
            durable: boolean,
            exclusive: boolean,
            autoDelete: boolean,
            noAck: boolean,
            maxPriority: number | null
        },
        ssl?: {
            enabled: boolean,
            key?: string,
            passphrase?: string,
            cert?: string,
            ca?: string[],
            pfx?: string,
            fail_if_no_peer_cert: boolean,
            verify: string
        },
        host: string,
        retryDelay: number,
        maxRetries: number,
        errorQueue: string,
        auditQueue: string,
        auditEnabled: boolean,
        prefetch: number
    },
    filters: {
      after: MessageFilter<Message>[],
      before: MessageFilter<Message>[],
      outgoing: MessageFilter<Message>[]
    },
    handlers: {
        [MessageType:string]: MessageHandler<Message>[]
    },
    client: IClient,
    logger?: ILogger
}

export interface Message { 
    CorrelationId: string,
    [k:string]: unknown
}

export type MessageHandler<T extends Message> = (message : T, headers?: {[k:string]: unknown}, type?: string, replyCallback?: ReplyCallback<Message>) => void | Promise<void>
export type MessageFilter<T extends Message> = (message : T, headers?: {[k:string]: unknown}, type?: string, bus?: Bus) => boolean | Promise<boolean>
export type ConsumeMessageCallback = (message : Message, headers : {[k:string]: unknown}, type : string) => Promise<void>
export type ReplyCallback<T extends Message> = (type : string, message : T) => Promise<void>

export interface IClient  {
    connect: () => Promise<void>;
    consumeType: (type : string) => Promise<void>;
    removeType: (type : string) => Promise<void>;
    send: <T extends Message>(endpoint : string | string[], type : string, message : T, headers : {[k:string]: unknown}) => Promise<void>;
    publish: <T extends Message>(type : string, message : T, headers : {[k:string]: unknown}) => Promise<void>;
    close: () => Promise<void>,
    isConnected: () => Promise<boolean>
}

export interface IBus {
    init() : Promise<void>
    addHandler<T extends Message>(type : string, callback : MessageHandler<T>) : Promise<void>
    removeHandler<T extends Message>(type : string, callback : MessageHandler<T>) : Promise<void>
    isHandled(type : string) : boolean
    send<T extends Message>(endpoint : string | string[], type : string, message : T, headers?: {[k:string]: unknown}) : Promise<void>
    publish<T extends Message>(type: string, message: T, headers? : {[k:string]: unknown}) : Promise<void>
    sendRequest<T1 extends Message, T2 extends Message>(endpoint: string | string[], type : string, message : T1, callback : MessageHandler<T2>, headers? : {[k:string]: unknown}) : Promise<void>
    publishRequest<T1 extends Message, T2 extends Message>(type : string, message : T1, callback : MessageHandler<T2>, expected? : number | null, timeout? : number | null, headers? : {[k:string]: unknown}) : Promise<void>
    close() : Promise<void>
    client : IClient | null,
    initialized: boolean,
    isConnected: () => Promise<boolean>
}

export type RequestReplyCallback<T extends Message> = {
    endpointCount: number,
    processedCount: number,
    callback: MessageHandler<T>,
    timeout?: NodeJS.Timeout
}

export interface ILogger {
    info: (message : string) => void,
    error: (message : string, error : Error) => void
}
