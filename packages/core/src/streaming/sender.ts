import { randomUUID } from 'node:crypto';
import { InvalidOperationError } from '../errors.js';
import type { Message } from '../message.js';
import type { IMessageSerializer } from '../serialization/serializer.js';
import type { ITransportProducer } from '../transport.js';
import { StreamHeaders } from './stream-headers.js';

export interface StreamSender<T extends Message> {
    readonly streamId: string;
    sendChunk(chunk: T): Promise<void>;
    complete(): Promise<void>;
    fault(reason: string): Promise<void>;
}

export interface CreateStreamSenderDeps {
    endpoint: string;
    typeName: string;
    producer: ITransportProducer;
    serializer: IMessageSerializer;
}

export function createStreamSender<T extends Message>(
    deps: CreateStreamSenderDeps,
): StreamSender<T> {
    const streamId = randomUUID();
    let sequenceNumber = 0;
    let closed = false;

    function baseHeaders(): Record<string, string> {
        return {
            messageType: deps.typeName,
            [StreamHeaders.StreamId]: streamId,
            [StreamHeaders.SequenceNumber]: String(sequenceNumber),
            [StreamHeaders.IsStartOfStream]: sequenceNumber === 0 ? 'true' : 'false',
            [StreamHeaders.IsEndOfStream]: 'false',
        };
    }

    async function sendChunk(chunk: T): Promise<void> {
        if (closed) {
            throw new InvalidOperationError('stream sender is closed');
        }
        const headers = baseHeaders();
        const body = deps.serializer.serialize(chunk);
        await deps.producer.send(deps.endpoint, deps.typeName, body, { headers });
        sequenceNumber++;
    }

    async function complete(): Promise<void> {
        if (closed) return;
        closed = true;
        const headers = {
            ...baseHeaders(),
            [StreamHeaders.IsEndOfStream]: 'true',
        };
        await deps.producer.send(deps.endpoint, deps.typeName, new Uint8Array(), { headers });
    }

    async function fault(reason: string): Promise<void> {
        if (closed) return;
        closed = true;
        const headers = {
            ...baseHeaders(),
            [StreamHeaders.IsEndOfStream]: 'true',
            [StreamHeaders.StreamFault]: reason,
        };
        await deps.producer.send(deps.endpoint, deps.typeName, new Uint8Array(), { headers });
    }

    return { streamId, sendChunk, complete, fault };
}
