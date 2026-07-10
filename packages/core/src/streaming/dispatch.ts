import type { Envelope } from '../envelope.js';
import type { Logger } from '../logger.js';
import type { Message, MessageHeaders } from '../message.js';
import type { IMessageSerializer } from '../serialization/serializer.js';
import type { ConsumeResult } from '../transport.js';
import { StreamReceiver } from './receiver.js';
import { StreamHeaders } from './stream-headers.js';

export interface StreamHandlerRegistration<T extends Message> {
    readonly messageType: string;
    readonly handler: (stream: AsyncIterable<T>) => Promise<void>;
}

// Cap on remembered completed stream ids. Bounds memory while still recognizing redelivered
// chunks for streams that finished recently; the oldest ids are evicted past this many streams.
const MAX_COMPLETED_STREAM_IDS = 10_000;

export class StreamRegistry {
    private readonly byType = new Map<string, StreamHandlerRegistration<Message>>();
    private readonly receiversByStreamId = new Map<string, StreamReceiver<Message>>();
    private readonly handlerPromises = new Map<string, Promise<void>>();
    // Stream ids whose handler has already settled. A redelivered/late chunk for one of these must
    // be dropped, not used to spawn a phantom receiver that re-invokes the handler and hangs.
    // Insertion-ordered Set so we can evict the oldest once the cap is reached.
    private readonly completedStreamIds = new Set<string>();

    registerHandler<T extends Message>(
        messageType: string,
        handler: (stream: AsyncIterable<T>) => Promise<void>,
    ): void {
        this.byType.set(messageType, {
            messageType,
            handler: handler as (stream: AsyncIterable<Message>) => Promise<void>,
        });
    }

    registrationFor(messageType: string): StreamHandlerRegistration<Message> | undefined {
        return this.byType.get(messageType);
    }

    hasCompleted(streamId: string): boolean {
        return this.completedStreamIds.has(streamId);
    }

    private markCompleted(streamId: string): void {
        this.completedStreamIds.add(streamId);
        if (this.completedStreamIds.size > MAX_COMPLETED_STREAM_IDS) {
            const oldest = this.completedStreamIds.values().next().value;
            if (oldest !== undefined) this.completedStreamIds.delete(oldest);
        }
    }

    ensureReceiver(messageType: string, streamId: string): StreamReceiver<Message> | undefined {
        const reg = this.byType.get(messageType);
        if (!reg) return undefined;
        let receiver = this.receiversByStreamId.get(streamId);
        if (!receiver) {
            receiver = new StreamReceiver<Message>(streamId);
            this.receiversByStreamId.set(streamId, receiver);
            const promise = reg
                .handler(receiver)
                .catch(() => undefined)
                .finally(() => {
                    this.receiversByStreamId.delete(streamId);
                    this.handlerPromises.delete(streamId);
                    this.markCompleted(streamId);
                });
            this.handlerPromises.set(streamId, promise);
        }
        return receiver;
    }

    async drain(): Promise<void> {
        await Promise.all([...this.handlerPromises.values()]);
    }
}

export interface StreamBranchDeps {
    registry: StreamRegistry;
    serializer: IMessageSerializer;
    logger: Logger;
}

export interface StreamBranchOutcome {
    ran: boolean;
    result?: ConsumeResult;
}

export async function runStreamBranch(
    envelope: Envelope,
    deps: StreamBranchDeps,
): Promise<StreamBranchOutcome> {
    const headers = envelope.headers as MessageHeaders;
    const streamId = headers[StreamHeaders.StreamId];
    if (typeof streamId !== 'string') return { ran: false };

    const messageType = typeof headers.messageType === 'string' ? headers.messageType : '';
    const reg = deps.registry.registrationFor(messageType);
    if (!reg) return { ran: false };

    // Redelivered/late chunk for a stream that already completed: ack and drop. Recreating a
    // receiver here would spawn a phantom stream stuck at sequence 0 and hang drain()/bus.stop().
    if (deps.registry.hasCompleted(streamId)) {
        deps.logger.debug('stream chunk for an already-completed stream dropped', {
            streamId,
            messageType,
        });
        return { ran: true, result: { success: true, notHandled: false, terminalFailure: false } };
    }

    const receiver = deps.registry.ensureReceiver(messageType, streamId);
    if (!receiver) return { ran: false };

    const seqRaw = headers[StreamHeaders.SequenceNumber];
    const sequenceNumber = typeof seqRaw === 'string' ? Number(seqRaw) : 0;
    const isEnd = headers[StreamHeaders.IsEndOfStream] === 'true';
    const faultRaw = headers[StreamHeaders.StreamFault];
    const faulted = typeof faultRaw === 'string' ? faultRaw : undefined;

    let chunk: Message | undefined;
    if (!isEnd && faulted === undefined) {
        chunk = deps.serializer.deserialize(envelope.body, messageType) as Message;
    }

    try {
        receiver.push({ chunk, sequenceNumber, isEnd, faulted });
    } catch (err) {
        const wrapped = err instanceof Error ? err : new Error(String(err));
        deps.logger.warn('stream receiver push threw; chunk dropped', {
            streamId,
            error: wrapped.message,
        });
        return {
            ran: true,
            result: { success: false, notHandled: false, error: wrapped, terminalFailure: true },
        };
    }

    return {
        ran: true,
        result: { success: true, notHandled: false, terminalFailure: false },
    };
}
