import { randomUUID } from 'node:crypto';

export interface Message {
    correlationId: string;
}

export type MessageId = string & { readonly __brand: 'MessageId' };
export type CorrelationId = string & { readonly __brand: 'CorrelationId' };

export interface MessageHeaders {
    readonly messageId?: MessageId;
    readonly correlationId: CorrelationId;
    readonly messageType: string;
    readonly fullTypeName?: string;
    readonly destinationAddress?: string;
    readonly sourceAddress?: string;
    readonly timeSent?: string;
    readonly timeReceived?: string;
    readonly timeProcessed?: string;
    readonly responseMessageId?: MessageId;
    readonly requestMessageId?: MessageId;
    readonly routingKey?: string;
    readonly routingSlipHopsCompleted?: number;
    readonly priority?: number;
    readonly retryCount?: number;
    readonly [key: string]: unknown;
}

export function newCorrelationId(): CorrelationId {
    return randomUUID() as CorrelationId;
}

export function newMessageId(): MessageId {
    return randomUUID() as MessageId;
}
