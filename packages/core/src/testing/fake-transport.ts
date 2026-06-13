import type { Envelope } from '../envelope.js';
import type {
    ConsumeCallback,
    ConsumeResult,
    ITransportConsumer,
    ITransportProducer,
} from '../transport.js';

export interface OutboxEntry {
    readonly operation: 'publish' | 'send' | 'sendBytes';
    readonly typeName: string;
    readonly endpoint?: string;
    readonly body: Uint8Array;
    readonly headers: Readonly<Record<string, string>>;
    readonly routingKey?: string;
    readonly routingSlipHopsCompleted?: number;
}

export interface FakeTransport {
    readonly producer: ITransportProducer;
    readonly consumer: ITransportConsumer;
    readonly outbox: ReadonlyArray<OutboxEntry>;
    deliver(envelope: Envelope): Promise<ConsumeResult>;
    cancelByBroker(): void;
    disconnect(): void;
    reconnect(): void;
}

export interface FakeTransportOptions {
    readonly supportsRoutingKey?: boolean;
    readonly maxMessageSize?: number;
}

export function fakeTransport(opts: FakeTransportOptions = {}): FakeTransport {
    const outbox: OutboxEntry[] = [];
    let callback: ConsumeCallback | undefined;
    let connected = true;
    let cancelledByBroker = false;
    let stopped = false;
    const ac = new AbortController();

    const producer: ITransportProducer = {
        get isHealthy() {
            return connected;
        },
        supportsRoutingKey: opts.supportsRoutingKey ?? false,
        maxMessageSize: opts.maxMessageSize ?? Number.POSITIVE_INFINITY,
        async publish(typeName, body, options) {
            outbox.push({
                operation: 'publish',
                typeName,
                body,
                headers: { ...(options?.headers ?? {}) },
                routingKey: opts.supportsRoutingKey ? options?.routingKey : undefined,
            });
        },
        async send(endpoint, typeName, body, options) {
            outbox.push({
                operation: 'send',
                typeName,
                endpoint,
                body,
                headers: { ...(options?.headers ?? {}) },
                routingSlipHopsCompleted: options?.routingSlipHopsCompleted,
            });
        },
        async sendBytes(endpoint, typeName, body, options) {
            outbox.push({
                operation: 'sendBytes',
                typeName,
                endpoint,
                body,
                headers: { ...(options?.headers ?? {}) },
            });
        },
        async [Symbol.asyncDispose]() {
            // idempotent no-op
        },
    };

    const consumer: ITransportConsumer = {
        get isConnected() {
            return connected && !cancelledByBroker;
        },
        get isStopped() {
            return stopped;
        },
        get isCancelledByBroker() {
            return cancelledByBroker;
        },
        async start(_queue, _types, cb) {
            callback = cb;
        },
        async stop() {
            stopped = true;
            ac.abort();
        },
        async [Symbol.asyncDispose]() {
            stopped = true;
        },
    };

    return {
        producer,
        consumer,
        get outbox() {
            return outbox;
        },
        async deliver(envelope) {
            if (!callback) {
                throw new Error('fakeTransport.deliver called before consumer.start');
            }
            return callback(envelope, ac.signal);
        },
        cancelByBroker() {
            cancelledByBroker = true;
            connected = false;
        },
        disconnect() {
            connected = false;
        },
        reconnect() {
            connected = true;
        },
    };
}

export const fakeProducer = (opts?: FakeTransportOptions): ITransportProducer =>
    fakeTransport(opts).producer;
export const fakeConsumer = (opts?: FakeTransportOptions): ITransportConsumer =>
    fakeTransport(opts).consumer;
