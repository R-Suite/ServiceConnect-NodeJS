import type { Envelope } from './envelope.js';

export interface ConsumeResult {
    readonly success: boolean;
    readonly notHandled: boolean;
    readonly error?: Error;
    readonly terminalFailure: boolean;
}

export type ConsumeCallback = (envelope: Envelope, signal: AbortSignal) => Promise<ConsumeResult>;

export interface ITransportProducer extends AsyncDisposable {
    readonly isHealthy: boolean;
    readonly supportsRoutingKey: boolean;
    readonly maxMessageSize: number;

    publish(
        typeName: string,
        body: Uint8Array,
        options?: { headers?: Readonly<Record<string, string>>; routingKey?: string },
        signal?: AbortSignal,
    ): Promise<void>;

    send(
        endpoint: string,
        typeName: string,
        body: Uint8Array,
        options?: {
            headers?: Readonly<Record<string, string>>;
            routingSlipHopsCompleted?: number;
        },
        signal?: AbortSignal,
    ): Promise<void>;

    sendBytes(
        endpoint: string,
        typeName: string,
        body: Uint8Array,
        options?: { headers?: Readonly<Record<string, string>> },
        signal?: AbortSignal,
    ): Promise<void>;
}

export interface ITransportConsumer extends AsyncDisposable {
    readonly isConnected: boolean;
    readonly isStopped: boolean;
    readonly isCancelledByBroker: boolean;

    start(
        queueName: string,
        messageTypes: readonly string[],
        callback: ConsumeCallback,
        signal?: AbortSignal,
    ): Promise<void>;

    stop(signal?: AbortSignal): Promise<void>;
}
